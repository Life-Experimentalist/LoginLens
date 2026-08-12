import { describe, expect, it } from 'vitest'

import {
  detectOAuthProviderFromUrl,
  detectOAuthPurpose,
  expandLocalDevPortEntries,
  extractAccountPort,
  extractDomain,
  extractOAuthProvider,
  getLocalhostSubdomainHint,
  getNaturalAliases,
  getPortHint,
  getRootDomain,
  isAppPackageDomain,
  isLocalEnvironment,
  isNonOriginDomain,
  isOAuthPage,
  matchesDomain,
  normalizeLocalHost,
  normalizeOAuthProvider,
  resolveDomainPortHint,
  syncBidirectionalDomainLinks
} from '~/core/utils/domain'
import type { DomainEntry } from '~/core/storage/schema'

describe('isAppPackageDomain', () => {
  it('recognises reverse-DNS bundle IDs', () => {
    expect(isAppPackageDomain('com.example.myapp')).toBe(true)
    expect(isAppPackageDomain('org.signal.android')).toBe(true)
    expect(isAppPackageDomain('io.ionic.starter')).toBe(true)
    expect(isAppPackageDomain('uk.co.mycompany.android')).toBe(true)
  })

  it('resolves the ambiguous case in favour of the web reading', () => {
    // `com.example.app` and `in.pinterest.com` are structurally identical: a
    // reverse-DNS prefix first and a web TLD last. Nothing in the string tells
    // them apart, so the rule is "3+ parts ending in a web TLD is a hostname".
    // A bundle ID whose last segment is also a gTLD therefore reads as a
    // hostname. That is a deliberate trade — misreading a real site as an app
    // would hide it from domain matching, which is the worse failure.
    expect(isAppPackageDomain('com.example.app')).toBe(false)
    expect(isAppPackageDomain('com.example.myapp')).toBe(true)
  })

  it('does not flag ordinary hostnames', () => {
    // The heuristic is positional: a web TLD comes last, a bundle prefix first.
    expect(isAppPackageDomain('google.com')).toBe(false)
    expect(isAppPackageDomain('dash.cloudflare.com')).toBe(false)
    expect(isAppPackageDomain('in.pinterest.com')).toBe(false)
    expect(isAppPackageDomain('app.slack.com')).toBe(false)
  })

  it('does not flag bare multi-part TLDs', () => {
    expect(isAppPackageDomain('co.uk')).toBe(false)
    expect(isAppPackageDomain('com.au')).toBe(false)
  })

  it('rejects URLs and single-label input', () => {
    expect(isAppPackageDomain('https://com.example.app')).toBe(false)
    expect(isAppPackageDomain('localhost')).toBe(false)
    expect(isAppPackageDomain('')).toBe(false)
  })
})

describe('matchesDomain', () => {
  it('matches exactly, ignoring www. and case', () => {
    expect(matchesDomain('github.com', 'github.com')).toBe(true)
    expect(matchesDomain('www.github.com', 'github.com')).toBe(true)
    expect(matchesDomain('GitHub.com', 'github.com')).toBe(true)
  })

  it('does not match a different subdomain by default', () => {
    // dash.cloudflare.com and cloudflare.com are different portals; leaking
    // credentials between them is the failure this guards against.
    expect(matchesDomain('dash.cloudflare.com', 'cloudflare.com')).toBe(false)
    expect(matchesDomain('user1.github.io', 'github.io')).toBe(false)
  })

  it('matches a subdomain only when explicitly allowed', () => {
    expect(matchesDomain('dash.cloudflare.com', 'cloudflare.com', true)).toBe(true)
    // Still not the reverse, and still not siblings.
    expect(matchesDomain('cloudflare.com', 'dash.cloudflare.com', true)).toBe(false)
    expect(matchesDomain('a.example.com', 'b.example.com', true)).toBe(false)
  })
})

describe('extractDomain', () => {
  it('strips scheme, path and www.', () => {
    expect(extractDomain('https://www.github.com/settings/profile')).toBe('github.com')
    expect(extractDomain('http://example.org')).toBe('example.org')
    expect(extractDomain('example.org/some/path')).toBe('example.org')
  })

  it('keeps the port for local development hosts only', () => {
    expect(extractDomain('http://localhost:5173/app')).toBe('localhost:5173')
    expect(extractDomain('http://127.0.0.1:8000')).toBe('127.0.0.1:8000')
    expect(extractDomain('https://example.com:8443/app')).toBe('example.com')
  })

  it('falls back to a best-effort parse on malformed input', () => {
    expect(extractDomain('not a url')).toBe('not a url')
  })
})

