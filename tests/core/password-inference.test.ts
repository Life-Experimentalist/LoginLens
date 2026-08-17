import { describe, expect, it } from 'vitest'

import {
  analyzePasswordHashes,
  annotateWithReuseFlags,
  calculateSecurityRisks,
  classifyReuseGroups,
  isParentChildSubdomain
} from '~/core/utils/password-inference'
import type { DomainEntry, IdentityProfile } from '~/core/storage/schema'

// Reuse analysis decides what the security review shows, so the interesting
// cases are the ones where a shared fingerprint is *not* reuse: the same
// account reached through a mirror domain, or two profiles on one site the user
// has already told us are the same person.

const SHARED = 'fp-shared'
const OTHER = 'fp-other'
const WEAK = 'fp-weak'

function account(
  id: string,
  hash: string | undefined,
  extra: Partial<IdentityProfile> = {}
): IdentityProfile {
  return {
    id,
    label: 'Account',
    identities: [`${id}@example.com`],
    login_method: { type: 'password' },
    password_hash: hash,
    updated_at: 1,
    ...extra
  }
}

function vault(...entries: Array<[string, IdentityProfile[]]>): DomainEntry[] {
  return entries.map(([domain, accounts]) => ({ domain, accounts }))
}

describe('isParentChildSubdomain', () => {
  it('is true only for a direct parent/child pair', () => {
    expect(isParentChildSubdomain('m.example.com', 'example.com')).toBe(true)
    expect(isParentChildSubdomain('example.com', 'm.example.com')).toBe(true)
  })

  it('is false for siblings and for the same domain', () => {
    expect(isParentChildSubdomain('foo.example.com', 'bar.example.com')).toBe(false)
    expect(isParentChildSubdomain('example.com', 'example.com')).toBe(false)
    expect(isParentChildSubdomain('notexample.com', 'example.com')).toBe(false)
  })
})

describe('analyzePasswordHashes', () => {
  it('flags a password shared across unrelated domains', () => {
    const result = analyzePasswordHashes(
      vault(['a.com', [account('a1', SHARED)]], ['b.com', [account('b1', SHARED)]])
    )

    expect(result.reuseGroups).toHaveLength(1)
    expect(result.reuseGroups[0].hash).toBe(SHARED)
    expect(result.totalReusedAccounts).toBe(2)
    expect(result.uniqueHashCount).toBe(1)
    expect(result.totalHashedAccounts).toBe(2)
    expect(result.reusePercent).toBe(100)
  })

  it('does not flag a password used on exactly one account', () => {
    const result = analyzePasswordHashes(
      vault(['a.com', [account('a1', SHARED)]], ['b.com', [account('b1', OTHER)]])
    )

    expect(result.reuseGroups).toHaveLength(0)
    expect(result.totalReusedAccounts).toBe(0)
    expect(result.uniqueHashCount).toBe(2)
    expect(result.reusePercent).toBe(0)
  })

  it('ignores accounts with no recorded password', () => {
    const result = analyzePasswordHashes(
      vault(['a.com', [account('a1', undefined), account('a2', '')]])
    )

    expect(result.totalHashedAccounts).toBe(0)
    expect(result.reusePercent).toBe(0)
  })

  it('treats hashes case-insensitively', () => {
    const result = analyzePasswordHashes(
      vault(['a.com', [account('a1', 'ABCDEF')]], ['b.com', [account('b1', 'abcdef')]])
    )

    expect(result.uniqueHashCount).toBe(1)
    expect(result.reuseGroups).toHaveLength(1)
  })

  it('does not flag one account reached through a linked mirror domain', () => {
    // 9anime.to and 9anime.id are the same site. One password, one account.
    const result = analyzePasswordHashes(
      vault(
        ['9anime.to', [account('m1', SHARED, { linked_domains: ['9anime.id'] })]],
        ['9anime.id', [account('m2', SHARED, { linked_domains: ['9anime.to'] })]]
      )
    )

    expect(result.reuseGroups).toHaveLength(0)
  })

  it('does not flag a parent and child subdomain', () => {
    const result = analyzePasswordHashes(
      vault(['example.com', [account('p', SHARED)]], ['m.example.com', [account('c', SHARED)]])
    )

    expect(result.reuseGroups).toHaveLength(0)
  })

  it('does not flag two profiles on one site marked as aliases', () => {
    const result = analyzePasswordHashes(
      vault([
        'example.com',
        [
          account('x', SHARED, { intra_domain_aliases: ['y'] }),
          account('y', SHARED, { intra_domain_aliases: ['x'] })
        ]
      ])
    )

    expect(result.reuseGroups).toHaveLength(0)
  })

  it('keeps flagging domains the user dismissed as not mirrors', () => {
    // "These really are two different accounts" means the reuse is real.
    const result = analyzePasswordHashes(
      vault(
        ['a.com', [account('a1', SHARED, { dismissed_mirrors: ['b.com'] })]],
        ['b.com', [account('b1', SHARED)]]
      )
    )

    expect(result.reuseGroups).toHaveLength(1)
  })

  it('flags a weak password even on a single account', () => {
    const result = analyzePasswordHashes(
      vault(['a.com', [account('a1', WEAK)]]),
      new Set([WEAK])
    )

    expect(result.reuseGroups).toHaveLength(1)
    expect(result.totalReusedAccounts).toBe(1)
  })

  it('sorts the smallest blast radius first', () => {
    const result = analyzePasswordHashes(
      vault(
        ['a.com', [account('a1', SHARED)]],
        ['b.com', [account('b1', SHARED)]],
        ['c.com', [account('c1', SHARED)]],
        ['d.com', [account('d1', OTHER)]],
        ['e.com', [account('e1', OTHER)]]
      )
    )

    expect(result.reuseGroups.map((g) => g.hash)).toEqual([OTHER, SHARED])
  })

  it('does not recurse forever on a self-referential alias', () => {
    // An account listing itself as its own alias used to send the union-find
    // `find()` into unbounded recursion and blow the stack.
    expect(() =>
      analyzePasswordHashes(
        vault([
          'a.com',
          [account('x', SHARED, { intra_domain_aliases: ['x'] }), account('y', SHARED)]
        ])
      )
    ).not.toThrow()
  })

  it('handles an empty vault', () => {
    const result = analyzePasswordHashes([])

    expect(result).toMatchObject({
      reuseGroups: [],
      totalReusedAccounts: 0,
      uniqueHashCount: 0,
      totalHashedAccounts: 0,
      reusePercent: 0
    })
  })
})

