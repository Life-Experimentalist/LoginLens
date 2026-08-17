import type { DomainEntry, IdentityProfile } from '../storage/schema'

// ---------------------------------------------------------------------------
// Domain Matching — Exact by default
// ---------------------------------------------------------------------------
// We intentionally do NOT strip subdomains for matching. This is correct because:
//   - user1.github.io != github.io (different sites, shared hosting)
//   - myapp.workers.dev != workers.dev  (same — Cloudflare Workers)
//   - myapp.netlify.app != another.netlify.app
//   - dash.cloudflare.com is DIFFERENT from cloudflare.com (different portals)
//
// Users should store credentials against the exact subdomain they log into.
// Alias/root-domain grouping is an opt-in feature for the user to configure.
//
// App package names: `com.example.myapp`, `org.signal.android`, etc. These
// come from mobile app credential imports. They are stored verbatim and never
// put through TLD parsing. Detected by `isAppPackageDomain`.
// ---------------------------------------------------------------------------

/**
 * A broad set of known TLD prefixes used as the FIRST segment in reverse-DNS
 * app package names (e.g. com.x.y, org.x.y, io.x.y, uk.co.x.y, etc.).
 * This is intentionally expansive — we add country TLDs and common namespace prefixes.
 */
const APP_REVERSE_DNS_PREFIXES = new Set([
  // Generic TLDs
  'com',
  'org',
  'net',
  'io',
  'co',
  'gov',
  'edu',
  'me',
  'tv',
  'info',
  'biz',
  'dev',
  'cloud',
  'tech',
  'ai',
  'web',
  'online',
  'store',
  'site',
  // Country TLDs commonly used in app IDs
  'uk',
  'de',
  'fr',
  'jp',
  'au',
  'br',
  'in',
  'nl',
  'es',
  'it',
  'ca',
  'ru',
  'cn',
  'kr',
  'se',
  'no',
  'fi',
  'pl',
  'ch',
  'at',
  'be',
  'nz',
  'mx',
  'ar',
  // Common open-source namespace prefixes
  'io',
  'dev',
  'pub'
])

/**
 * Returns true if the string looks like a mobile/desktop app package name
 * (reverse-DNS notation). Detects ANY prefix pattern:
 *   com.an1.store, org.signal.android, io.ionic.myapp, uk.co.mycompany.app
 *
 * Key heuristic: in a web domain TLDs come LAST; in an app bundle ID the TLD
 * comes FIRST. So if parts[0] is a known TLD prefix AND the string has at least
 * 2 parts AND doesn't start with http, it's almost certainly an app bundle ID.
 *
 * Does NOT flag normal domains like `google.com` (TLD is not the first part).
 */
const COMMON_WEB_TLDS = new Set([
  'com',
  'org',
  'net',
  'gov',
  'edu',
  'io',
  'co',
  'in',
  'uk',
  'de',
  'fr',
  'jp',
  'au',
  'br',
  'nl',
  'es',
  'it',
  'ca',
  'ru',
  'cn',
  'kr',
  'se',
  'no',
  'fi',
  'pl',
  'ch',
  'at',
  'be',
  'nz',
  'mx',
  'ar',
  'xyz',
  'info',
  'biz',
  'dev',
  'app',
  'ai',
  'me',
  'tv',
  'site',
  'online',
  'store',
  'tech',
  'cloud'
])

export function isAppPackageDomain(input: string): boolean {
  if (!input || input.startsWith('http') || input.includes('://')) return false
  const parts = input.toLowerCase().split('.')
  if (parts.length < 2) return false

  const lastPart = parts[parts.length - 1]

  // If a hostname has 3+ parts and ends with a web TLD (e.g. in.pinterest.com, app.slack.com),
  // it is a web domain with a subdomain, NOT a mobile app package ID.
  if (parts.length >= 3 && COMMON_WEB_TLDS.has(lastPart)) {
    return false
  }

  // First segment must be a known TLD prefix
  if (!APP_REVERSE_DNS_PREFIXES.has(parts[0])) return false

  if (parts.length === 2) {
    const knownMultiPartTLD = [
      'co.uk',
      'com.au',
      'co.in',
      'com.br',
      'co.jp',
      'org.uk',
      'com.mx'
    ]
    if (knownMultiPartTLD.includes(input.toLowerCase())) return false
    if (COMMON_WEB_TLDS.has(lastPart)) return false
  }

  return true
}

