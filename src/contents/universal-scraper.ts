import type { PlasmoCSConfig } from 'plasmo'
import { HandlerRegistry } from '../core/scrapers/HandlerRegistry'
import { GoogleHandler } from '../core/scrapers/handlers/GoogleHandler'
import { nativeStorage } from '../core/storage/native'
import { log } from '../core/utils/logger'
import {
  detectOAuthProviderFromUrl,
  detectOAuthPurpose,
  normalizeOAuthProvider
} from '../core/utils/domain'
import { safeSendMessage } from '../core/utils/runtime'
import type {
  GlobalOAuthAccount
} from '../core/storage/schema'

export const config: PlasmoCSConfig = {
  // See the note in injector.tsx — http/https rather than <all_urls>, since
  // file:// and ftp:// pages have no login flow to observe.
  matches: ['http://*/*', 'https://*/*'],
  all_frames: false // Only run on top-level frames to avoid duplicate recording
}

HandlerRegistry.register(GoogleHandler)

/**
 * Hard ceiling on the global OAuth registry.
 *
 * This content script runs on every page and harvests identities out of
 * page-controlled DOM. Without a cap, a page that renders a few thousand
 * synthetic email addresses could inflate the registry until it exhausts the
 * chrome.storage.local quota and blocks legitimate writes.
 */
const MAX_REGISTRY_ENTRIES = 500

// ─── OAuth Provider Detection ────────────────────────────────────────────────

interface OAuthInfo {
  provider: string
  redirectDomain?: string
}

function extractOAuthInfo(): OAuthInfo | null {
  let parsed: URL
  try {
    parsed = new URL(window.location.href)
  } catch {
    return null
  }
  const params = parsed.searchParams

  // Provider detection lives in core/utils/domain so it can be tested against
  // the lookalike URLs it exists to reject, away from this module's DOM
  // side effects.
  const provider = detectOAuthProviderFromUrl(parsed.href)
  if (!provider) return null

  // Extract the app (redirect_uri) that's requesting access
  const redirectUri =
    params.get('redirect_uri') ||
    params.get('redirect_url') ||
    params.get('callback_url')
  let redirectDomain: string | undefined
  if (redirectUri) {
    try {
      redirectDomain = new URL(redirectUri).hostname.replace(/^www\./, '')
    } catch {}
  }

  return { provider, redirectDomain }
}

// ─── Identity Capture ─────────────────────────────────────────────────────────

// Captures ALL emails visible on the page (multi-account aware)
function scrapeAllEmails(): string[] {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
  const found = new Set<string>()

  // 1. DOM attribute selectors (most reliable for structured pages)
  document
    .querySelectorAll('[data-email], [data-identifier], [data-account-id]')
    .forEach((el) => {
      const e =
        el.getAttribute('data-email') ||
        el.getAttribute('data-identifier') ||
        el.getAttribute('data-account-id')
      if (e?.includes('@')) found.add(e.toLowerCase())
    })

  // 2. Text content of likely account-display elements
  document.querySelectorAll('[aria-label], [title]').forEach((el) => {
    const text = el.getAttribute('aria-label') || el.getAttribute('title') || ''
    const m = text.match(emailRegex)
    if (m) m.forEach((e) => found.add(e.toLowerCase()))
  })

  // 3. Full page text scan (all_matches, not just first)
  const bodyText = document.body?.innerText || ''
  const textMatches = bodyText.match(emailRegex)
  if (textMatches) textMatches.forEach((e) => found.add(e.toLowerCase()))

  return Array.from(found).filter((e) => e.includes('@') && e.includes('.'))
}

// The CLICKED account is typically the one in the URL's `login_hint` or the most prominent email
function findPrimaryEmail(_provider: string): string | null {
  const params = new URLSearchParams(window.location.search)

  // login_hint is the account the user selected
  const loginHint = params.get('login_hint')
  if (loginHint?.includes('@')) return loginHint.toLowerCase()

  // For Google: check for the highlighted / selected account chip
  const selectedChip = document.querySelector(
    '[data-email][aria-selected="true"], .l5wE7b[data-email]'
  )
  if (selectedChip) {
    const e = selectedChip.getAttribute('data-email')
    if (e) return e.toLowerCase()
  }

  // Account the user clicked on this page view (see click listener below)
  if (lastClickedEmail) return lastClickedEmail

  // Fallback: grab the first email visible
  const all = scrapeAllEmails()
  return all.length > 0 ? all[0] : null
}

