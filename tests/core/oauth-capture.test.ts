import { describe, expect, it } from 'vitest'
import {
  approveCapture,
  cleanCaptureDomain,
  reviewableCaptures
} from '~/core/utils/oauth-capture'

const cap = (over: object = {}) =>
  ({
    id: 'c1',
    provider: 'google.com',
    identity: 'me@gmail.com',
    suggested_domain: 'figma.com',
    timestamp: 1,
    ...over
  }) as any

describe('reviewableCaptures', () => {
  it('drops unknown identities, non-emails and non-origin domains', () => {
    const list = [
      cap({ id: 'ok' }),
      cap({ id: 'unknown', identity: 'Unknown Account' }),
      cap({ id: 'noat', identity: 'someone' }),
      cap({ id: 'self', suggested_domain: 'google.com' })
    ]
    expect(reviewableCaptures(list).map((c) => c.id)).toEqual(['ok'])
  })

  it('tolerates a missing list', () => {
    expect(reviewableCaptures(undefined)).toEqual([])
  })
})

describe('cleanCaptureDomain', () => {
  it('strips scheme, www and path', () => {
    expect(cleanCaptureDomain(' HTTPS://www.Figma.com/files ')).toBe('figma.com')
  })
})

describe('approveCapture', () => {
  it('adds a new domain entry and removes the capture from the queue', () => {
    const out = approveCapture([], [], [cap(), cap({ id: 'c2' })], cap(), 'figma.com', 5, 'id1')
    expect(out.changed).toBe(true)
    expect(out.savedAccounts).toHaveLength(1)
    expect(out.savedAccounts[0].accounts[0]).toMatchObject({
      id: 'id1',
      label: 'Google OAuth',
      identities: ['me@gmail.com'],
      login_method: { type: 'oauth', provider: 'google.com' },
      updated_at: 5
    })
    expect(out.pending.map((p) => p.id)).toEqual(['c2'])
  })

  it('appends to an existing domain without mutating the input', () => {
    const existing = [{ domain: 'figma.com', accounts: [{ id: 'old', identities: ['x@y.z'], login_method: { type: 'password' } } as any] }]
    const out = approveCapture(existing, [], [cap()], cap(), 'figma.com', 5, 'id1')
    expect(out.savedAccounts[0].accounts.map((a) => a.id)).toEqual(['old', 'id1'])
    expect(existing[0].accounts).toHaveLength(1)
  })

  it('does not add the same OAuth login twice but still clears the queue', () => {
    const existing = [
      {
        domain: 'figma.com',
        accounts: [
          {
            id: 'old',
            identities: ['me@gmail.com'],
            login_method: { type: 'oauth', provider: 'google.com' }
          } as any
        ]
      }
    ]
    const out = approveCapture(existing, [], [cap()], cap(), 'figma.com', 5, 'id1')
    expect(out.savedAccounts[0].accounts).toHaveLength(1)
    expect(out.pending).toEqual([])
  })

  it('links the domain in the registry only when the identity is known there', () => {
    const registry = [
      { provider: 'google.com', identity: 'me@gmail.com', linked_websites: [] },
      { provider: 'google.com', identity: 'other@gmail.com', linked_websites: [] }
    ]
    const out = approveCapture([], registry, [cap()], cap(), 'figma.com', 5, 'id1')
    expect(out.oauthRegistry[0].linked_websites).toEqual(['figma.com'])
    expect(out.oauthRegistry[1].linked_websites).toEqual([])
    expect(registry[0].linked_websites).toEqual([])
  })

  it('applies the chosen purpose', () => {
    const out = approveCapture([], [], [cap()], cap(), 'figma.com', 5, 'id1', 'integration')
    expect(out.savedAccounts[0].accounts[0].label).toBe('Google Data Link')
    expect(out.savedAccounts[0].accounts[0].oauth_purpose).toBe('integration')
  })

  it('changes nothing and keeps the capture queued for a non-origin domain', () => {
    const queue = [cap()]
    const out = approveCapture([], [], queue, cap(), 'google.com', 5, 'id1')
    expect(out.changed).toBe(false)
    expect(out.savedAccounts).toEqual([])
    expect(out.pending).toEqual(queue)
  })
})

describe('password captures', () => {
  const pw = (over: object = {}) =>
    cap({ method: 'password', provider: '', identity: 'krishna', suggested_domain: 'accounts.google.com', ...over })

  it('is reviewable without an @ and on a provider domain', () => {
    expect(reviewableCaptures([pw()]).map((c) => c.id)).toEqual(['c1'])
  })

  it('saves a password profile and leaves the registry alone', () => {
    const registry = [{ provider: 'google.com', identity: 'krishna', linked_websites: [] }]
    const out = approveCapture([], registry, [pw()], pw(), 'accounts.google.com', 5, 'id1')
    expect(out.changed).toBe(true)
    expect(out.savedAccounts[0].accounts[0]).toMatchObject({
      label: 'Password login',
      identities: ['krishna'],
      login_method: { type: 'password' }
    })
    expect(out.oauthRegistry).toBe(registry)
    expect(out.pending).toEqual([])
  })

  it('labels a sign-up and does not duplicate a known username', () => {
    const existing = [{ domain: 'a.com', accounts: [{ id: 'o', identities: ['Krishna'], login_method: { type: 'password' } } as any] }]
    const out = approveCapture(existing, [], [pw()], pw({ signup: true }), 'a.com', 5, 'id1')
    expect(out.savedAccounts[0].accounts).toHaveLength(1)
    const fresh = approveCapture([], [], [pw()], pw({ signup: true }), 'a.com', 5, 'id1')
    expect(fresh.savedAccounts[0].accounts[0].label).toBe('Password sign-up')
  })
})