/**
 * Exact domain match (with www. stripped).
 * "dash.cloudflare.com" only matches "dash.cloudflare.com", not "cloudflare.com" by default.
 * App package domains are matched verbatim.
 *
 * If `allowSubdomains` is true, a saved domain like `dash.cloudflare.com` will match
 * if the effectiveHostname is `cloudflare.com`.
 */
export function matchesDomain(
  savedDomain: string,
  effectiveHostname: string,
  allowSubdomains = false
): boolean {
  const normalize = (d: string) =>
    d
      .replace(/^www\./, '')
      .toLowerCase()
      .trim()
  const saved = normalize(savedDomain)
  const effective = normalize(effectiveHostname)

  if (saved === effective) return true

  if (allowSubdomains) {
    // If we are on cloudflare.com, we should see dash.cloudflare.com
    if (saved.endsWith('.' + effective)) return true
  }

  return false
}

export const KNOWN_PORTS: Record<string, string> = {
  // Web Servers & Proxies
  '80': 'HTTP Default',
  '443': 'HTTPS Default',
  '8080': 'HTTP Alternate (Tomcat / Proxy)',
  '8443': 'HTTPS Alternate',
  '8000': 'Web Server Alternate (Django / Python)',
  
  // Frontend Dev Servers
  '3000': 'React / Next.js / Node Default',
  '3001': 'React / Node Alternate',
  '4000': 'Jekyll / Hexo / Web Server',
  '4200': 'Angular CLI',
  '5173': 'Vite Default',
  '8081': 'Metro Bundler (React Native)',
  '9000': 'Webpack Dev Server',

  // Backend Frameworks
  '5000': 'Flask / ASP.NET',
  '5001': 'ASP.NET HTTPS',
  '8008': 'Django Alternate',
  '8888': 'Jupyter Notebook / MAMP',

  // Databases & Caches
  '3306': 'MySQL / MariaDB',
  '5432': 'PostgreSQL',
  '27017': 'MongoDB',
  '6379': 'Redis',
  '11211': 'Memcached',
  '1433': 'SQL Server',
  '9200': 'Elasticsearch',

  // Tooling & Admin & Automation
  '5678': 'n8n Workflow Automation',
  '7474': 'Neo4j Database Admin',
  '8501': 'Streamlit Application',
  '15672': 'RabbitMQ Management',
  '9443': 'Portainer Docker Admin',
  '8025': 'Mailhog / Mailpit',
  '9090': 'Prometheus',
  '5601': 'Kibana',
  '3030': 'Figma / Grafana / Parse',
  '31580': 'Kubernetes NodePort Service',

  // Miscs
  '22': 'SSH',
  '21': 'FTP',
  '25': 'SMTP'
}

export function getPortHint(port: string | number): string {
  const p = String(port)
  return KNOWN_PORTS[p] || 'Custom Port'
}

/**
 * Returns detailed port metadata (port number, hint, full label) for an account or domain.
 */
export function getAccountPortDetails(
  acc: { label?: string; api_endpoint?: string; notes?: string; identities?: string[]; api_title?: string },
  domain?: string
): { port: string; hint: string; fullHint: string } | null {
  const port = extractAccountPort(acc, domain)
  if (!port) return null
  const hint = getPortHint(port)
  return {
    port,
    hint,
    fullHint: `${hint} (${port})`
  }
}

/**
 * Extracts explicit or embedded port number from an account profile or domain.
 */