// Last account the user clicked, held in the content script's isolated world.
//
// This used to be written to the page's own sessionStorage. Content scripts
// share the page's storage origin, so that handed the visited website the very
// email address we had just captured — the site could read it straight back
// out. Keeping it in a module-scoped variable is both sufficient (we only need
// it for the current page view) and leak-free.
let lastClickedEmail: string | null = null

// Global click listener to catch explicit account selections
document.addEventListener(
  'click',
  (e) => {
    const target = e.target as HTMLElement
    const accountEl = target.closest(
      '[data-email], [data-identifier], [data-account-id]'
    )
    if (accountEl) {
      const email =
        accountEl.getAttribute('data-email') ||
        accountEl.getAttribute('data-identifier') ||
        accountEl.getAttribute('data-account-id')
      if (email && email.includes('@')) {
        lastClickedEmail = email.toLowerCase()
      }
    } else {
      // Attempt to extract from aria-label or title of clicked element
      const text =
        target.getAttribute('aria-label') ||
        target.getAttribute('title') ||
        target.innerText ||
        ''
      const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
      if (m) {
        lastClickedEmail = m[0].toLowerCase()
      }
    }
  },
  true
)

async function captureAndSave(info: OAuthInfo) {
  const normalizedProvider = normalizeOAuthProvider(info.provider)
  const identity = findPrimaryEmail(normalizedProvider)
  if (!identity) return // Nothing to save yet

  const classification = detectOAuthPurpose(window.location.href, document.title, info.provider)

  log.debug(
    `[UniversalScraper] OAuth identity: ${identity} via ${normalizedProvider} (${classification.purpose})`
  )

  // Notify the background tab tracker of the scraped identity for this tab.
  // The classification travels with it — the background stores oauth_purpose
  // and integration_scope on the pending capture, and without these fields
  // every capture was silently recorded as a plain 'login'.
  safeSendMessage({
    type: 'SET_OAUTH_IDENTITY',
    identity,
    oauth_purpose: classification.purpose,
    integration_scope: classification.scopeLabel
  })

  // Update global registry with the selected/clicked identity
  const rawRegistry =
    await nativeStorage.get<GlobalOAuthAccount[]>('oauth_registry')
  const registry = Array.isArray(rawRegistry) ? rawRegistry : []
  const exists = registry.find(
    (r) => r.provider === normalizedProvider && r.identity === identity
  )

  if (!exists) {
    if (registry.length >= MAX_REGISTRY_ENTRIES) {
      log.warn(
        `[UniversalScraper] OAuth registry is at its ${MAX_REGISTRY_ENTRIES}-entry limit; skipping auto-record of ${normalizedProvider}.`
      )
      return
    }

    registry.push({
      id: crypto.randomUUID?.() ?? Math.random().toString(36).substring(2),
      provider: normalizedProvider,
      identity: identity,
      notes: 'Auto-recorded during OAuth login',
      is_manual: false,
      created_at: Date.now(),
      updated_at: Date.now()
    })
    await nativeStorage.set('oauth_registry', registry)
    log.debug(
      `[UniversalScraper] Added ${identity} (${normalizedProvider}) to registry`
    )
  }
}

// ─── SPA Route Watcher ───────────────────────────────────────────────────────

let lastUrl = window.location.href
let mutationDebounce: ReturnType<typeof setTimeout> | null = null
let captureObserver: MutationObserver | null = null
let captureDebounce: ReturnType<typeof setTimeout> | null = null

function scheduleCapture(info: OAuthInfo, delay = 1500) {
  if (captureDebounce) clearTimeout(captureDebounce)
  captureDebounce = setTimeout(() => captureAndSave(info), delay)
}

function startUniversalCapture() {
  const info = extractOAuthInfo()
  if (!info) return

  scheduleCapture(info, 1500)

  // MutationObserver to catch DOM changes (e.g., email appearing after login_hint chip selection)
  if (!captureObserver) {
    captureObserver = new MutationObserver(() => {
      scheduleCapture(info, 800)
    })
    captureObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      attributes: false
    })
  }
}

function stopUniversalCapture() {
  captureObserver?.disconnect()
  captureObserver = null
  if (captureDebounce) {
    clearTimeout(captureDebounce)
    captureDebounce = null
  }
}

