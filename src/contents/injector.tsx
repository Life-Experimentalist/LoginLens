import React, { useEffect, useState } from 'react'
import type { PlasmoCSConfig, PlasmoGetStyle } from 'plasmo'
import { useStorage } from '@plasmohq/storage/hook'
import { extensionStorage } from '../core/storage/config'
import { isHostOrSubdomainOf, matchesDomain } from '../core/utils/domain'
import { safeSendMessage } from '../core/utils/runtime'
import cssText from 'data-text:~/style.css'
import type { DomainEntry, IdentityProfile } from '../core/storage/schema'

// http and https rather than <all_urls>: the overlay only has anything to do
// on a page with a login form, and <all_urls> additionally covers file:// and
// ftp://, which widens what the extension declares without widening what it
// can usefully do. http:// stays in because vault entries for localhost dev
// servers are a first-class case.
export const config: PlasmoCSConfig = {
  matches: ['http://*/*', 'https://*/*'],
  all_frames: true,
  run_at: 'document_start'
}

export const getStyle: PlasmoGetStyle = () => {
  const style = document.createElement('style')
  style.textContent = cssText
  return style
}

// Plasmo's default is `{ mode: 'open' }`, which leaves `host.shadowRoot`
// readable by page script. This overlay renders the identities the user has
// saved for the site it is displayed on, so open mode hands every page a list
// of the accounts its visitor holds there — and a reliable way to detect that
// this extension is installed at all, which the note below is about avoiding.
export const createShadowRoot = (host: HTMLElement) =>
  host.attachShadow({ mode: 'closed' })

/**
 * The one place that decides whether an input is part of a login. Used both to
 * detect that this frame has a form worth docking on, and to pick a target
 * when the user clicks Use without having focused anything.
 */
const isLoginField = (input: HTMLInputElement): boolean => {
  const type = input.type.toLowerCase()
  if (type === 'password') return true
  if (type !== 'text' && type !== 'email') return false
  const name = input.name.toLowerCase()
  const id = input.id.toLowerCase()
  return (
    name.includes('user') ||
    name.includes('email') ||
    name.includes('login') ||
    id.includes('user') ||
    id.includes('email')
  )
}

const findLoginField = (root: Document): HTMLInputElement | null => {
  const inputs = Array.from(
    root.querySelectorAll('input')
  ) as HTMLInputElement[]
  return inputs.find((input) => isLoginField(input)) ?? null
}