describe('getRootDomain', () => {
  it('reduces a hostname to eTLD+1', () => {
    expect(getRootDomain('dash.cloudflare.com')).toBe('cloudflare.com')
    expect(getRootDomain('https://www.a.b.example.com/x')).toBe('example.com')
    expect(getRootDomain('example.com')).toBe('example.com')
  })

  it('handles known multi-part TLDs', () => {
    expect(getRootDomain('shop.example.co.uk')).toBe('example.co.uk')
    expect(getRootDomain('www.example.com.au')).toBe('example.com.au')
  })

  it('returns app package names untouched', () => {
    expect(getRootDomain('com.example.myapp')).toBe('com.example.myapp')
  })
})

describe('isLocalEnvironment', () => {
  it('recognises loopback and private ranges', () => {
    for (const host of [
      'localhost',
      'localhost:3000',
      '127.0.0.1',
      '[::1]',
      'tauri.localhost',
      '192.168.1.5',
      '10.0.0.7',
      '172.16.0.1',
      '172.31.255.254'
    ]) {
      expect(isLocalEnvironment(host), host).toBe(true)
    }
  })

  it('does not treat public hosts or near-miss ranges as local', () => {
    for (const host of ['github.com', 'notlocalhost.com', '172.15.0.1', '172.32.0.1', '']) {
      expect(isLocalEnvironment(host), host).toBe(false)
    }
  })
})

describe('local development helpers', () => {
  it('canonicalises 127.0.0.1 to localhost, preserving the port', () => {
    expect(normalizeLocalHost('127.0.0.1:5678')).toBe('localhost:5678')
    expect(normalizeLocalHost('localhost:5678')).toBe('localhost:5678')
  })

  it('offers the other spelling as an alias', () => {
    expect(getNaturalAliases('localhost:3000')).toEqual(['127.0.0.1:3000'])
    expect(getNaturalAliases('127.0.0.1')).toEqual(['localhost'])
    expect(getNaturalAliases('github.com')).toEqual([])
  })

  it('describes known *.localhost hosts', () => {
    expect(getLocalhostSubdomainHint('tauri.localhost')).toBe('Tauri Desktop App (Rust)')
    expect(getLocalhostSubdomainHint('unknown.localhost')).toBeNull()
  })

  it('names well-known ports and falls back for the rest', () => {
    expect(getPortHint(5173)).toBe('Vite Default')
    expect(getPortHint('5432')).toBe('PostgreSQL')
    expect(getPortHint(64123)).toBe('Custom Port')
  })

  it('finds a port in the domain, the label, or free text', () => {
    expect(extractAccountPort({}, 'localhost:5678')).toBe('5678')
    expect(extractAccountPort({ label: 'Port: 8000' })).toBe('8000')
    expect(extractAccountPort({ notes: 'runs on http://127.0.0.1:9000' })).toBe('9000')
    expect(extractAccountPort({ label: 'Work' })).toBeNull()
  })

  it('summarises the ports behind a local dev entry', () => {
    expect(resolveDomainPortHint({ domain: 'localhost:5173' })).toBe('Vite Default (5173)')
    expect(resolveDomainPortHint({ domain: 'localhost', accounts: [] })).toBe('Portless')
    expect(
      resolveDomainPortHint({
        domain: 'localhost',
        accounts: [{ label: 'Port: 5678' }, { label: 'Port: 8000' }]
      })
    ).toBe('Multi-Port (5678, 8000)')
  })

  it('splits multi-port local entries and merges the two loopback spellings', () => {
    const entries = [
      {
        domain: '127.0.0.1',
        accounts: [
          { id: 'a', label: 'Port: 5678' },
          { id: 'b', label: 'Port: 8000' }
        ]
      },
      { domain: 'localhost:5678', accounts: [{ id: 'c' }] },
      { domain: 'github.com', accounts: [{ id: 'd' }] }
    ]

    const result = expandLocalDevPortEntries(entries)
    const byDomain = new Map(result.map((e) => [e.domain, e]))

    expect(byDomain.get('localhost:5678')!.accounts.map((a: any) => a.id)).toEqual([
      'a',
      'c'
    ])
    expect(byDomain.get('localhost:8000')!.accounts.map((a: any) => a.id)).toEqual(['b'])
    // Public domains pass through untouched.
    expect(byDomain.get('github.com')!.accounts.map((a: any) => a.id)).toEqual(['d'])
  })
})

describe('isNonOriginDomain', () => {
  it('rejects search engines, webmail and aggregators as OAuth origins', () => {
    for (const d of [
      'google.com',
      'www.google.com',
      'bing.com',
      'mail.google.com',
      'chatgpt.com',
      'reddit.com',
      'wikipedia.org',
      ''
    ]) {
      expect(isNonOriginDomain(d), d).toBe(true)
    }
  })

  it('accepts real sites, including the Google properties that are real origins', () => {
    for (const d of ['github.com', 'dash.cloudflare.com', 'accounts.google.com', 'console.cloud.google.com']) {
      expect(isNonOriginDomain(d), d).toBe(false)
    }
  })
})