// ─── SPA Navigation Detection ──────────────────────────────────────────────

function setupSpaWatcher() {
  const onNavigation = () => {
    const currentUrl = window.location.href
    if (currentUrl === lastUrl) return
    lastUrl = currentUrl
    log.debug(`[SPA] Navigation: ${currentUrl}`)

    // Re-run handlers for the new URL
    if (mutationDebounce) clearTimeout(mutationDebounce)
    mutationDebounce = setTimeout(async () => {
      await HandlerRegistry.runMatchingHandlers(currentUrl)

      // Also check if recording is needed for the new page
      const isRecording = await nativeStorage.get<boolean>('is_recording_oauth')
      const alwaysRecord = await nativeStorage.get<boolean>(
        'always_record_oauth'
      )
      if (isRecording || alwaysRecord) {
        stopUniversalCapture() // reset state for new page
        startUniversalCapture()
      }
    }, 800)
  }

  // NOTE: we deliberately do NOT patch history.pushState/replaceState here.
  // Content scripts run in an isolated world with their own `history` wrapper,
  // so a patch applied here is never seen by the page's own calls — the old
  // implementation did exactly that and silently caught nothing.
  //
  // The Navigation API is the only event that fires for programmatic SPA
  // navigations; where it is unavailable we fall back to observing the DOM and
  // re-reading location.href.
  const nav = (window as unknown as { navigation?: EventTarget }).navigation
  if (nav && typeof nav.addEventListener === 'function') {
    nav.addEventListener('navigatesuccess', onNavigation)
  }

  window.addEventListener('popstate', onNavigation)
  window.addEventListener('hashchange', onNavigation)

  // Fallback for SPAs on browsers without the Navigation API. Subtree is
  // required: frameworks swap inner content without touching <html>'s children.
  new MutationObserver(() => {
    if (window.location.href !== lastUrl) onNavigation()
  }).observe(document.documentElement, { childList: true, subtree: true })
}

// ─── Storage Change Listener ─────────────────────────────────────────────────

/**
 * Reads a boolean out of a raw `chrome.storage.onChanged` record.
 *
 * @plasmohq/storage serializes with JSON.stringify, so a stored `false` is on
 * disk as the *string* `"false"` — which is truthy. Reading `newValue` directly
 * meant "Stop Recording" was indistinguishable from "Start Recording" and
 * actually restarted capture on every open tab. Plasmo's own `get()` runs the
 * deserializer; the raw onChanged event does not, so it has to be done here.
 */
function readBooleanChange(
  change: chrome.storage.StorageChange | undefined
): boolean | undefined {
  if (!change) return undefined
  const raw = change.newValue
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) === true
    } catch {
      return undefined
    }
  }
  return undefined
}

function setupStorageListener() {
  chrome.storage.onChanged.addListener((changes, area) => {
    // Plasmo uses 'local' area by default
    if (area !== 'local' && area !== 'session') return

    const manual = readBooleanChange(changes['is_recording_oauth'])
    const always = readBooleanChange(changes['always_record_oauth'])
    if (manual === undefined && always === undefined) return

    // Either switch being on is enough to record, so a switch turning off only
    // stops capture when the other one is not currently holding it on.
    if (manual === true || always === true) {
      startUniversalCapture()
      return
    }

    void (async () => {
      const [isRecording, alwaysRecord] = await Promise.all([
        nativeStorage.get<boolean>('is_recording_oauth'),
        nativeStorage.get<boolean>('always_record_oauth')
      ])
      if (isRecording || alwaysRecord) startUniversalCapture()
      else stopUniversalCapture()
    })()
  })
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

;(async () => {
  // 1. Setup SPA watcher early
  setupSpaWatcher()

  // 2. Listen for storage toggles
  setupStorageListener()

  // 3. Check if recording is already on
  const [isRecording, alwaysRecord] = await Promise.all([
    nativeStorage.get<boolean>('is_recording_oauth'),
    nativeStorage.get<boolean>('always_record_oauth')
  ])

  if (isRecording || alwaysRecord) {
    startUniversalCapture()
  }

  // 4. Run matching handlers (e.g., Google Linked Apps)
  await HandlerRegistry.runMatchingHandlers(window.location.href)
})()
