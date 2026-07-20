import type { PlasmoCSConfig } from "plasmo";
import { HandlerRegistry } from "../core/scrapers/HandlerRegistry";
import { GoogleHandler } from "../core/scrapers/handlers/GoogleHandler";
import { extensionStorage } from "../core/storage/config";
import { log } from "../core/utils/logger";
import type { DomainEntry, IdentityProfile, GlobalOAuthAccount, PendingOAuthCapture } from "../core/storage/schema";

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  all_frames: false   // Only run on top-level frames to avoid duplicate recording
};

HandlerRegistry.register(GoogleHandler);

// ─── Banner (Removed as requested) ──────────────────────────────────────────

function showRecordingBanner() {}
function removeBanner() {}
function flashBannerSuccess(identity: string, provider: string) {}

// ─── OAuth Provider Detection ────────────────────────────────────────────────

interface OAuthInfo {
  provider: string;
  redirectDomain?: string;
}

function extractOAuthInfo(): OAuthInfo | null {
  const url = window.location.href;
  const params = new URLSearchParams(window.location.search);

  let provider = '';

  if (url.includes('accounts.google.com/o/oauth2') || url.includes('accounts.google.com/signin/oauth') || url.includes('accounts.google.com/v3/signin')) {
    provider = 'google.com';
  } else if (url.includes('github.com/login/oauth/authorize')) {
    provider = 'github.com';
  } else if (url.includes('login.microsoftonline.com') && params.has('client_id')) {
    provider = 'microsoft.com';
  } else if (url.includes('appleid.apple.com') && (url.includes('auth') || params.has('client_id'))) {
    provider = 'apple.com';
  } else if (url.includes('twitter.com/i/oauth2') || url.includes('x.com/i/oauth2')) {
    provider = 'twitter.com';
  } else if (url.includes('facebook.com/dialog/oauth') || url.includes('facebook.com/v') && url.includes('/dialog/oauth')) {
    provider = 'facebook.com';
  } else if (url.includes('discord.com/oauth2/authorize')) {
    provider = 'discord.com';
  } else if (url.includes('linkedin.com/oauth/v2/authorization')) {
    provider = 'linkedin.com';
  } else if (url.includes('slack.com/oauth/v2/authorize')) {
    provider = 'slack.com';
  } else if (params.has('client_id') && (url.includes('oauth') || url.includes('authorize') || url.includes('auth'))) {
    // Generic fallback: use the current domain as provider
    provider = new URL(url).hostname;
  }

  if (!provider) return null;

  // Extract the app (redirect_uri) that's requesting access
  const redirectUri = params.get('redirect_uri') || params.get('redirect_url') || params.get('callback_url');
  let redirectDomain: string | undefined;
  if (redirectUri) {
    try {
      redirectDomain = new URL(redirectUri).hostname.replace(/^www\./, '');
    } catch {}
  }

  return { provider, redirectDomain };
}

// ─── Identity Capture ─────────────────────────────────────────────────────────

// Captures ALL emails visible on the page (multi-account aware)
function scrapeAllEmails(): string[] {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const found = new Set<string>();

  // 1. DOM attribute selectors (most reliable for structured pages)
  document.querySelectorAll('[data-email], [data-identifier], [data-account-id]').forEach(el => {
    const e = el.getAttribute('data-email') || el.getAttribute('data-identifier') || el.getAttribute('data-account-id');
    if (e?.includes('@')) found.add(e.toLowerCase());
  });

  // 2. Text content of likely account-display elements
  document.querySelectorAll('[aria-label], [title]').forEach(el => {
    const text = el.getAttribute('aria-label') || el.getAttribute('title') || '';
    const m = text.match(emailRegex);
    if (m) m.forEach(e => found.add(e.toLowerCase()));
  });

  // 3. Full page text scan (all_matches, not just first)
  const bodyText = document.body?.innerText || '';
  const textMatches = bodyText.match(emailRegex);
  if (textMatches) textMatches.forEach(e => found.add(e.toLowerCase()));

  return Array.from(found).filter(e => e.includes('@') && e.includes('.'));
}

