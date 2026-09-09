import type { DomainEntry } from '../storage/schema'
import { matchesDomain } from './domain'

/** domain key from the vault -> epoch ms it was last seen in a tab */
export type RecentDomains = Record<string, number>

export const RECENT_DOMAINS_KEY = 'domain_last_accessed'

/** Beyond this the list stops being "recent" and starts being a browsing log. */
export const RECENT_DOMAINS_CAP = 20

/** A tab can fire a dozen navigations for one page load. */
const WRITE_THROTTLE_MS = 60_000

export type RecentOrder = 'recent' | 'alphabetical' | 'accounts'

/**
 * Records a visit, but only against a domain the vault already knows.
 *
 * That restriction is the whole point. LoginLens keeps everything on the
 * device and sends no telemetry, and a general list of visited hostnames
 * would be new information about the user's browsing that the vault did not
 * previously hold. Keying on entries that already exist means this file says
 * nothing except "which of your own saved logins did you touch last".
 *
 * Returns null when there is nothing to write, so the caller can skip storage.
 */
export function recordDomainVisit(
  savedAccounts: DomainEntry[] | null | undefined,
  current: RecentDomains | null | undefined,
  visitedDomain: string,
  now: number
): RecentDomains | null {
  if (!visitedDomain) return null
  const entries = Array.isArray(savedAccounts) ? savedAccounts : []

  const match = entries.find(
    (item) =>
      item?.domain &&
      (matchesDomain(item.domain, visitedDomain, true) ||
        matchesDomain(visitedDomain, item.domain, true))
  )
  if (!match?.domain) return null

  const store = current && typeof current === 'object' ? current : {}
  const previous = store[match.domain]
  if (typeof previous === 'number' && now - previous < WRITE_THROTTLE_MS) {
    return null
  }

  const next: RecentDomains = { ...store, [match.domain]: now }

  const keys = Object.keys(next)
  if (keys.length > RECENT_DOMAINS_CAP) {
    keys
      .sort((a, b) => (next[b] ?? 0) - (next[a] ?? 0))
      .slice(RECENT_DOMAINS_CAP)
      .forEach((key) => delete next[key])
  }

  return next
}

/**
 * Picks the entries to show in the popup's recent section, in the order the
 * user asked for. `exclude` holds whatever is already on screen for the
 * current site, so nothing appears twice.
 */
export function selectRecentDomains(
  savedAccounts: DomainEntry[] | null | undefined,
  recents: RecentDomains | null | undefined,
  order: RecentOrder,
  limit: number,
  exclude: string[] = []
): DomainEntry[] {
  const entries = Array.isArray(savedAccounts) ? savedAccounts : []
  const store = recents && typeof recents === 'object' ? recents : {}
  const skip = new Set(exclude)

  // Alphabetical and by-account-count are orderings of the vault itself, so
  // they do not need a visit on record. "Recently accessed" does.
  const pool =
    order === 'recent'
      ? entries.filter((item) => item?.domain && typeof store[item.domain] === 'number')
      : entries.filter((item) => item?.domain)

  const visible = pool.filter((item) => !skip.has(item.domain))

  const sorted = [...visible]
  if (order === 'alphabetical') {
    sorted.sort((a, b) => a.domain.localeCompare(b.domain))
  } else if (order === 'accounts') {
    sorted.sort(
      (a, b) =>
        (b.accounts?.length ?? 0) - (a.accounts?.length ?? 0) ||
        a.domain.localeCompare(b.domain)
    )
  } else {
    sorted.sort((a, b) => (store[b.domain] ?? 0) - (store[a.domain] ?? 0))
  }

  return sorted.slice(0, Math.max(0, limit))
}
