// ---------------------------------------------------------------------------
// Tab Navigation Tracker — persisted in chrome.storage.session
// ---------------------------------------------------------------------------
// WHY session storage instead of in-memory Map:
//
// MV3 service workers are EPHEMERAL. Chrome kills them aggressively —
// often between the multiple page loads in a typical OAuth redirect chain:
//   1. cloudflare.com/login  (SW alive)
//   2. accounts.google.com   (SW may have been killed & restarted → Map is gone)
//   3. cfapi.net/callback    (SW killed again)
//   4. dash.cloudflare.com   (SW restarted, popup queries → empty state)
//
// chrome.storage.session solves this:
//   - Survives service worker sleep/restart cycles
//   - Cleared when the browser is fully closed (unlike storage.local)
//   - Per-browser-session, never synced
// ---------------------------------------------------------------------------
import {
  isOAuthPage,
  extractOAuthProvider,
  getRootDomain,
  normalizeOAuthProvider
} from '../core/utils/domain'
import { isCorruptedSentinel, nativeStorage } from '../core/storage/native'
import type {
  DomainEntry,
  // IdentityProfile,
  GlobalOAuthAccount,
  PendingOAuthCapture
} from '../core/storage/schema'
import { hasSavedOAuthAccount } from '../core/utils/oauth-dedup'
import { log } from '../core/utils/logger'
import { pushToCloudSync } from '../core/utils/cloud-sync'
import { createSnapshot } from '../core/storage/snapshots'
import { UNINSTALL_URL } from '../core/constants/links'

// ---------------------------------------------------------------------------
// Storage Sanitization (Fix for [object Object] corruption)
// ---------------------------------------------------------------------------
// Repairs keys a pre-1.0 bug overwrote with the string "[object Object]",
// which is unreadable and would otherwise fail every read forever.
//
// The test is `isCorruptedSentinel` — the value IS the sentinel — and never a
// substring search. Each key is stored as a single JSON string, so a substring
// test matches a vault where any one note or label contains that text, and
// resetting on that would destroy every account the user has.
// ---------------------------------------------------------------------------
const REPAIRABLE_ARRAY_KEYS = new Set([
  'saved_accounts',
  'oauth_registry',
  'pending_oauth_captures',
  'app_logs'
])
;(async () => {
  try {
    const allData = await chrome.storage.local.get(null)
    for (const key of Object.keys(allData)) {
      if (!isCorruptedSentinel(allData[key])) continue

      if (REPAIRABLE_ARRAY_KEYS.has(key)) {
        log.warn(`Resetting corrupted array storage key: ${key} to []`)
        await nativeStorage.set(key, [])
      } else {
        log.warn(`Removing corrupted storage key: ${key}`)
        await chrome.storage.local.remove(key)
      }
    }
  } catch (e) {
    log.error('Failed to sanitize storage', e)
  }
})()

// ---------------------------------------------------------------------------
// Cloud Sync & Automated Backups
// ---------------------------------------------------------------------------

// Keys whose contents are mirrored to chrome.storage.sync. Keep this in step
// with `minimizeVaultForSync` — a key that is minified but never read here
// simply never reaches the other device.
const SYNCED_KEYS = ['saved_accounts', 'oauth_registry', 'mfa_registry']

let syncTimeout: ReturnType<typeof setTimeout> | null = null
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return
  if (!SYNCED_KEYS.some((key) => changes[key])) return

  if (syncTimeout) clearTimeout(syncTimeout)
  syncTimeout = setTimeout(async () => {
    try {
      const data = await chrome.storage.local.get(SYNCED_KEYS)
      const result = await pushToCloudSync(data)
      // 'disabled' and 'no-passphrase' are the normal steady state for anyone
      // who never opted in, so they are not worth a log line every edit.
      if (!result.ok && result.reason !== 'disabled' && result.reason !== 'no-passphrase') {
        log.warn(`Cloud sync push failed: ${result.message}`)
      }
    } catch (err) {
      log.error('Failed to push to Cloud Sync', err)
    }
  }, 5000) // 5s debounce
})