export function extractAccountPort(acc: { label?: string; api_endpoint?: string; notes?: string; identities?: string[]; api_title?: string }, domain?: string): string | null {
  // 1. Check explicit domain string (e.g. localhost:5678 or 127.0.0.1:8000)
  if (domain && domain.includes(':')) {
    const p = domain.split(':')[1]
    if (p && /^\d+$/.test(p)) return p
  }

  // 2. Check acc.label (e.g. "Port: 5678" or "localhost:5678" or "127.0.0.1:8000")
  if (acc.label) {
    const labelMatch = acc.label.match(/(?:localhost|127\.0\.0\.1|Port):\s*(\d+)/i) || acc.label.match(/:(\d{2,5})\b/)
    if (labelMatch && labelMatch[1]) return labelMatch[1]
  }

  // 3. Check api_endpoint, notes, api_title, or identities for URL patterns like http://127.0.0.1:5678
  const textToScan = [
    acc.api_endpoint,
    acc.notes,
    acc.api_title,
    ...(acc.identities || [])
  ].filter(Boolean).join(' ')

  const urlMatch = textToScan.match(/(?:localhost|127\.0\.0\.1|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d{2,5})/i) || textToScan.match(/Port:\s*(\d{2,5})/i)
  if (urlMatch && urlMatch[1]) return urlMatch[1]

  return null
}

/**
 * Resolves a comprehensive port hint for local dev domain entries.
 * Inspects domain string and all child account entries.
 */
export function resolveDomainPortHint(data: { domain: string; accounts?: Array<{ label?: string; api_endpoint?: string; notes?: string; identities?: string[]; api_title?: string }> }): string {
  if (data.domain.includes(':')) {
    const p = data.domain.split(':')[1]
    return `${getPortHint(p)} (${p})`
  }

  // Scan all accounts inside this domain entry
  const foundPorts = new Set<string>()
  if (data.accounts) {
    for (const acc of data.accounts) {
      const p = extractAccountPort(acc, data.domain)
      if (p) foundPorts.add(p)
    }
  }

  const ports = Array.from(foundPorts)
  if (ports.length === 0) return 'Portless'
  if (ports.length === 1) return `${getPortHint(ports[0])} (${ports[0]})`
  return `Multi-Port (${ports.join(', ')})`
}

/**
 * Normalizes localhost and 127.0.0.1 to a canonical hostname.
 * Both "localhost" and "127.0.0.1" map to "localhost" as the canonical form.
 * Preserves port if present: "127.0.0.1:5678" -> "localhost:5678"
 */
export function normalizeLocalHost(domain: string): string {
  if (!domain) return domain
  return domain.replace(/^127\.0\.0\.1/i, 'localhost')
}

/**
 * Known *.localhost subdomain identifiers and their purpose descriptions.
 */
export const KNOWN_LOCALHOST_SUBDOMAINS: Record<string, string> = {
  'tauri.localhost': 'Tauri Desktop App (Rust)',
  'wails.localhost': 'Wails Desktop App (Go)',
}

/**
 * Returns a human-readable description for known *.localhost subdomains.
 */
export function getLocalhostSubdomainHint(domain: string): string | null {
  const lower = domain.toLowerCase().trim().split(':')[0]
  return KNOWN_LOCALHOST_SUBDOMAINS[lower] || null
}

/**
 * Splits multi-port local dev entries (e.g. 127.0.0.1 with accounts on port 5678 and 8000)
 * into distinct port-specific domain entries (localhost:5678 and localhost:8000).
 *
 * Also merges localhost and 127.0.0.1 entries with the same port into a single unified card.
 */
export function expandLocalDevPortEntries<T extends { domain: string; accounts: any[] }>(entries: T[]): T[] {
  const groupMap = new Map<string, T>()
  const nonLocalEntries: T[] = []

  for (const entry of entries) {
    if (!isLocalEnvironment(entry.domain)) {
      nonLocalEntries.push(entry)
      continue
    }

    const canonicalBase = normalizeLocalHost(entry.domain.split(':')[0])

    for (const acc of entry.accounts) {
      const explicitPort = extractAccountPort(acc, entry.domain)
      let targetDomain = canonicalBase

      if (entry.domain.includes(':')) {
        targetDomain = normalizeLocalHost(entry.domain)
      } else if (explicitPort) {
        targetDomain = `${canonicalBase}:${explicitPort}`
      }

      if (!groupMap.has(targetDomain)) {
        groupMap.set(targetDomain, {
          ...entry,
          domain: targetDomain,
          accounts: [acc]
        } as T)
      } else {
        const existing = groupMap.get(targetDomain)!
        if (!existing.accounts.some((a: any) => a.id === acc.id)) {
          existing.accounts.push(acc)
        }
      }
    }
  }

  return [...Array.from(groupMap.values()), ...nonLocalEntries]
}

/**
 * Returns natural aliases for local development hostnames (localhost <-> 127.0.0.1).
 */
