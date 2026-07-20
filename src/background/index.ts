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
import { checkPatches } from "./patch-manager";
import { isOAuthPage, extractOAuthProvider, getRootDomain } from "../core/utils/domain";
import { extensionStorage } from "../core/storage/config";
import type { DomainEntry, IdentityProfile, GlobalOAuthAccount, PendingOAuthCapture } from "../core/storage/schema";
import { log } from "../core/utils/logger";

interface TabState {
  originDomain: string | null;
  currentDomain: string | null;
  isOnOAuthPage: boolean;
  oauthIdentity?: string | null;
  updatedAt: number;
}

const SESSION_PREFIX = "ll_tab_";
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes — clean up stale entries

async function getTabState(tabId: number): Promise<TabState | null> {
  try {
    const key = `${SESSION_PREFIX}${tabId}`;
    const result = await chrome.storage.session.get(key);
    const state = result[key] as TabState | undefined;
    if (!state) return null;
    // Evict if too old (safety valve)
    if (Date.now() - state.updatedAt > SESSION_TTL_MS) {
      await chrome.storage.session.remove(key);
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

async function setTabState(tabId: number, state: Omit<TabState, "updatedAt">): Promise<void> {
  try {
    const key = `${SESSION_PREFIX}${tabId}`;
    await chrome.storage.session.set({ [key]: { ...state, updatedAt: Date.now() } });
  } catch {
    // session storage not available (older Chrome) — silently skip
  }
}

async function deleteTabState(tabId: number): Promise<void> {
  try {
    await chrome.storage.session.remove(`${SESSION_PREFIX}${tabId}`);
  } catch {}
}

function getHostname(url: string): string | null {
  try {
    // Strip www. but preserve all other subdomains (important for github.io, etc.)
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tab event listeners
// ---------------------------------------------------------------------------

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only act on committed navigations (status==="loading" fires on every redirect)
  // Using "complete" would miss redirect midpoints, so we keep "loading" but guard
  // against non-URL changes (e.g. title changes fire onUpdated with no url)
  if (!changeInfo.url) return;
  const url = changeInfo.url;

  // Skip internal pages
  if (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("about:") ||
    url.startsWith("edge://")
  ) return;

  const newDomain = getHostname(url);
  if (!newDomain) return;

  const oauthPage = isOAuthPage(url);
  const existing = await getTabState(tabId);
  
  log.debug(`Navigation: ${newDomain}`, { url, oauthPage, existing });

  if (!existing) {
    // First navigation tracked for this tab
    log.debug(`Initializing tracking for tab ${tabId} at ${newDomain}`);
    
    // Support OAuth Popup Windows: 
    // If this tab was opened by another tab, inherit its origin domain!
    let inheritedOriginDomain = newDomain;
    try {
      const tabInfo = await chrome.tabs.get(tabId);
      if (tabInfo.openerTabId) {
        const openerState = await getTabState(tabInfo.openerTabId);
        if (openerState) {
          inheritedOriginDomain = (openerState.isOnOAuthPage ? openerState.originDomain : openerState.currentDomain) ?? newDomain;
          log.debug(`Tab ${tabId} inherits origin '${inheritedOriginDomain}' from opener tab ${tabInfo.openerTabId}`);
        }
      }
    } catch (e) {}

    // Fallback: If we still don't have a distinct origin, and we are starting 
    // directly on an OAuth page (e.g. extension reload, bookmark, or direct link),
    // try to extract the origin from the redirect_uri or continue parameter.
    if (inheritedOriginDomain === newDomain && oauthPage) {
      try {
        const parsedUrl = new URL(url);
        const redirectParam = parsedUrl.searchParams.get("redirect_uri") || 
                              parsedUrl.searchParams.get("continue") || 
                              parsedUrl.searchParams.get("return_to");
        if (redirectParam) {
          const extractedOrigin = new URL(redirectParam).hostname.replace(/^www\./, "");
          if (extractedOrigin) {
            inheritedOriginDomain = extractedOrigin;
            log.debug(`Extracted origin '${inheritedOriginDomain}' from redirect parameter`);
          }
        }
      } catch (e) {}
    }

    await setTabState(tabId, {
      originDomain: inheritedOriginDomain,
      currentDomain: newDomain,
      isOnOAuthPage: oauthPage,
    });
    return;
  }

  if (oauthPage) {
    // -------------------------------------------------------------------
    // Entering or continuing an OAuth/SSO page.
    //
    // CRITICAL: We use the PREVIOUS domain (referrer chain) as the origin.
    // Do NOT use redirect_uri from the URL params.
    //
    // Also, if the new domain is the SAME as the origin domain (e.g. the
    // callback URI like roadmap.sh/signup?code=...), we MUST NOT overwrite
    // the current provider domain (e.g. github.com).
    // -------------------------------------------------------------------
    let provider = newDomain;
    if (existing.isOnOAuthPage && newDomain === existing.originDomain) {
      provider = existing.currentDomain ?? newDomain; // preserve the third-party provider
    } else if (!existing.isOnOAuthPage && newDomain === existing.originDomain) {
      // 302 Redirect edge case: The browser completely skipped firing onUpdated for 
      // the third-party domain (e.g. github.com) because it was a fast server-side redirect,
      // and we landed straight on the callback URL on the origin domain.
      const extracted = extractOAuthProvider(url);
      if (extracted) {
        provider = extracted;
        log.debug(`Extracted provider '${provider}' directly from callback URL`);
      }
    }

    log.debug(`OAuth Page detected. Provider: ${provider}, Origin: ${existing.isOnOAuthPage ? existing.originDomain : existing.currentDomain}`);

    await setTabState(tabId, {
      // Only update originDomain if we weren't already on an OAuth page
      originDomain: existing.isOnOAuthPage ? existing.originDomain : existing.currentDomain,
      currentDomain: provider,
      isOnOAuthPage: true,
      oauthIdentity: existing.oauthIdentity, // preserve identity if we already scraped it
    });
  } else if (existing.isOnOAuthPage) {
    // -------------------------------------------------------------------
    // Leaving an OAuth page — OAuth flow completed!
    // -------------------------------------------------------------------
    const originSite = existing.originDomain;
    const providerSite = existing.currentDomain;

    log.debug(`OAuth Flow Completed. Origin: ${originSite}, Provider: ${providerSite}, Scraped Identity: ${existing.oauthIdentity || 'None'}`);

    if (originSite && providerSite && originSite !== providerSite) {
      // Avoid treating first-party SSO (e.g. store.epicgames.com -> epicgames.com) as OAuth
      if (getRootDomain(originSite) === getRootDomain(providerSite)) {
        log.debug(`Ignoring first-party SSO across subdomains: ${originSite} -> ${providerSite}`);
      } else {
        log.info(`Queueing new OAuth profile for approval: ${providerSite} for ${originSite}`);
        try {
          const identityString = existing.oauthIdentity ? existing.oauthIdentity : `Unknown Account`;

          // 1. Push to pending queue instead of saved_accounts
          const pending = (await extensionStorage.get<PendingOAuthCapture[]>("pending_oauth_captures")) || [];
          const pendingExists = pending.find(p => p.provider === providerSite && p.suggested_domain === originSite && p.identity === identityString);
          
          if (!pendingExists) {
             pending.push({
               id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
               provider: providerSite,
               identity: identityString,
               suggested_domain: originSite,
               timestamp: Date.now()
             });
             await extensionStorage.set("pending_oauth_captures", pending);
          }

          // 2. Also push to global oauth_registry
          const currentRegistry = (await extensionStorage.get<GlobalOAuthAccount[]>("oauth_registry")) || [];
          const regExists = currentRegistry.find(r => r.provider === providerSite && r.identity === identityString);
          if (!regExists) {
            currentRegistry.push({
              id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
              provider: providerSite,
              identity: identityString,
              created_at: Date.now(),
              updated_at: Date.now()
            });
            await extensionStorage.set("oauth_registry", currentRegistry);
            log.info(`Added new identity to Global OAuth Registry: ${identityString}`);
          }
      } catch (err) {
        log.error("Failed to save OAuth profile", err);
      }
    }
    }

    // Reset tracking to the landing domain
    await setTabState(tabId, {
      originDomain: newDomain,
      currentDomain: newDomain,
      isOnOAuthPage: false,
    });
  } else {
    // Normal navigation — update current domain and reset origin
    await setTabState(tabId, {
      originDomain: newDomain,
      currentDomain: newDomain,
      isOnOAuthPage: false,
    });
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await deleteTabState(tabId);
});

// ---------------------------------------------------------------------------
// Message Routing
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(async () => {
  await checkPatches();
});

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("tabs/vault.html") });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_TAB_CONTEXT") {
    // Determine which tab to query.
    // If the sender has a tab (e.g. injected content script), use that.
    // Otherwise, if the popup is querying, use the active tab in the current window.
    const queryTabId = async () => {
      if (message.tabId) return message.tabId;
      if (sender && sender.tab && sender.tab.id) return sender.tab.id;
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      return tabs[0]?.id;
    };

    queryTabId().then(async (id) => {
      if (!id) {
        sendResponse(null);
        return;
      }
      const state = await getTabState(id);
      if (state) {
        // Return the origin domain so the popup filters credentials
        // based on where the user ACTUALLY came from, not the current OAuth/SSO URL.
        sendResponse({ effectiveDomain: state.originDomain });
      } else {
        sendResponse(null);
      }
    });

    return true; // Keep the message channel open for async response
  }

  if (message.type === "SET_OAUTH_IDENTITY") {
    const tabId = sender?.tab?.id;
    if (tabId && message.identity) {
      getTabState(tabId).then(async (state) => {
        if (state && state.isOnOAuthPage) {
          log.debug(`Scraped OAuth Identity for tab ${tabId}: ${message.identity}`);
          await setTabState(tabId, { ...state, oauthIdentity: message.identity });
        }
      });
    }
  }

  if (message.type === "SAVE_LOGIN") {
    sendResponse({ success: true });
  }

  return true;
});