describe('isOAuthPage', () => {
  it('detects authorization URLs by parameter', () => {
    expect(isOAuthPage('https://example.com/x?client_id=abc')).toBe(true)
    expect(isOAuthPage('https://example.com/x?response_type=code')).toBe(true)
    expect(isOAuthPage('https://example.com/x?SAMLRequest=abc')).toBe(true)
  })

  it('detects authorization URLs by path', () => {
    expect(isOAuthPage('https://github.com/login/oauth/authorize')).toBe(true)
    expect(isOAuthPage('https://id.example.com/realms/master/protocol')).toBe(true)
  })

  it('ignores ordinary pages and unparseable input', () => {
    expect(isOAuthPage('https://example.com/pricing')).toBe(false)
    expect(isOAuthPage('nonsense')).toBe(false)
  })
})

describe('OAuth provider resolution', () => {
  it('reads the provider out of a callback URL', () => {
    expect(extractOAuthProvider('https://app.example.com/api/auth/callback/github')).toBe(
      'github.com'
    )
    expect(extractOAuthProvider('https://app.example.com/cb?provider=google')).toBe(
      'google.com'
    )
    expect(extractOAuthProvider('https://app.example.com/cb?provider=customidp')).toBe(
      'customidp'
    )
    expect(extractOAuthProvider('https://app.example.com/dashboard')).toBeNull()
  })

  it('normalises provider hostnames to a canonical name', () => {
    expect(normalizeOAuthProvider('accounts.google.com')).toBe('google.com')
    expect(normalizeOAuthProvider('https://login.microsoftonline.com/common')).toBe(
      'microsoft.com'
    )
    expect(normalizeOAuthProvider('appleid.apple.com')).toBe('apple.com')
    expect(normalizeOAuthProvider('x.com')).toBe('twitter.com')
    // Anything unrecognised falls back to eTLD+1 rather than being dropped.
    expect(normalizeOAuthProvider('sso.acme.example.com')).toBe('example.com')
  })
})

describe('detectOAuthPurpose', () => {
  it('classifies a plain sign-in as a login', () => {
    expect(detectOAuthPurpose('https://github.com/login/oauth/authorize').purpose).toBe(
      'login'
    )
  })

  it('classifies scoped data access as an integration', () => {
    expect(detectOAuthPurpose(undefined, 'Autofill with LinkedIn')).toEqual({
      purpose: 'integration',
      scopeLabel: 'Resume & Profile Autofill'
    })
    expect(detectOAuthPurpose(undefined, undefined, 'repo user:email')).toEqual({
      purpose: 'integration',
      scopeLabel: 'Code Repository Sync'
    })
    expect(detectOAuthPurpose(undefined, undefined, 'drive.readonly')).toEqual({
      purpose: 'integration',
      scopeLabel: 'Cloud Storage & File Access'
    })
    expect(detectOAuthPurpose(undefined, undefined, 'calendar.events')).toEqual({
      purpose: 'integration',
      scopeLabel: 'Calendar & Contacts Sync'
    })
  })
})

describe('syncBidirectionalDomainLinks', () => {
  const entry = (domain: string, linked: string[] = []): DomainEntry => ({
    domain,
    accounts: [
      {
        id: `acc-${domain}`,
        label: 'Account',
        identities: [`me@${domain}`],
        login_method: { type: 'password' },
        linked_domains: linked,
        updated_at: 1
      }
    ]
  })

  it('makes a one-way link symmetric', () => {
    const result = syncBidirectionalDomainLinks([
      entry('postman.com', ['identity.postman.com']),
      entry('identity.postman.com')
    ])

    const back = result.find((e) => e.domain === 'identity.postman.com')!
    expect(back.accounts[0].linked_domains).toContain('postman.com')
  })

  it('never invents an entry for a domain the vault does not have', () => {
    // Materialising linked-but-absent domains used to fabricate identities like
    // `user@example.com` for sites the user had never visited.
    const result = syncBidirectionalDomainLinks([entry('postman.com', ['nowhere.example'])])

    expect(result).toHaveLength(1)
    expect(result[0].accounts[0].linked_domains).not.toContain('nowhere.example')
  })

  it('auto-links a subdomain to its root when both are present', () => {
    const result = syncBidirectionalDomainLinks([
      entry('example.com'),
      entry('app.example.com')
    ])

    expect(result.find((e) => e.domain === 'app.example.com')!.accounts[0].linked_domains)
      .toContain('example.com')
    expect(result.find((e) => e.domain === 'example.com')!.accounts[0].linked_domains)
      .toContain('app.example.com')
  })

  it('never links a domain to itself', () => {
    const result = syncBidirectionalDomainLinks([entry('example.com', ['example.com'])])

    expect(result[0].accounts[0].linked_domains).not.toContain('example.com')
  })

  it('does not mutate the input', () => {
    const input = [entry('postman.com', ['identity.postman.com']), entry('identity.postman.com')]
    const before = structuredClone(input)

    syncBidirectionalDomainLinks(input)

    expect(input).toEqual(before)
  })

  it('tolerates an empty vault', () => {
    expect(syncBidirectionalDomainLinks([])).toEqual([])
  })
})