export function getNaturalAliases(domain: string): string[] {
  if (!domain) return []
  const lower = domain.toLowerCase().trim()
  if (lower.startsWith('localhost')) {
    return [lower.replace('localhost', '127.0.0.1')]
  }
  if (lower.startsWith('127.0.0.1')) {
    return [lower.replace('127.0.0.1', 'localhost')]
  }
  return []
}

/**
 * Checks if a domain string represents a local development environment.
 * Examples: localhost, 127.0.0.1, 192.168.1.5, [::1], tauri.localhost, wails.localhost
 */
export function isLocalEnvironment(hostname: string): boolean {
  if (!hostname) return false
  const trimmed = hostname.toLowerCase().trim()
  // An IPv6 literal is bracketed and the brackets contain colons. Splitting on
  // ':' to drop the port turned "[::1]" into "[", so the loopback test below
  // could never fire for IPv6 despite explicitly checking for it.
  const lower = trimmed.startsWith('[')
    ? trimmed.slice(0, trimmed.indexOf(']') + 1) || trimmed
    : trimmed.split(':')[0]
  if (lower === 'localhost') return true
  if (lower === '127.0.0.1' || lower === '[::1]') return true
  // *.localhost subdomains (tauri.localhost, wails.localhost, etc.)
  if (lower.endsWith('.localhost')) return true
  
  if (/^192\.168\.\d+\.\d+$/.test(lower)) return true
  if (/^10\.\d+\.\d+\.\d+$/.test(lower)) return true
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+$/.test(lower)) return true
  
  return false
}

/**
 * Checks if a domain is a search engine, webmail client, AI portal, or content aggregator
 * that should NEVER be recorded as an OAuth target origin site.
 */
export function isNonOriginDomain(domain: string): boolean {
  if (!domain) return true
  const d = domain.toLowerCase().trim().replace(/^www\./, '').split(':')[0]

  const NON_ORIGIN_DOMAINS = new Set([
    'google.com',
    'google.co.in',
    'google.de',
    'google.co.uk',
    'bing.com',
    'duckduckgo.com',
    'yahoo.com',
    'baidu.com',
    'yandex.com',
    'ecosia.org',
    'startpage.com',
    'search.yahoo.com',
    'mail.google.com',
    'outlook.live.com',
    'mail.yahoo.com',
    'gemini.google.com',
    'chatgpt.com',
    'youtube.com',
    'en.wikipedia.org',
    'wikipedia.org',
    'iana.org',
    'reddit.com',
    't.co',
    'linkedin.com',
    'out.reddit.com',
    'advanced-ip-scanner.com',
    'apache.org'
  ])

  if (NON_ORIGIN_DOMAINS.has(d)) return true
  if (d.endsWith('.google.com') && d !== 'accounts.google.com' && !d.includes('cloud')) return true

  return false
}

/**
 * Robustly extracts the domain from a URL, preserving the port for local environments.
 */