// ---------------------------------------------------------------------------
// Install / update lifecycle
// ---------------------------------------------------------------------------
// A single onInstalled listener. MV3 requires listeners to be registered
// synchronously at the top level on every service-worker wake; splitting the
// same event across three listeners made the ordering between them undefined
// and was purely accidental.
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Open the vault on the welcome walkthrough
    chrome.tabs.create({
      url: chrome.runtime.getURL('tabs/vault.html#welcome')
    })
  }

  // Weekly snapshot sweep. chrome.alarms is the only timer that survives
  // service-worker termination, so periodic work has to hang off it.
  chrome.alarms.create('scheduled_snapshot', { periodInMinutes: 60 * 24 })

  // Where the browser sends the user after they remove the extension.
  // This MUST be an http(s) URL — extension pages are unloaded before it
  // opens, so chrome.runtime.getURL('tabs/uninstall.html') can never work
  // here. That mistake is why the uninstall page was unreachable.
  try {
    chrome.runtime.setUninstallURL(UNINSTALL_URL)
  } catch (e) {
    log.warn('Could not register the uninstall URL', e)
  }
})

// ---------------------------------------------------------------------------
// Manual recording auto-stop
// ---------------------------------------------------------------------------
// "Record OAuth Login" used to be a latch with no off switch other than
// reopening the popup. Someone who clicked it and closed the popup left a
// content script reading every identity off every page they visited, for as
// long as the profile lived, with nothing on screen to say so.
//
// The alarm is the timer here because setTimeout does not survive service
// worker termination, and this deadline has to.
// ---------------------------------------------------------------------------
export const RECORDING_TIMEOUT_MINUTES = 15
const RECORDING_ALARM = 'recording_timeout'

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return
  const change = changes['is_recording_oauth']
  if (!change) return

  // Raw onChanged values are the JSON text Plasmo wrote, so `false` arrives as
  // the truthy string "false" unless it is parsed back.
  let enabled: boolean
  try {
    enabled =
      typeof change.newValue === 'boolean'
        ? change.newValue
        : JSON.parse(String(change.newValue)) === true
  } catch {
    return
  }

  if (enabled) {
    chrome.alarms.create(RECORDING_ALARM, {
      delayInMinutes: RECORDING_TIMEOUT_MINUTES
    })
  } else {
    void chrome.alarms.clear(RECORDING_ALARM)
  }
})

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === RECORDING_ALARM) {
    try {
      await nativeStorage.set('is_recording_oauth', false)
      log.info(
        `Manual OAuth recording stopped automatically after ${RECORDING_TIMEOUT_MINUTES} minutes.`
      )
    } catch (err) {
      log.error('Could not auto-stop OAuth recording', err)
    }
    return
  }

  if (alarm.name !== 'scheduled_snapshot') return
  try {
    // createSnapshot('scheduled') is itself a no-op unless a week has passed
    // AND the vault actually changed, so a daily alarm is safe here.
    const snapshot = await createSnapshot('scheduled')
    if (snapshot) {
      log.info(`Scheduled snapshot created (${snapshot.accountCount} accounts).`)
    }
  } catch (err) {
    log.error('Scheduled snapshot failed', err)
  }
})

interface TabState {
  originDomain: string | null
  currentDomain: string | null
  isOnOAuthPage: boolean
  oauthIdentity?: string | null
  oauthPurpose?: 'login' | 'integration'
  integrationScope?: string
  updatedAt: number
}

const SESSION_PREFIX = 'll_tab_'
const SESSION_TTL_MS = 30 * 60 * 1000 // 30 minutes — clean up stale entries

async function getTabState(tabId: number): Promise<TabState | null> {
  try {
    const key = `${SESSION_PREFIX}${tabId}`
    const result = await chrome.storage.session.get(key)
    const state = result[key] as TabState | undefined
    if (!state) return null
    // Evict if too old (safety valve)
    if (Date.now() - state.updatedAt > SESSION_TTL_MS) {
      await chrome.storage.session.remove(key)
      return null
    }
    return state
  } catch (e) {
    log.warn('Failed to read tab state from session storage', e)
    return null
  }
}

async function setTabState(
  tabId: number,
  state: Omit<TabState, 'updatedAt'>
): Promise<void> {
  try {
    const key = `${SESSION_PREFIX}${tabId}`
    await chrome.storage.session.set({
      [key]: { ...state, updatedAt: Date.now() }
    })
  } catch (e) {
    log.warn('Failed to set tab state in session storage', e)
  }
}