const LoginLensOverlay = () => {
  const [savedAccounts] = useStorage<DomainEntry[]>(
    { key: 'saved_accounts', instance: extensionStorage },
    []
  )
  const [activeInput, setActiveInput] = useState<{
    rect: DOMRect
    element: HTMLInputElement
    isPassword: boolean
  } | null>(null)
  const [effectiveDomain, setEffectiveDomain] = useState<string | null>(null)
  // The dock used to appear only while a login field held focus and vanished
  // on the first scroll, so it was gone exactly when the user went looking for
  // it. Now the presence of a login form in this frame is what keeps it up.
  const [hasLoginForm, setHasLoginForm] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  // Component state, not sessionStorage: sessionStorage writes into the page's
  // own origin, where page script can read the key back. That is an
  // installed-marker, which is the exact thing the note below refuses to
  // stamp. A dismissal that lasts until reload is enough.
  const [dismissed, setDismissed] = useState(false)

  // NOTE: this content script runs on <all_urls>, so it deliberately does NOT
  // announce that LoginLens is installed. Stamping `data-loginlens-installed`
  // on every page the user visits hands every site a stable fingerprinting
  // signal that this browser runs a credential-adjacent extension — and it
  // does that whether or not the site has anything to do with LoginLens.
  //
  // The announcement lives in `contents/bridge-content.ts`, whose `matches`
  // are limited to the LoginLens site and localhost, which is the only place
  // anything needs to detect it.

  // Auto-reload webpage in development mode if extension context is invalidated by HMR
  useEffect(() => {
    const handleDevError = (event: ErrorEvent) => {
      if (
        process.env.NODE_ENV === 'development' &&
        event.message?.includes('Extension context invalidated')
      ) {
        console.info('[LoginLens Dev] Extension reloaded — refreshing tab...')
        window.location.reload()
      }
    }
    window.addEventListener('error', handleDevError)
    return () => window.removeEventListener('error', handleDevError)
  }, [])

  // On mount, ask the background service worker for the real effective domain
  useEffect(() => {
    safeSendMessage(
      { type: 'GET_TAB_CONTEXT', tabId: undefined },
      (response: any) => {
        if (response?.effectiveDomain) {
          setEffectiveDomain(response.effectiveDomain)
        } else {
          setEffectiveDomain(window.location.hostname.replace(/^www\./, ''))
        }
      }
    )

    // Scrape OAuth Identity if we are on a known provider
    const hostname = window.location.hostname
    let identity = null

    // Exact-or-subdomain, never a substring: `github.com.example.net` is a
    // domain anybody can register, and each branch below reads an identity out
    // of page-controlled DOM and reports it as the user's provider account.
    if (isHostOrSubdomainOf(hostname, 'github.com')) {
      const meta = document.querySelector('meta[name="user-login"]')
      if (meta) identity = meta.getAttribute('content')
    } else if (isHostOrSubdomainOf(hostname, 'accounts.google.com')) {
      // Look for Google's data-email attribute which is often present on the account chooser
      const emailElem = document.querySelector('[data-email]')
      if (emailElem) {
        identity = emailElem.getAttribute('data-email')
      } else {
        // Fallback: look for the active logged-in email in the top right or profile card
        const emailMatch = document.body.innerText.match(
          /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/
        )
        if (emailMatch) identity = emailMatch[0]
      }
    } else if (
      isHostOrSubdomainOf(hostname, 'microsoft.com') ||
      isHostOrSubdomainOf(hostname, 'live.com')
    ) {
      const emailElem =
        document.querySelector('.identity') ||
        document.querySelector('[data-bind*="session.displayHint"]')
      if (emailElem) identity = emailElem.textContent?.trim()
    }

    if (identity) {
      safeSendMessage({ type: 'SET_OAUTH_IDENTITY', identity })
    } else {
      // Setup a MutationObserver to catch it if it loads asynchronously
      const observer = new MutationObserver(() => {
        let asyncIdentity = null
        if (isHostOrSubdomainOf(hostname, 'accounts.google.com')) {
          const emailElem = document.querySelector('[data-email]')
          if (emailElem) asyncIdentity = emailElem.getAttribute('data-email')
        }
        if (asyncIdentity) {
          safeSendMessage({
            type: 'SET_OAUTH_IDENTITY',
            identity: asyncIdentity
          })
          observer.disconnect()
        }
      })
      observer.observe(document.body, { childList: true, subtree: true })
      setTimeout(() => observer.disconnect(), 10000) // Stop observing after 10s
    }
  }, [])

  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT') {
        const input = target as HTMLInputElement
        if (isLoginField(input)) {
          setActiveInput({
            rect: input.getBoundingClientRect(),
            element: input,
            isPassword: input.type.toLowerCase() === 'password'
          })
        } else {
          setActiveInput(null)
        }
      }
    }

    // No click-outside and no scroll teardown any more. Both cleared
    // activeInput, which used to hide the whole dock; the dock now stays put
    // and activeInput only says which field an autofill should land in.
    document.addEventListener('focusin', handleFocusIn)
    return () => document.removeEventListener('focusin', handleFocusIn)
  }, [])

  // Does this frame contain a login form? The check is per-frame rather than
  // top-frame-only on purpose: `all_frames` is on because plenty of login
  // forms live in an iframe, and gating on the form means a frame without one
  // renders nothing, so there is no duplicate dock either way.
  useEffect(() => {
    const scan = () => {
      if (!document.body) return
      setHasLoginForm(Boolean(findLoginField(document)))
    }

    let queued = 0
    const debouncedScan = () => {
      if (queued) return
      queued = window.setTimeout(() => {
        queued = 0
        scan()
      }, 400)
    }

    // run_at is document_start, so at this point there is usually no body yet.
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', scan, { once: true })
    } else {
      scan()
    }

    // Single-page apps swap the login form in after load, so one scan is not
    // enough. The observer is debounced because a busy page mutates constantly.
    const observer = new MutationObserver(debouncedScan)
    const startObserving = () => {
      if (document.body) observer.observe(document.body, { childList: true, subtree: true })
    }
    if (document.body) startObserving()
    else document.addEventListener('DOMContentLoaded', startObserving, { once: true })

    return () => {
      observer.disconnect()
      if (queued) clearTimeout(queued)
    }
  }, [])

  if (!effectiveDomain) return null
  if (!hasLoginForm || dismissed) return null

  // Use root-domain matching via the effective domain resolved by background tracker
  const domainData = savedAccounts?.find((d) =>
    matchesDomain(d.domain, effectiveDomain)
  )

  if (!domainData || domainData.accounts.length === 0) return null

  const autofill = (acc: IdentityProfile) => {
    const username = acc.identities[0]

    // The dock is up whether or not a field has focus, so pick one if the
    // user clicked Use without touching the form first.
    const fallback = findLoginField(document)
    const target = activeInput ?? (fallback
      ? {
          element: fallback,
          isPassword: fallback.type.toLowerCase() === 'password',
          rect: fallback.getBoundingClientRect()
        }
      : null)
    if (!target) return

    // Simulate setting value
    const setInputValue = (input: HTMLInputElement, value: string) => {
      input.value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }

    if (target.isPassword) {
      // Find the preceding username field to fill if possible
      setInputValue(target.element, '********') // We don't store passwords yet per schema, so mockup
      const form = target.element.closest('form')
      if (form) {
        const textInputs = Array.from(
          form.querySelectorAll('input[type="text"], input[type="email"]')
        ) as HTMLInputElement[]
        if (textInputs.length > 0) {
          setInputValue(textInputs[0], username)
        }
      }
    } else {
      setInputValue(target.element, username)
      // Try to find a password field in the same form
      const form = target.element.closest('form')
      if (form) {
        const passInput = form.querySelector(
          'input[type="password"]'
        ) as HTMLInputElement
        if (passInput) {
          setInputValue(passInput, '********') // Mock password fill
        }
      }
    }

    setActiveInput(null)
  }

  // Collapsed, it is a pill in the corner rather than nothing at all, so the
  // way back is always visible.
  if (collapsed) {
    return (
      <div
        id="loginlens-shadow"
        className="fixed bottom-4 left-4 z-[2147483647] font-sans"
      >
        <button
          onClick={() => setCollapsed(false)}
          className="bg-card text-card-foreground border border-border shadow-2xl rounded-full pl-3 pr-3 py-2 text-xs font-semibold flex items-center gap-2 hover:border-primary/50 transition-colors"
        >
          LoginLens
          <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded-full text-[10px]">
            {domainData.accounts.length}
          </span>
        </button>
      </div>
    )
  }

  return (
    <div
      id="loginlens-shadow"
      className="fixed bottom-4 left-4 z-[2147483647] bg-card text-card-foreground p-3 rounded-xl shadow-2xl font-sans text-sm border border-border w-72"
    >
      <div className="font-semibold mb-3 flex items-center justify-between text-muted-foreground border-b border-border pb-2">
        <span className="flex items-center gap-2">
          LoginLens
          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
            {domainData.accounts.length} found
          </span>
        </span>
        <span className="flex items-center gap-1">
          <button
            onClick={() => setCollapsed(true)}
            title="Collapse"
            aria-label="Collapse LoginLens"
            className="px-1.5 leading-none text-muted-foreground hover:text-foreground transition-colors"
          >
            &minus;
          </button>
          <button
            onClick={() => setDismissed(true)}
            title="Hide until this page reloads"
            aria-label="Hide LoginLens on this page"
            className="px-1.5 leading-none text-muted-foreground hover:text-foreground transition-colors"
          >
            &times;
          </button>
        </span>
      </div>
      <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
        {domainData.accounts.map((acc, idx) => (
          <div
            key={idx}
            className="flex justify-between items-center bg-muted/50 p-2 rounded-lg border border-border/50 hover:border-primary/50 transition-colors cursor-pointer group"
          >
            <div className="truncate pr-2 flex flex-col justify-center">
              <div className="flex items-center gap-1.5 mb-0.5">
                {acc.login_method.type === 'oauth' ? (
                  <span
                    title="OAuth Provider"
                    className="flex items-center justify-center bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 rounded px-1.5 py-0.5 shrink-0"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="2" y1="12" x2="22" y2="12"></line>
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                    </svg>
                  </span>
                ) : (
                  <span
                    title="Password Login"
                    className="flex items-center justify-center bg-primary/10 text-primary border border-primary/20 rounded px-1.5 py-0.5 shrink-0"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z"></path>
                      <circle cx="16.5" cy="7.5" r=".5"></circle>
                    </svg>
                  </span>
                )}
                <p className="font-medium truncate text-foreground">
                  {acc.identities[0]}
                </p>
              </div>
              <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider font-semibold">
                {acc.login_method.type === 'oauth'
                  ? `VIA ${acc.login_method.provider}`
                  : acc.label || 'LOCAL'}
              </p>
            </div>
            <button
              onClick={(e) => {
                e.preventDefault()
                autofill(acc)
              }}
              className="px-3 py-1.5 bg-background border border-border text-foreground rounded-md font-medium group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-colors text-xs"
            >
              Use
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default LoginLensOverlay