export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`)
    const hostname = parsed.hostname.replace(/^www\./, '')
    if (isLocalEnvironment(hostname) && parsed.port) {
      return `${hostname}:${parsed.port}`
    }
    return hostname
  } catch {
    return url.replace(/^www\./, '').split('/')[0]
  }
}

/**
 * Returns the root domain (eTLD+1) — used only for DISPLAY purposes
 * (e.g. showing "cloudflare.com" in the OAuth banner, not for matching).
 * Never used for credential filtering.
 * App package domains are returned as-is.
 */
export function getRootDomain(input: string): string {
  if (isAppPackageDomain(input)) return input
  try {
    let hostname = input
    if (input.startsWith('http://') || input.startsWith('https://')) {
      const parsed = new URL(input)
      hostname = parsed.hostname.replace(/^www\./, '')
      if (isLocalEnvironment(hostname) && parsed.port) {
        return `${hostname}:${parsed.port}`
      }
    }
    hostname = hostname.replace(/^www\./, '')
    const parts = hostname.split('.')
    if (parts.length <= 2) return hostname

    // Common multi-part TLDs
    const multiPartTLDs = [
      'co.uk',
      'com.au',
      'co.in',
      'com.br',
      'co.jp',
      'org.uk',
      'net.au'
    ]
    const lastTwo = parts.slice(-2).join('.')
    if (multiPartTLDs.includes(lastTwo)) {
      return parts.slice(-3).join('.')
    }
    return parts.slice(-2).join('.')
  } catch {
    return input
  }
}
/**
 * Automatically classifies an OAuth flow into either:
 * - 'login': Primary authentication/sign-in method for the domain.
 * - 'integration': Data link / resume autofill / resource scope (e.g. LinkedIn autofill, GitHub repo access, Google Drive).
 */
export function detectOAuthPurpose(
  url?: string,
  buttonText?: string,
  scopes?: string
): { purpose: 'login' | 'integration'; scopeLabel?: string } {
  const combined = [url, buttonText, scopes].filter(Boolean).join(' ').toLowerCase()

  const isAutofillResume = /autofill|resume|profile_import|import_profile|job_apply|screening|oneclick|makipeople|smartrecruiters/i.test(combined)
  const isRepoAccess = /\brepo\b|repositories|gist|code_read|code_write/i.test(combined)
  const isDriveAccess = /\bdrive\b|storage|files|documents|google_drive/i.test(combined)
  const isCalendarContacts = /calendar|contacts|contacts_read|schedule/i.test(combined)
  const isExplicitConnect = /connect_|link_|sync_|attach_|import_/i.test(combined)

  if (isAutofillResume) {
    return { purpose: 'integration', scopeLabel: 'Resume & Profile Autofill' }
  }
  if (isRepoAccess) {
    return { purpose: 'integration', scopeLabel: 'Code Repository Sync' }
  }
  if (isDriveAccess) {
    return { purpose: 'integration', scopeLabel: 'Cloud Storage & File Access' }
  }
  if (isCalendarContacts) {
    return { purpose: 'integration', scopeLabel: 'Calendar & Contacts Sync' }
  }
  if (isExplicitConnect && !/sign_in|login|log_in|register|auth/i.test(combined)) {
    return { purpose: 'integration', scopeLabel: 'Third-Party Data Link' }
  }

  return { purpose: 'login', scopeLabel: undefined }
}

/**
 * True for the host itself or a real subdomain of it — never a substring.
 *
 * Use this anywhere a decision is made about *which site we are on*. The
 * obvious `hostname.includes('github.com')` is satisfied by
 * `github.com.example.net`, a domain anybody can register, and every caller
 * here goes on to read an identity out of page-controlled DOM.
 */
export function isHostOrSubdomainOf(hostname: string, domain: string): boolean {
  const host = (hostname || '').toLowerCase().replace(/\.$/, '')
  const target = (domain || '').toLowerCase().replace(/\.$/, '')
  if (!host || !target) return false
  return host === target || host.endsWith('.' + target)
}

/** Local alias kept short for the rule table below. */
const hostIs = isHostOrSubdomainOf

/**
 * The providers we recognise by sight, matched on host *and* path.
 *
 * Deliberately not a substring test over the whole URL. Anyone can serve
 * `https://example.net/?next=accounts.google.com/o/oauth2`, and matching that
 * would let an arbitrary page have whatever email it renders recorded as the
 * user's Google identity — a vault entry the user never created, attributed to
 * a provider that was never involved.
 */
const PROVIDER_RULES: Array<{
  provider: string
  hosts: string[]
  path?: RegExp
  requiresClientId?: boolean
}> = [
  {
    provider: 'google.com',
    hosts: ['accounts.google.com'],
    path: /^\/(o\/oauth2|signin\/oauth|v3\/signin)/
  },
  {
    provider: 'github.com',
    hosts: ['github.com'],
    path: /^\/login\/oauth\/authorize/
  },
  {
    provider: 'microsoft.com',
    hosts: ['login.microsoftonline.com'],
    requiresClientId: true
  },
  { provider: 'apple.com', hosts: ['appleid.apple.com'], path: /auth/ },
  {
    provider: 'apple.com',
    hosts: ['appleid.apple.com'],
    requiresClientId: true
  },
  {
    provider: 'twitter.com',
    hosts: ['twitter.com', 'x.com'],
    path: /^\/i\/oauth2/
  },
  {
    provider: 'facebook.com',
    hosts: ['facebook.com'],
    // `/dialog/oauth` and the versioned `/v18.0/dialog/oauth`.
    path: /^\/(v\d+(\.\d+)?\/)?dialog\/oauth/
  },
  {
    provider: 'discord.com',
    hosts: ['discord.com'],
    path: /^\/oauth2\/authorize/
  },
  {
    provider: 'linkedin.com',
    hosts: ['linkedin.com'],
    path: /^\/oauth\/v2\/authorization/
  },
  {
    provider: 'slack.com',
    hosts: ['slack.com'],
    path: /^\/oauth\/v2\/authorize/
  }
]

