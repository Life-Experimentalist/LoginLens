import { describe, expect, it } from 'vitest'
import { hasSavedOAuthAccount } from '~/core/utils/oauth-dedup'
import type { DomainEntry } from '~/core/storage/schema'

function oauthEntry(
  domain: string,
  provider: string,
  identity: string,
  linked?: string[]
): DomainEntry {
  return {
    domain,
    accounts: [
      {
        id: `${domain}-${identity}`,
        label: 'Personal',
        identities: [identity],
        login_method: { type: 'oauth', provider },
        linked_domains: linked,
        updated_at: 0
      }
    ]
  }
}

describe('hasSavedOAuthAccount', () => {
  const vault: DomainEntry[] = [
    oauthEntry('roadmap.sh', 'github.com', 'krishna@example.com'),
    oauthEntry('icloud.com', 'apple.com', 'me@example.com', ['apple.com'])
  ]

  it('matches an exact domain, provider and identity', () => {
    expect(
      hasSavedOAuthAccount(vault, 'roadmap.sh', 'github.com', 'krishna@example.com')
    ).toBe(true)
  })

  it('matches a subdomain of the saved domain', () => {
    expect(
      hasSavedOAuthAccount(vault, 'app.roadmap.sh', 'github.com', 'krishna@example.com')
    ).toBe(true)
  })

  it('folds identity case', () => {
    expect(
      hasSavedOAuthAccount(vault, 'roadmap.sh', 'github.com', 'Krishna@Example.com')
    ).toBe(true)
  })

  it('normalises the provider on both sides', () => {
    expect(
      hasSavedOAuthAccount(
        vault,
        'roadmap.sh',
        'https://github.com/login/oauth/authorize',
        'krishna@example.com'
      )
    ).toBe(true)
  })

  it('matches through a linked mirror domain', () => {
    expect(
      hasSavedOAuthAccount(vault, 'apple.com', 'apple.com', 'me@example.com')
    ).toBe(true)
  })

  it('does not match a different identity on the same site', () => {
    expect(
      hasSavedOAuthAccount(vault, 'roadmap.sh', 'github.com', 'someone@example.com')
    ).toBe(false)
  })

  it('does not match a different provider on the same site', () => {
    expect(
      hasSavedOAuthAccount(vault, 'roadmap.sh', 'google.com', 'krishna@example.com')
    ).toBe(false)
  })

  it('does not match an unrelated site', () => {
    expect(
      hasSavedOAuthAccount(vault, 'example.net', 'github.com', 'krishna@example.com')
    ).toBe(false)
  })

  it('ignores password accounts stored for the same site', () => {
    const passwordOnly: DomainEntry[] = [
      {
        domain: 'roadmap.sh',
        accounts: [
          {
            id: 'p1',
            label: 'Personal',
            identities: ['krishna@example.com'],
            login_method: { type: 'password' },
            updated_at: 0
          }
        ]
      }
    ]
    expect(
      hasSavedOAuthAccount(passwordOnly, 'roadmap.sh', 'github.com', 'krishna@example.com')
    ).toBe(false)
  })

  it('tolerates a missing or malformed vault', () => {
    expect(hasSavedOAuthAccount(null, 'a.com', 'github.com', 'x@y.com')).toBe(false)
    expect(hasSavedOAuthAccount(undefined, 'a.com', 'github.com', 'x@y.com')).toBe(false)
    expect(hasSavedOAuthAccount(vault, '', 'github.com', 'x@y.com')).toBe(false)
    expect(hasSavedOAuthAccount(vault, 'roadmap.sh', 'github.com', '  ')).toBe(false)
  })
})