describe('detectOAuthProviderFromUrl', () => {
  // The content script runs on every http/https page and attributes whatever
  // email it finds to whatever provider this function names. A page that can
  // talk its way into a well-known provider can therefore write a vault entry
  // the user never created, under a provider that was never involved. Most of
  // these tests are that attack, not the happy path.

  it('recognises the real provider screens', () => {
    const cases: Array<[string, string]> = [
      ['https://accounts.google.com/o/oauth2/v2/auth?client_id=1', 'google.com'],
      ['https://accounts.google.com/signin/oauth/consent', 'google.com'],
      ['https://github.com/login/oauth/authorize?client_id=1', 'github.com'],
      ['https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=1', 'microsoft.com'],
      ['https://appleid.apple.com/auth/authorize?client_id=1', 'apple.com'],
      ['https://x.com/i/oauth2/authorize?client_id=1', 'twitter.com'],
      ['https://twitter.com/i/oauth2/authorize?client_id=1', 'twitter.com'],
      ['https://www.facebook.com/v18.0/dialog/oauth?client_id=1', 'facebook.com'],
      ['https://www.facebook.com/dialog/oauth?client_id=1', 'facebook.com'],
      ['https://discord.com/oauth2/authorize?client_id=1', 'discord.com'],
      ['https://www.linkedin.com/oauth/v2/authorization?client_id=1', 'linkedin.com'],
      ['https://slack.com/oauth/v2/authorize?client_id=1', 'slack.com']
    ]

    for (const [url, expected] of cases) {
      expect(detectOAuthProviderFromUrl(url), url).toBe(expected)
    }
  })

  it('refuses a lookalike host that only ends with the provider as a label', () => {
    expect(
      detectOAuthProviderFromUrl(
        'https://accounts.google.com.example.net/o/oauth2/v2/auth?client_id=1'
      )
    ).not.toBe('google.com')
  })

  it('refuses a provider name that appears only in the path', () => {
    expect(
      detectOAuthProviderFromUrl('https://example.net/accounts.google.com/o/oauth2')
    ).toBeNull()
  })

  it('refuses a provider name that appears only in the query string', () => {
    // The original substring test matched this, so any page could claim to be
    // Google's consent screen by adding a query parameter.
    expect(
      detectOAuthProviderFromUrl(
        'https://example.net/?next=https://github.com/login/oauth/authorize'
      )
    ).toBeNull()
  })

  it('refuses a provider name that sits in the userinfo', () => {
    // `https://github.com@evil.example/...` is served by evil.example. The
    // provider name before the `@` is credentials, not a host.
    expect(
      detectOAuthProviderFromUrl(
        'https://github.com@evil.example/login/oauth/authorize?client_id=1'
      )
    ).toBe('evil.example')
  })

  it('does not treat the provider home page as an authorization screen', () => {
    expect(detectOAuthProviderFromUrl('https://github.com/')).toBeNull()
    expect(detectOAuthProviderFromUrl('https://accounts.google.com/')).toBeNull()
  })

  it('requires a client_id where the host alone is not specific enough', () => {
    // login.microsoftonline.com serves plenty that is not an OAuth consent.
    expect(
      detectOAuthProviderFromUrl('https://login.microsoftonline.com/common/')
    ).toBeNull()
  })

  it('names the page itself for an unrecognised authorization screen', () => {
    // Misfiling a capture is recoverable; attributing it to Google is not.
    expect(
      detectOAuthProviderFromUrl('https://sso.example.net/oauth/authorize?client_id=1')
    ).toBe('sso.example.net')
  })

  it('does not treat an ordinary page as a provider just because of a query param', () => {
    expect(
      detectOAuthProviderFromUrl('https://shop.example.net/products?client_id=1')
    ).toBeNull()
  })

  it('returns null rather than throwing on an unparseable URL', () => {
    expect(detectOAuthProviderFromUrl('not a url')).toBeNull()
    expect(detectOAuthProviderFromUrl('')).toBeNull()
  })
})