/**
 * Which identity provider's sign-in screen this URL is, if any.
 *
 * Returns a well-known provider domain for the recognised list, the page's own
 * hostname for an unrecognised authorization screen, and `null` for everything
 * else. The generic case names the page itself, so it can misfile a capture but
 * cannot attribute one to a provider that was not involved.
 */
export function detectOAuthProviderFromUrl(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  for (const rule of PROVIDER_RULES) {
    if (!rule.hosts.some((h) => hostIs(parsed.hostname, h))) continue
    if (rule.requiresClientId && !parsed.searchParams.has('client_id')) continue
    if (rule.path && !rule.path.test(parsed.pathname)) continue
    return rule.provider
  }

  if (
    parsed.searchParams.has('client_id') &&
    // Scoped to the path: a `?next=/oauth/...` on an unrelated page is not an
    // authorization screen.
    /oauth|authorize|auth/.test(parsed.pathname)
  ) {
    return parsed.hostname
  }

  return null
}

/**
 * Detects whether a URL is an OAuth 2.0 / OIDC / SAML authorization page
 * by inspecting URL parameters and path patterns — no hardcoded provider list.
 */
export function isOAuthPage(url: string): boolean {
  try {
    const parsed = new URL(url)
    const params = parsed.searchParams

    const hasOAuthParams =
      params.has('response_type') ||
      params.has('client_id') ||
      params.has('redirect_uri') ||
      params.has('code') ||
      params.has('access_token') ||
      params.has('id_token') ||
      params.has('grant_type') ||
      params.has('SAMLRequest')

    const hasSSOParams =
      params.has('continue') ||
      params.has('return_to') ||
      params.has('returnTo') ||
      params.has('next') ||
      params.has('callback_url') ||
      params.has('redirect_url') ||
      params.has('return_url')

    const oauthPaths = [
      '/oauth/authorize',
      '/oauth2/authorize',
      '/o/oauth2/auth',
      '/connect/authorize',
      '/auth/authorize',
      '/login/oauth/authorize',
      '/openid/connect',
      '/sso/',
      '/saml/',
      '/realms/'
    ]
    const pathMatches = oauthPaths.some((p) =>
      parsed.pathname.toLowerCase().includes(p)
    )

    return hasOAuthParams || hasSSOParams || pathMatches
  } catch {
    return false
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
    const parsed = new URL(url)

    // Check common query parameters
    let providerName =
      parsed.searchParams.get('provider') ||
      parsed.searchParams.get('login_type') ||
      parsed.searchParams.get('auth_provider') ||
      parsed.searchParams.get('connection')

    // Check path for common NextAuth/Passport patterns (e.g. /api/auth/callback/github)
    if (!providerName) {
      const match = parsed.pathname.match(/\/callback\/([^/?]+)/i)
      if (match && match[1]) {
        providerName = match[1]
      }
    }

    if (!providerName) return null

    providerName = providerName.toLowerCase()

    // Map common string identifiers to actual root domains for the Vault
    const providerDomainMap: Record<string, string> = {
      github: 'github.com',
      google: 'google.com',
      facebook: 'facebook.com',
      twitter: 'twitter.com',
      microsoft: 'microsoft.com',
      apple: 'apple.com',
      linkedin: 'linkedin.com',
      discord: 'discord.com',
      twitch: 'twitch.tv',
      auth0: 'auth0.com',
      okta: 'okta.com'
    }

    return providerDomainMap[providerName] || providerName
  } catch {
    return null
  }
}

/**
 * Normalizes any OAuth provider input (e.g. "accounts.google.com", "login.microsoftonline.com")
 * to its canonical root domain ("google.com", "microsoft.com").
 */
