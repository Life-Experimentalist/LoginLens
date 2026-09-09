import { describe, expect, it } from 'vitest'
import {
  RECENT_DOMAINS_CAP,
  recordDomainVisit,
  selectRecentDomains,
  type RecentDomains
} from '~/core/utils/recent-domains'

const NOW = 1_700_000_000_000
const MINUTE = 60_000

const entry = (domain: string, accounts = 1) =>
  ({
    domain,
    accounts: Array.from({ length: accounts }, (_, i) => ({
      identities: [`user${i}@example.com`]
    }))
  }) as any

const saved = [entry('github.com'), entry('example.com', 3), entry('acme.dev', 2)]

describe('recordDomainVisit', () => {
  it('records a visit to a domain the vault knows', () => {
    expect(recordDomainVisit(saved, {}, 'github.com', NOW)).toEqual({
      'github.com': NOW
    })
  })

  it('ignores a domain that is not in the vault', () => {
    expect(recordDomainVisit(saved, {}, 'unrelated.test', NOW)).toBeNull()
  })

  it('keys a subdomain visit on the saved parent, not the hostname visited', () => {
    const next = recordDomainVisit(saved, {}, 'app.example.com', NOW)
    expect(Object.keys(next!)).toEqual(['example.com'])
  })

  it('throttles repeat writes within a minute', () => {
    const store: RecentDomains = { 'github.com': NOW }
    expect(recordDomainVisit(saved, store, 'github.com', NOW + 5_000)).toBeNull()
    expect(
      recordDomainVisit(saved, store, 'github.com', NOW + 2 * MINUTE)
    ).toEqual({ 'github.com': NOW + 2 * MINUTE })
  })

  it('does not mutate the store it was given', () => {
    const store: RecentDomains = { 'github.com': NOW }
    recordDomainVisit(saved, store, 'example.com', NOW + MINUTE)
    expect(store).toEqual({ 'github.com': NOW })
  })

  it('caps the list, dropping the oldest', () => {
    const many = Array.from({ length: RECENT_DOMAINS_CAP + 5 }, (_, i) =>
      entry(`site${i}.com`)
    )
    const store: RecentDomains = {}
    many.forEach((item, i) => {
      Object.assign(store, recordDomainVisit(many, store, item.domain, NOW + i))
    })
    const next = recordDomainVisit(many, store, 'site0.com', NOW + 10 * MINUTE)!
    expect(Object.keys(next)).toHaveLength(RECENT_DOMAINS_CAP)
    expect(next['site0.com']).toBe(NOW + 10 * MINUTE)
  })

  it('tolerates a missing vault and a null store', () => {
    expect(recordDomainVisit(null, null, 'github.com', NOW)).toBeNull()
    expect(recordDomainVisit(saved, null, 'github.com', NOW)).toEqual({
      'github.com': NOW
    })
  })

  it('ignores an empty domain', () => {
    expect(recordDomainVisit(saved, {}, '', NOW)).toBeNull()
  })
})

describe('selectRecentDomains', () => {
  const recents: RecentDomains = {
    'github.com': NOW,
    'acme.dev': NOW - MINUTE,
    'example.com': NOW - 10 * MINUTE
  }

  it('orders by most recently seen', () => {
    expect(
      selectRecentDomains(saved, recents, 'recent', 10).map((d) => d.domain)
    ).toEqual(['github.com', 'acme.dev', 'example.com'])
  })

  it('orders alphabetically', () => {
    expect(
      selectRecentDomains(saved, recents, 'alphabetical', 10).map((d) => d.domain)
    ).toEqual(['acme.dev', 'example.com', 'github.com'])
  })

  it('orders by account count, breaking ties by name', () => {
    expect(
      selectRecentDomains(saved, recents, 'accounts', 10).map((d) => d.domain)
    ).toEqual(['example.com', 'acme.dev', 'github.com'])
  })

  it('leaves out what is already on screen', () => {
    expect(
      selectRecentDomains(saved, recents, 'recent', 10, ['github.com']).map(
        (d) => d.domain
      )
    ).toEqual(['acme.dev', 'example.com'])
  })

  it('honours the limit', () => {
    expect(selectRecentDomains(saved, recents, 'recent', 1)).toHaveLength(1)
    expect(selectRecentDomains(saved, recents, 'recent', 0)).toHaveLength(0)
  })

  it('shows nothing under recent ordering when no visit is on record', () => {
    expect(selectRecentDomains(saved, {}, 'recent', 10)).toHaveLength(0)
  })

  it('still lists the vault under the other orderings with no visits on record', () => {
    expect(selectRecentDomains(saved, {}, 'alphabetical', 10)).toHaveLength(3)
  })
})