// The CLICKED account is typically the one in the URL's `login_hint` or the most prominent email
function findPrimaryEmail(provider: string): string | null {
  const params = new URLSearchParams(window.location.search);

  // login_hint is the account the user selected
  const loginHint = params.get('login_hint');
  if (loginHint?.includes('@')) return loginHint.toLowerCase();

  // For Google: check for the highlighted / selected account chip
  const selectedChip = document.querySelector('[data-email][aria-selected="true"], .l5wE7b[data-email]');
  if (selectedChip) {
    const e = selectedChip.getAttribute('data-email');
    if (e) return e.toLowerCase();
  }

  // Session storage check (populated by click listener below)
  const lastClicked = sessionStorage.getItem('ll_last_clicked_email');
  if (lastClicked) return lastClicked;

  // Fallback: grab the first email visible
  const all = scrapeAllEmails();
  return all.length > 0 ? all[0] : null;
}

// Global click listener to catch explicit account selections
document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const accountEl = target.closest('[data-email], [data-identifier], [data-account-id]');
  if (accountEl) {
    const email = accountEl.getAttribute('data-email') || accountEl.getAttribute('data-identifier') || accountEl.getAttribute('data-account-id');
    if (email && email.includes('@')) {
      sessionStorage.setItem('ll_last_clicked_email', email.toLowerCase());
    }
  } else {
    // Attempt to extract from aria-label or title of clicked element
    const text = target.getAttribute('aria-label') || target.getAttribute('title') || target.innerText || '';
    const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (m) {
      sessionStorage.setItem('ll_last_clicked_email', m[0].toLowerCase());
    }
  }
}, true);

async function captureAndSave(info: OAuthInfo) {
  const identity = findPrimaryEmail(info.provider);
  if (!identity) return; // Nothing to save yet

  log.debug(`[UniversalScraper] OAuth identity: ${identity} via ${info.provider}`);

  // ── Update global registry with ALL found emails ──
  const allVisibleEmails = scrapeAllEmails();
  const emailsToRegister = Array.from(new Set([identity, ...allVisibleEmails]));
  
  const registry = (await extensionStorage.get<GlobalOAuthAccount[]>("oauth_registry")) || [];
  let registryModified = false;

  for (const email of emailsToRegister) {
    if (!email) continue;
    const exists = registry.find(r => r.provider === info.provider && r.identity === email);
    if (!exists) {
      registry.push({
        id: crypto.randomUUID?.() ?? Math.random().toString(36).substring(2),
        provider: info.provider,
        identity: email,
        notes: email === identity ? "Auto-recorded during OAuth login" : "Auto-discovered during OAuth flow",
        is_manual: false,
        created_at: Date.now(),
        updated_at: Date.now()
      });
      registryModified = true;
      log.debug(`[UniversalScraper] Added ${email} (${info.provider}) to registry`);
    }
  }

  if (registryModified) {
    await extensionStorage.set("oauth_registry", registry);
  }

  // ── Queue for approval instead of saving directly ──
  if (info.redirectDomain) {
    const pending = (await extensionStorage.get<PendingOAuthCapture[]>("pending_oauth_captures")) || [];
    const pendingExists = pending.find(p => p.provider === info.provider && p.suggested_domain === info.redirectDomain && p.identity === identity);
    
    if (!pendingExists) {
      pending.push({
        id: crypto.randomUUID?.() ?? Math.random().toString(36).substring(2),
        provider: info.provider,
        identity: identity,
        suggested_domain: info.redirectDomain,
        timestamp: Date.now()
      });
      await extensionStorage.set("pending_oauth_captures", pending);
      log.info(`[UniversalScraper] Queued ${identity} → ${info.redirectDomain} for approval`);
      flashBannerSuccess(identity, info.provider);
    }
  }
}

// ─── SPA Route Watcher ───────────────────────────────────────────────────────