export function normalizeOAuthProvider(input: string): string {
  if (!input) return input
  let domain = input.toLowerCase().trim()
  if (domain.startsWith('http://') || domain.startsWith('https://')) {
    try {
      domain = extractDomain(domain)
    } catch {}
  }
  domain = domain.replace(/^www\./, '')

  if (domain.includes('google.com') || domain.includes('googleapis.com'))
    return 'google.com'
  if (domain.includes('github.com')) return 'github.com'
  if (
    domain.includes('microsoftonline.com') ||
    domain.includes('microsoft.com') ||
    domain.includes('live.com')
  )
    return 'microsoft.com'
  if (domain.includes('appleid.apple.com') || domain.includes('apple.com'))
    return 'apple.com'
  if (domain.includes('twitter.com') || domain.includes('x.com'))
    return 'twitter.com'
  if (domain.includes('facebook.com')) return 'facebook.com'
  if (domain.includes('discord.com')) return 'discord.com'
  if (domain.includes('linkedin.com')) return 'linkedin.com'

  return getRootDomain(domain)
}

/**
 * Sweeps all saved accounts and enforces 2-Way Symmetric Mirror Linking across domains.
 * If postman.com is linked to identity.postman.com, identity.postman.com will automatically
 * be linked back to postman.com bidirectionally.
 */
export function syncBidirectionalDomainLinks(savedAccounts: DomainEntry[]): DomainEntry[] {
  if (!Array.isArray(savedAccounts) || savedAccounts.length === 0) return savedAccounts || []

  const domainMap = new Map<string, DomainEntry>()
  savedAccounts.forEach((d) => {
    if (d && d.domain) {
      domainMap.set(d.domain.toLowerCase(), {
        ...d,
        accounts: d.accounts.map((a: IdentityProfile) => ({ ...a, linked_domains: [...(a.linked_domains || [])] }))
      })
    }
  })

  // Build 2-way adjacency list
  const adjacency = new Map<string, Set<string>>()
  const getNeighbors = (dom: string) => {
    const key = dom.toLowerCase()
    if (!adjacency.has(key)) adjacency.set(key, new Set())
    return adjacency.get(key)!
  }

  // 1. Gather explicit links & root domain subdomains
  domainMap.forEach((entry, dom) => {
    entry.accounts.forEach((acc: IdentityProfile) => {
      ;(acc.linked_domains || []).forEach((ld: string) => {
        const cleanLd = ld.toLowerCase().trim()
        if (cleanLd && cleanLd !== dom) {
          getNeighbors(dom).add(cleanLd)
          getNeighbors(cleanLd).add(dom)
        }
      })
    })

    // Auto-link subdomains to their root domain e.g. identity.postman.com <-> postman.com
    const root = getRootDomain(dom)
    if (root && root !== dom && !isLocalEnvironment(dom)) {
      getNeighbors(dom).add(root)
      getNeighbors(root).add(dom)
    }
  })

  // 2. Propagate 2-way symmetric links across the domains the user actually has.
  //
  // We only ever ANNOTATE existing entries. An earlier version also
  // materialised entries for domains that had no accounts, copying a "donor"
  // entry's accounts or, with no donor, inventing one with a fabricated
  // identity of `user@<domain>`. That wrote credentials into the vault for
  // sites the user had never visited, inflated the account count, and fed
  // phantom rows into password-reuse analysis. Linking metadata must never
  // create identities.
  //
  // This walks every entry rather than only the ones that gained a link.
  // Iterating the adjacency map instead meant a domain with no links at all was
  // never visited, so a `linked_domains` pointing at a since-deleted domain (or
  // at itself) survived untouched — the dangling link this filter exists to
  // remove.
  domainMap.forEach((entry, dom) => {
    const linkedSet = adjacency.get(dom) ?? new Set<string>()

    entry.accounts = entry.accounts.map((acc: IdentityProfile) => {
      const merged = new Set([
        ...(acc.linked_domains || []),
        ...Array.from(linkedSet)
      ])
      return {
        ...acc,
        // Only keep links that point at domains the vault actually knows about,
        // so the UI never renders a link to a nonexistent entry.
        linked_domains: Array.from(merged).filter(
          (d) => d !== dom && domainMap.has(d)
        )
      }
    })
  })

  return Array.from(domainMap.values())
}