describe('annotateWithReuseFlags', () => {
  it('stamps the reuse count and flag onto affected accounts only', () => {
    const input = vault(
      ['a.com', [account('a1', SHARED)]],
      ['b.com', [account('b1', SHARED)]],
      ['c.com', [account('c1', OTHER)]]
    )

    const out = annotateWithReuseFlags(input)

    expect(out[0].accounts[0]).toMatchObject({ password_reuse_count: 2, reuse_flag: true })
    expect(out[1].accounts[0]).toMatchObject({ password_reuse_count: 2, reuse_flag: true })
    expect(out[2].accounts[0].reuse_flag).toBeUndefined()
  })

  it('flags a lone account on a weak password', () => {
    const out = annotateWithReuseFlags(
      vault(['a.com', [account('a1', WEAK)]]),
      new Set([WEAK])
    )

    expect(out[0].accounts[0].reuse_flag).toBe(true)
    expect(out[0].accounts[0].password_reuse_count).toBe(1)
  })

  it('does not mutate the input', () => {
    const input = vault(['a.com', [account('a1', SHARED)]], ['b.com', [account('b1', SHARED)]])
    const before = structuredClone(input)

    annotateWithReuseFlags(input)

    expect(input).toEqual(before)
  })
})

describe('classifyReuseGroups', () => {
  it('leaves an unreviewed shared password active', () => {
    const { reuseGroups } = analyzePasswordHashes(
      vault(['a.com', [account('a1', SHARED)]], ['b.com', [account('b1', SHARED)]])
    )

    const { activeGroups, resolvedGroups } = classifyReuseGroups(reuseGroups)

    expect(activeGroups).toHaveLength(1)
    expect(activeGroups[0].accounts).toHaveLength(2)
    expect(resolvedGroups).toHaveLength(0)
  })

  it('resolves a group once every pair has been dismissed', () => {
    const { reuseGroups } = analyzePasswordHashes(
      vault(
        ['a.com', [account('a1', SHARED, { dismissed_mirrors: ['b.com'] })]],
        ['b.com', [account('b1', SHARED, { dismissed_mirrors: ['a.com'] })]]
      )
    )

    const { activeGroups, resolvedGroups } = classifyReuseGroups(reuseGroups)

    expect(activeGroups).toHaveLength(0)
    expect(resolvedGroups.length).toBeGreaterThan(0)
  })

  it('can auto-resolve a single leftover account', () => {
    const { reuseGroups } = analyzePasswordHashes(
      vault(
        ['a.com', [account('a1', SHARED, { linked_domains: ['b.com'] })]],
        ['b.com', [account('b1', SHARED, { linked_domains: ['a.com'] })]],
        ['c.com', [account('c1', SHARED)]]
      )
    )

    expect(classifyReuseGroups(reuseGroups, false).activeGroups).toHaveLength(1)
    expect(classifyReuseGroups(reuseGroups, true).activeGroups).toHaveLength(0)
  })
})

describe('calculateSecurityRisks', () => {
  it('counts a freshly detected shared password as a risk', () => {
    // Counting only *dismissed* groups meant a password shared across two
    // unrelated sites reported zero risk — inverting the metric the security
    // score is built on.
    const result = analyzePasswordHashes(
      vault(['a.com', [account('a1', SHARED)]], ['b.com', [account('b1', SHARED)]])
    )

    expect(calculateSecurityRisks(result)).toBe(2)
  })

  it('counts a confirmed-different pair as a risk', () => {
    const result = analyzePasswordHashes(
      vault(
        ['a.com', [account('a1', SHARED, { dismissed_mirrors: ['b.com'] })]],
        ['b.com', [account('b1', SHARED, { dismissed_mirrors: ['a.com'] })]]
      )
    )

    expect(calculateSecurityRisks(result)).toBeGreaterThan(0)
  })

  it('counts nothing when there is no reuse', () => {
    const result = analyzePasswordHashes(
      vault(['a.com', [account('a1', SHARED)]], ['b.com', [account('b1', OTHER)]])
    )

    expect(calculateSecurityRisks(result)).toBe(0)
  })

  it('counts nothing for accounts linked as the same identity', () => {
    const result = analyzePasswordHashes(
      vault(
        ['9anime.to', [account('m1', SHARED, { linked_domains: ['9anime.id'] })]],
        ['9anime.id', [account('m2', SHARED, { linked_domains: ['9anime.to'] })]]
      )
    )

    expect(calculateSecurityRisks(result)).toBe(0)
  })
})