async function deleteTabState(tabId: number): Promise<void> {
  try {
    await chrome.storage.session.remove(`${SESSION_PREFIX}${tabId}`)
  } catch (e) {
    log.warn('Failed to delete tab state from session storage', e)
  }
}

import { isLocalEnvironment, isNonOriginDomain } from '~/core/utils/domain'

function getHostname(url: string): string | null {
  try {
    const parsed = new URL(url)
    // Strip www. but preserve all other subdomains (important for github.io, etc.)
    const hostname = parsed.hostname.replace(/^www\./, '')
    
    // Preserve port for localhost and local IP ranges
    if (isLocalEnvironment(hostname) && parsed.port) {
      return `${hostname}:${parsed.port}`
    }
    
    return hostname
  } catch (e) {
    log.warn('Failed to parse hostname from URL', e)
    return null
  }
}

// ---------------------------------------------------------------------------
// Tab event listeners
// ---------------------------------------------------------------------------

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, _tab) => {
  // Only act on committed navigations (status==="loading" fires on every redirect)
  // Using "complete" would miss redirect midpoints, so we keep "loading" but guard
  // against non-URL changes (e.g. title changes fire onUpdated with no url)
  if (!changeInfo.url) return
  const url = changeInfo.url

  // Skip internal pages
  if (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('about:') ||
    url.startsWith('edge://')
  )
    return

  const newDomain = getHostname(url)
  if (!newDomain) return

  const oauthPage = isOAuthPage(url)
  const existing = await getTabState(tabId)

  log.debug(`Navigation: ${newDomain}`, { url, oauthPage, existing })

  if (!existing) {
    // First navigation tracked for this tab
    log.debug(`Initializing tracking for tab ${tabId} at ${newDomain}`)

    // Support OAuth Popup Windows:
    // If this tab was opened by another tab, inherit its origin domain ONLY IF:
    // 1. The opener tab was actively on an OAuth page, OR
    // 2. This tab is initializing directly on an OAuth authorization page.
    // AND the candidate origin is NOT a search engine / webmail / media non-origin site!
    let inheritedOriginDomain = newDomain
    try {
      const tabInfo = await chrome.tabs.get(tabId)
      if (tabInfo.openerTabId) {
        const openerState = await getTabState(tabInfo.openerTabId)
        if (openerState) {
          const candidateOpener = openerState.isOnOAuthPage
            ? openerState.originDomain
            : openerState.currentDomain

          if (
            (openerState.isOnOAuthPage || oauthPage) &&
            candidateOpener &&
            !isNonOriginDomain(candidateOpener) &&
            candidateOpener !== newDomain
          ) {
            inheritedOriginDomain = candidateOpener
            log.debug(
              `Tab ${tabId} validly inherited origin '${inheritedOriginDomain}' from opener tab ${tabInfo.openerTabId}`
            )
          }
        }
      }
    } catch (e) {
      log.warn('Error getting opener tab state', e)
    }

    // Fallback: If we still don't have a distinct origin, and we are starting
    // directly on an OAuth page (e.g. extension reload, bookmark, or direct link),
    // try to extract the origin from the redirect_uri or continue parameter.
    if (inheritedOriginDomain === newDomain && oauthPage) {
      try {
        const parsedUrl = new URL(url)
        const redirectParam =
          parsedUrl.searchParams.get('redirect_uri') ||
          parsedUrl.searchParams.get('continue') ||
          parsedUrl.searchParams.get('return_to')
        if (redirectParam) {
          const extractedOrigin = getHostname(redirectParam)
          if (extractedOrigin && !isNonOriginDomain(extractedOrigin)) {
            inheritedOriginDomain = extractedOrigin
            log.debug(
              `Extracted origin '${inheritedOriginDomain}' from redirect parameter`
            )
          }
        }
      } catch (e) {
        log.warn('Error extracting origin from redirect_uri', e)
      }
    }

    // Ensure non-origin sites (Google, Gmail, etc.) are never saved as originDomain
    if (isNonOriginDomain(inheritedOriginDomain)) {
      inheritedOriginDomain = newDomain
    }

    await setTabState(tabId, {
      originDomain: inheritedOriginDomain,
      currentDomain: newDomain,
      isOnOAuthPage: oauthPage
    })
    return
  }

  if (oauthPage) {
    let provider = normalizeOAuthProvider(newDomain)
    if (existing.isOnOAuthPage && newDomain === existing.originDomain) {
      provider = normalizeOAuthProvider(existing.currentDomain ?? newDomain) // preserve the third-party provider
    } else if (!existing.isOnOAuthPage && newDomain === existing.originDomain) {
      const extracted = extractOAuthProvider(url)
      if (extracted) {
        provider = normalizeOAuthProvider(extracted)
        log.debug(`Extracted provider '${provider}' directly from callback URL`)
      }
    }

    const effectiveOrigin = existing.isOnOAuthPage
      ? existing.originDomain
      : existing.currentDomain

    const safeOrigin = (effectiveOrigin && !isNonOriginDomain(effectiveOrigin))
      ? effectiveOrigin
      : newDomain

    log.debug(
      `OAuth Page detected. Provider: ${provider}, Origin: ${safeOrigin}`
    )

    await setTabState(tabId, {
      originDomain: safeOrigin,
      currentDomain: provider,
      isOnOAuthPage: true,
      oauthIdentity: existing.oauthIdentity
    })
  } else if (existing.isOnOAuthPage) {
    // -------------------------------------------------------------------
    // Leaving an OAuth page — OAuth flow completed!
    // -------------------------------------------------------------------
    const rawOrigin = existing.originDomain
    const originSite = (rawOrigin && !isNonOriginDomain(rawOrigin)) ? rawOrigin : null
    const providerSite = normalizeOAuthProvider(existing.currentDomain || newDomain)
    const validIdentity = existing.oauthIdentity &&
      existing.oauthIdentity.trim().length > 0 &&
      existing.oauthIdentity !== 'Unknown Account' &&
      existing.oauthIdentity.includes('@')

    log.debug(
      `OAuth Flow Completed. Origin: ${originSite || 'None'}, Provider: ${providerSite}, Scraped Identity: ${existing.oauthIdentity || 'None'}`
    )

    if (originSite && providerSite && originSite !== providerSite && validIdentity) {
      if (getRootDomain(originSite) === getRootDomain(providerSite)) {
        log.debug(
          `Ignoring first-party SSO across subdomains: ${originSite} -> ${providerSite}`
        )
      } else {
        log.info(
          `Queueing new OAuth profile for approval: ${providerSite} for ${originSite}`
        )
        try {
          const identityString = existing.oauthIdentity!

          // 0. Already in the vault? Then this is the user signing back into a
          // site they saved long ago, not a new connection to record. Without
          // this the same capture is re-queued on every single login.
          const rawSaved =
            await nativeStorage.get<DomainEntry[]>('saved_accounts')
          const alreadySaved = hasSavedOAuthAccount(
            Array.isArray(rawSaved) ? rawSaved : [],
            originSite,
            providerSite,
            identityString
          )

          if (alreadySaved) {
            log.debug(
              `Ignoring duplicate OAuth capture: ${identityString} via ${providerSite} is already saved for ${originSite}`
            )
          }

          // 1. Push to pending queue (filtered for clean identities)
          const rawPending = await nativeStorage.get<PendingOAuthCapture[]>(
            'pending_oauth_captures'
          )
          const pending = Array.isArray(rawPending) ? rawPending : []

          // Purge stale Unknown Account or non-origin items
          const cleanedPending = pending.filter(
            (p) =>
              p.identity &&
              p.identity !== 'Unknown Account' &&
              p.identity.includes('@') &&
              !isNonOriginDomain(p.suggested_domain)
          )

          const pendingExists = cleanedPending.find(
            (p) =>
              p.provider === providerSite &&
              p.suggested_domain === originSite &&
              p.identity === identityString
          )

          if (!pendingExists && !alreadySaved) {
            cleanedPending.push({
              id:
                typeof crypto !== 'undefined' && crypto.randomUUID
                  ? crypto.randomUUID()
                  : Math.random().toString(36).substring(2),
              provider: providerSite,
              identity: identityString,
              suggested_domain: originSite,
              oauth_purpose: existing.oauthPurpose || 'login',
              integration_scope: existing.integrationScope,
              timestamp: Date.now()
            })
            await nativeStorage.set('pending_oauth_captures', cleanedPending)
          }

          // 2. Also push to global oauth_registry
          const rawRegistry =
            await nativeStorage.get<GlobalOAuthAccount[]>('oauth_registry')
          const currentRegistry = Array.isArray(rawRegistry) ? rawRegistry : []
          const regExists = currentRegistry.find(
            (r) => r.provider === providerSite && r.identity === identityString
          )
          if (!regExists) {
            currentRegistry.push({
              id:
                typeof crypto !== 'undefined' && crypto.randomUUID
                  ? crypto.randomUUID()
                  : Math.random().toString(36).substring(2),
              provider: providerSite,
              identity: identityString,
              created_at: Date.now(),
              updated_at: Date.now()
            })
            await nativeStorage.set('oauth_registry', currentRegistry)
            log.info(
              `Added new identity to Global OAuth Registry: ${identityString}`
            )
          }
        } catch (err) {
          log.error('Failed to save OAuth profile', err)
        }
      }
    }

    // Reset tracking to the landing domain
    await setTabState(tabId, {
      originDomain: newDomain,
      currentDomain: newDomain,
      isOnOAuthPage: false
    })
  } else {
    // Normal navigation — update current domain and reset origin
    await setTabState(tabId, {
      originDomain: newDomain,
      currentDomain: newDomain,
      isOnOAuthPage: false
    })
  }
})

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await deleteTabState(tabId)
})