let lastUrl = window.location.href;
let mutationDebounce: ReturnType<typeof setTimeout> | null = null;
let captureObserver: MutationObserver | null = null;
let captureDebounce: ReturnType<typeof setTimeout> | null = null;

function scheduleCapture(info: OAuthInfo, delay = 1500) {
  if (captureDebounce) clearTimeout(captureDebounce);
  captureDebounce = setTimeout(() => captureAndSave(info), delay);
}

function startUniversalCapture() {
  showRecordingBanner();
  const info = extractOAuthInfo();
  if (!info) return;

  scheduleCapture(info, 1500);

  // MutationObserver to catch DOM changes (e.g., email appearing after login_hint chip selection)
  if (!captureObserver) {
    captureObserver = new MutationObserver(() => {
      scheduleCapture(info, 800);
    });
    captureObserver.observe(document.body || document.documentElement, {
      childList: true, subtree: true, attributes: false
    });
  }
}

function stopUniversalCapture() {
  captureObserver?.disconnect();
  captureObserver = null;
  if (captureDebounce) { clearTimeout(captureDebounce); captureDebounce = null; }
  removeBanner();
}

// ─── SPA Navigation Detection ──────────────────────────────────────────────

function setupSpaWatcher() {
  // Intercept pushState / replaceState for SPA navigation
  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);

  const onNavigation = () => {
    const currentUrl = window.location.href;
    if (currentUrl === lastUrl) return;
    lastUrl = currentUrl;
    log.debug(`[SPA] Navigation: ${currentUrl}`);

    // Re-run handlers for the new URL
    if (mutationDebounce) clearTimeout(mutationDebounce);
    mutationDebounce = setTimeout(async () => {
      await HandlerRegistry.runMatchingHandlers(currentUrl);

      // Also check if recording is needed for the new page
      const isRecording = await extensionStorage.get<boolean>("is_recording_oauth");
      const alwaysRecord = await extensionStorage.get<boolean>("always_record_oauth");
      if (isRecording || alwaysRecord) {
        stopUniversalCapture(); // reset state for new page
        startUniversalCapture();
      }
    }, 800);
  };

  history.pushState = (...args) => { origPush(...args); onNavigation(); };
  history.replaceState = (...args) => { origReplace(...args); onNavigation(); };
  window.addEventListener('popstate', onNavigation);

  // Also watch for hash changes (used by some SPAs)
  window.addEventListener('hashchange', onNavigation);

  // MutationObserver as fallback for very aggressive SPAs
  new MutationObserver(() => {
    if (window.location.href !== lastUrl) onNavigation();
  }).observe(document.documentElement, { childList: true, subtree: false });
}

// ─── Storage Change Listener ─────────────────────────────────────────────────

function setupStorageListener() {
  chrome.storage.onChanged.addListener((changes, area) => {
    // Plasmo uses 'local' area by default
    if (area !== 'local' && area !== 'session') return;

    let shouldRecord = false;
    let shouldStop = false;

    if (changes['is_recording_oauth']) {
      if (changes['is_recording_oauth'].newValue) shouldRecord = true;
      else shouldStop = true;
    }
    if (changes['always_record_oauth']) {
      if (changes['always_record_oauth'].newValue) shouldRecord = true;
      else if (!changes['is_recording_oauth']?.newValue) shouldStop = true;
    }

    if (shouldRecord) startUniversalCapture();
    else if (shouldStop) stopUniversalCapture();
  });
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

(async () => {
  // 1. Setup SPA watcher early
  setupSpaWatcher();

  // 2. Listen for storage toggles
  setupStorageListener();

  // 3. Check if recording is already on
  const [isRecording, alwaysRecord] = await Promise.all([
    extensionStorage.get<boolean>("is_recording_oauth"),
    extensionStorage.get<boolean>("always_record_oauth")
  ]);

  if (isRecording || alwaysRecord) {
    startUniversalCapture();
  }

  // 4. Run matching handlers (e.g., Google Linked Apps)
  await HandlerRegistry.runMatchingHandlers(window.location.href);
})();
