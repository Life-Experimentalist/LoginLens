// ---------------------------------------------------------------------------
// Domain Matching — Exact by default
// ---------------------------------------------------------------------------
// We intentionally do NOT strip subdomains for matching. This is correct because:
//   - vkrishna04.github.io != github.io (different sites, shared hosting)
//   - myapp.workers.dev != workers.dev  (same — Cloudflare Workers)
//   - myapp.netlify.app != another.netlify.app
//   - dash.cloudflare.com is DIFFERENT from cloudflare.com (different portals)
//
// Users should store credentials against the exact subdomain they log into.
// Alias/root-domain grouping is an opt-in feature for the user to configure.
// ---------------------------------------------------------------------------

/**
 * Exact domain match (with www. stripped).
 * "dash.cloudflare.com" only matches "dash.cloudflare.com", not "cloudflare.com".
 */
export function matchesDomain(savedDomain: string, effectiveHostname: string): boolean {
  const normalize = (d: string) => d.replace(/^www\./, "").toLowerCase().trim();
  return normalize(savedDomain) === normalize(effectiveHostname);
}

/**
 * Returns the root domain (eTLD+1) — used only for DISPLAY purposes
 * (e.g. showing "cloudflare.com" in the OAuth banner, not for matching).
 * Never used for credential filtering.
 */
export function getRootDomain(input: string): string {
  try {
    let hostname = input;
    if (input.startsWith("http://") || input.startsWith("https://")) {
      hostname = new URL(input).hostname;
    }
    hostname = hostname.replace(/^www\./, "");
    const parts = hostname.split(".");
    if (parts.length <= 2) return hostname;

    // Common multi-part TLDs
    const multiPartTLDs = ["co.uk", "com.au", "co.in", "com.br", "co.jp", "org.uk", "net.au"];
    const lastTwo = parts.slice(-2).join(".");
    if (multiPartTLDs.includes(lastTwo)) {
      return parts.slice(-3).join(".");
    }
    return parts.slice(-2).join(".");
  } catch {
    return input;
  }
}

/**
 * Detects whether a URL is an OAuth 2.0 / OIDC / SAML authorization page
 * by inspecting URL parameters and path patterns — no hardcoded provider list.
 */
export function isOAuthPage(url: string): boolean {
  try {
    const parsed = new URL(url);
    const params = parsed.searchParams;

    const hasOAuthParams =
      params.has("response_type") ||
      params.has("client_id") ||
      params.has("redirect_uri") ||
      params.has("code") ||
      params.has("access_token") ||
      params.has("id_token") ||
      params.has("grant_type") ||
      params.has("SAMLRequest");

    const hasSSOParams =
      params.has("continue") ||
      params.has("return_to") ||
      params.has("returnTo") ||
      params.has("next") ||
      params.has("callback_url") ||
      params.has("redirect_url") ||
      params.has("return_url");

    const oauthPaths = [
      "/oauth/authorize", "/oauth2/authorize", "/o/oauth2/auth",
      "/connect/authorize", "/auth/authorize", "/login/oauth/authorize",
      "/openid/connect", "/sso/", "/saml/", "/realms/",
    ];
    const pathMatches = oauthPaths.some(p => parsed.pathname.toLowerCase().includes(p));

    return hasOAuthParams || hasSSOParams || pathMatches;
  } catch {
    return false;
  }
}

/**
 * Attempts to extract the OAuth provider name from a callback URL if the actual 
 * provider domain (e.g. github.com) was skipped due to fast 302 server-side redirects.
 * Examples: 
 *   ?provider=github
 *   /api/auth/callback/google
 */
export function extractOAuthProvider(url: string): string | null {
  try {
    const parsed = new URL(url);
    
    // Check common query parameters
    let providerName = parsed.searchParams.get("provider") || 
                       parsed.searchParams.get("login_type") || 
                       parsed.searchParams.get("auth_provider") ||
                       parsed.searchParams.get("connection");
                       
    // Check path for common NextAuth/Passport patterns (e.g. /api/auth/callback/github)
    if (!providerName) {
      const match = parsed.pathname.match(/\/callback\/([^/?]+)/i);
      if (match && match[1]) {
        providerName = match[1];
      }
    }

    if (!providerName) return null;
    
    providerName = providerName.toLowerCase();
    
    // Map common string identifiers to actual root domains for the Vault
    const providerDomainMap: Record<string, string> = {
      "github": "github.com",
      "google": "google.com",
      "facebook": "facebook.com",
      "twitter": "twitter.com",
      "microsoft": "microsoft.com",
      "apple": "apple.com",
      "linkedin": "linkedin.com",
      "discord": "discord.com",
      "twitch": "twitch.tv",
      "auth0": "auth0.com",
      "okta": "okta.com"
    };

    return providerDomainMap[providerName] || providerName;
  } catch {
    return null;
  }
}