// ---------------------------------------------------------------------------
// Message Routing
// ---------------------------------------------------------------------------

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('tabs/vault.html') })
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only accept messages that originate from this extension. Without this
  // check any sender the browser routes here is trusted implicitly.
  if (sender.id !== chrome.runtime.id) {
    log.warn(`Ignoring message from unexpected sender: ${sender.id}`)
    return false
  }

  if (!message || typeof message.type !== 'string') return false

  if (message.type === 'GET_TAB_CONTEXT') {
    // Determine which tab to query.
    //
    // A content script may only ask about ITS OWN tab. Honouring an arbitrary
    // message.tabId from a content script would let a script on any page read
    // back the origin domain the user came from in an unrelated tab.
    // Extension pages (popup/vault) have no sender.tab and may pass a tabId or
    // fall through to the active tab.
    const isFromContentScript = Boolean(sender.tab?.id)

    const queryTabId = async (): Promise<number | undefined> => {
      if (isFromContentScript) return sender.tab!.id
      if (typeof message.tabId === 'number') return message.tabId
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true
      })
      return tabs[0]?.id
    }

    queryTabId().then(async (id) => {
      if (!id) {
        sendResponse(null)
        return
      }
      const state = await getTabState(id)
      if (state) {
        // Return the origin domain so the popup filters credentials
        // based on where the user ACTUALLY came from, not the current OAuth/SSO URL.
        sendResponse({ effectiveDomain: state.originDomain })
      } else {
        sendResponse(null)
      }
    })

    return true // Keep the message channel open for async response
  }

  if (message.type === 'SET_OAUTH_IDENTITY') {
    const tabId = sender?.tab?.id
    // The identity is scraped out of page-controlled DOM — on Microsoft it is a
    // whole element's textContent — and ends up in `oauth_registry`, which is
    // mirrored into chrome.storage.sync under an 8KB per-item cap. An
    // unbounded string there breaks sync for the whole vault, not just itself.
    // 254 is the RFC 5321 maximum address length; the slack is for display
    // forms like "Name <a@b.com>".
    const identity =
      typeof message.identity === 'string' && message.identity.length <= 320
        ? message.identity
        : null

    if (tabId && identity) {
      getTabState(tabId).then(async (state) => {
        if (state && state.isOnOAuthPage) {
          log.debug(
            `Scraped OAuth Identity for tab ${tabId}: ${identity} (${message.oauth_purpose || 'login'})`
          )
          await setTabState(tabId, {
            ...state,
            oauthIdentity: identity,
            oauthPurpose: message.oauth_purpose || state.oauthPurpose || 'login',
            integrationScope: message.integration_scope || state.integrationScope
          })
        }
      })
    }
    // Fire-and-forget: nothing is sent back, so the channel must not be held.
    return false
  }

  if (message.type === 'SAVE_LOGIN') {
    sendResponse({ success: true })
    return false
  }

  // Returning `true` here would promise an async reply for every unknown
  // message type and leave the sender's callback hanging on a port that is
  // never answered.
  return false
})
