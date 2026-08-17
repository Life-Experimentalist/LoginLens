/**
 * Password Hash Inference Engine
 * --------------------------------
 * Analyzes password_hash fields stored in the vault (a keyed HMAC-SHA256
 * fingerprint of the user's actual password — we NEVER store the password
 * itself, and the key never leaves the device) to detect:
 *
 * 1. Password reuse — same fingerprint appearing across multiple accounts
 * 2. Common/trivial passwords — comparing against fingerprints of a known-bad list
 * 3. Overall vault security posture score from hash data
 *
 * All analysis is done entirely locally. No data ever leaves the device.
 */

import type { DomainEntry } from '../storage/schema'

export interface ReuseGroupAccount {
  domain: string
  identity: string
  accountId: string
  linked_domains: string[]
  dismissed_mirrors: string[]
  intra_domain_aliases: string[]
  dismissed_aliases: string[]
  login_method_type?: string
  vault_source?: string
  label?: string
}

export interface ReuseGroup {
  hash: string
  accounts: ReuseGroupAccount[]
}

export interface HashInferenceResult {
  reuseGroups: ReuseGroup[]
  totalReusedAccounts: number
  uniqueHashCount: number
  totalHashedAccounts: number
  reusePercent: number
}

/**
 * Check if two domains share a direct parent/child subdomain relationship.
 * e.g., m.example.com and example.com -> true
 * e.g., foo.example.com and bar.example.com -> false (siblings)
 */
export function isParentChildSubdomain(d1: string, d2: string): boolean {
  if (d1 === d2) return false
  return d1.endsWith('.' + d2) || d2.endsWith('.' + d1)
}

/**
 * Scan all accounts with a password_hash and find groups that share a hash.
 * Also flags weak passwords.
 *
 * `weakFingerprints` is supplied by the caller (see
 * `password-fingerprint.getWeakFingerprints`) rather than hardcoded here.
 * The previous implementation embedded a table of literal SHA-256 digests, and
 * three of its ten entries were simply wrong — `password1`, `letmein` and
 * `dragon` could never match, while the value labelled `dragon` was actually
 * the digest of "test". Deriving them at runtime removes that whole class of
 * silent failure, and is required anyway now that fingerprints are keyed.
 */
export function analyzePasswordHashes(
  accounts: DomainEntry[],
  weakFingerprints: ReadonlySet<string> = new Set()
): HashInferenceResult {
  // Map: hash -> list of accounts that use it
  const hashMap = new Map<string, ReuseGroup['accounts']>()

  for (const entry of accounts) {
    for (const acc of entry.accounts) {
      if (!acc.password_hash) continue
      const hash = acc.password_hash.toLowerCase()
      const existing = hashMap.get(hash) ?? []
      existing.push({
        domain: entry.domain,
        identity: acc.identities[0] ?? '(unknown)',
        accountId: acc.id,
        linked_domains: acc.linked_domains || [],
        dismissed_mirrors: acc.dismissed_mirrors || [],
        intra_domain_aliases: acc.intra_domain_aliases || [],
        dismissed_aliases: acc.dismissed_aliases || [],
        login_method_type: acc.login_method?.type,
        vault_source: acc.vault_source,
        label: acc.label
      })
      hashMap.set(hash, existing)
    }
  }

  const reuseGroups: ReuseGroup[] = []
  let totalReusedAccounts = 0

  for (const [hash, accs] of hashMap.entries()) {
    const isWeak = weakFingerprints.has(hash)

    // Group linked accounts to find distinct usages
    // Simple disjoint set / connected components
    const parent = new Map<string, string>()
    const find = (i: string): string => {
      const p = parent.get(i)
      // An id we have never seen is its own root. Falling through to
      // `find(parent.get(i) || i)` here used to recurse on `i` forever and
      // blow the stack.
      if (p === undefined || p === i) return i
      const root = find(p)
      parent.set(i, root)
      return root
    }
    const union = (i: string, j: string) => {
      const rootI = find(i)
      const rootJ = find(j)
      if (rootI !== rootJ) parent.set(rootI, rootJ)
    }

    accs.forEach((a) => parent.set(a.accountId, a.accountId))

    // Link them up based on explicit links or parent-child auto-linking
    for (const a of accs) {
      for (const b of accs) {
        if (a === b) continue

        // Check if explicitly dismissed as mirrors or aliases
        const isDismissedMirror =
          a.dismissed_mirrors.includes(b.domain) ||
          b.dismissed_mirrors.includes(a.domain)
        const isDismissedAlias =
          a.dismissed_aliases?.includes(b.accountId) ||
          b.dismissed_aliases?.includes(a.accountId)
        if (isDismissedMirror || isDismissedAlias) continue

        // Check explicit linked_domains, parent/child subdomain, or intra-domain aliases
        const isExplicitlyLinked =
          a.linked_domains.includes(b.domain) ||
          b.linked_domains.includes(a.domain)
        const isAutoParentChild = isParentChildSubdomain(a.domain, b.domain)
        const isAliasLinked =
          a.intra_domain_aliases.includes(b.accountId) ||
          b.intra_domain_aliases.includes(a.accountId)

        if (isExplicitlyLinked || isAutoParentChild || isAliasLinked) {
          union(a.accountId, b.accountId)
        }
      }
    }

    const distinctClusters = new Set()
    accs.forEach((a) => distinctClusters.add(find(a.accountId)))
    const distinctCount = distinctClusters.size

    // Flag if: distinct usages >= 2 OR known weak hash
    if (distinctCount >= 2 || isWeak) {
      reuseGroups.push({ hash, accounts: accs })
      totalReusedAccounts += accs.length
    }
  }

  // Sort: smallest groups (least unique domains) first!
  reuseGroups.sort((a, b) => {
    const uniqueA = new Set(a.accounts.map((x) => x.domain)).size
    const uniqueB = new Set(b.accounts.map((x) => x.domain)).size
    if (uniqueA !== uniqueB) return uniqueA - uniqueB
    return a.accounts.length - b.accounts.length
  })

  const totalHashedAccounts = [...hashMap.values()].reduce(
    (n, a) => n + a.length,
    0
  )

  return {
    reuseGroups,
    totalReusedAccounts,
    uniqueHashCount: hashMap.size,
    totalHashedAccounts,
    reusePercent:
      totalHashedAccounts > 0
        ? Math.round((totalReusedAccounts / totalHashedAccounts) * 100)
        : 0
  }
}

/**
 * Annotate accounts in-place with reuse_flag and password_reuse_count.
 * Returns a new copy of the DomainEntry array (does not mutate the input).
 */
export function annotateWithReuseFlags(
  accounts: DomainEntry[],
  weakFingerprints: ReadonlySet<string> = new Set()
): DomainEntry[] {
  const result = analyzePasswordHashes(accounts, weakFingerprints)

  // Build a quick lookup: accountId -> { count, flag }
  const reuseMap = new Map<string, { count: number; flag: boolean }>()
  for (const group of result.reuseGroups) {
    // A group reaches this list either because the password is shared or
    // because it is a known-weak password. A single account on a weak password
    // still needs flagging, so the flag is not purely a count test.
    const isWeak = weakFingerprints.has(group.hash)
    for (const acc of group.accounts) {
      reuseMap.set(acc.accountId, {
        count: group.accounts.length,
        flag: group.accounts.length >= 2 || isWeak
      })
    }
  }

  return accounts.map((entry) => ({
    ...entry,
    accounts: entry.accounts.map((acc) => {
      const reuse = reuseMap.get(acc.id)
      if (!reuse) return acc
      return {
        ...acc,
        password_reuse_count: reuse.count,
        reuse_flag: reuse.flag
      }
    })
  }))
}

/**
 * Computes the total number of accounts that are currently at risk due to
 * unhandled password reuse across DIFFERENT domains or identities, or weak hashes.
 * If an account is explicitly linked as a mirror or same-site alias, it is safe.
 * If it remains unlinked or is explicitly dismissed as 'Different', it is a persistent risk.
 */
export function calculateSecurityRisks(
  result: HashInferenceResult,
  autoResolveLeftovers = false
): number {
  // A shared password is a risk unless the user has told us the accounts are
  // actually the same identity (linked as a mirror domain or an intra-domain
  // alias). Two states count as at-risk:
  //
  //   - unreviewed  — the user has not looked at this group yet
  //   - dismissed   — the user confirmed these ARE different accounts, which
  //                   means the reuse is real
  //
  // The previous implementation counted ONLY the dismissed case, so a freshly
  // detected password shared across two unrelated sites reported zero risk —
  // exactly inverting the metric the security score is built on.
  // Passed through rather than defaulted silently: the views classify with the
  // user's `autoResolveLeftovers` setting, and a count computed without it
  // would disagree with the list of groups sitting on screen next to it.
  const { activeGroups, resolvedGroups } = classifyReuseGroups(
    result.reuseGroups,
    autoResolveLeftovers
  )

  let atRiskCount = 0

  for (const group of activeGroups) {
    atRiskCount += group.accounts.length
  }

  for (const group of resolvedGroups) {
    const confirmedDifferent = group.accounts.some(
      (a) =>
        (a.dismissed_mirrors && a.dismissed_mirrors.length > 0) ||
        (a.dismissed_aliases && a.dismissed_aliases.length > 0)
    )
    if (confirmedDifferent) atRiskCount += group.accounts.length
  }

  return atRiskCount
}

export function classifyReuseGroups(reuseGroups: ReuseGroup[], autoResolveLeftovers = false) {
  const active: ReuseGroup[] = []
  const resolved: ReuseGroup[] = []

  for (const group of reuseGroups) {
    const parent = new Map<string, string>()
    group.accounts.forEach(a => parent.set(a.accountId, a.accountId))
    const find = (i: string) => {
      let root = i
      while (root !== parent.get(root)) root = parent.get(root)!
      let curr = i
      while (curr !== root) {
        const nxt = parent.get(curr)!
        parent.set(curr, root)
        curr = nxt
      }
      return root
    }
    const union = (i: string, j: string) => parent.set(find(i), find(j))

    for (const a of group.accounts) {
      for (const b of group.accounts) {
        if (a.accountId === b.accountId) continue
        const isLinkedCross = a.linked_domains?.includes(b.domain) || b.linked_domains?.includes(a.domain)
        const isLinkedIntra = a.intra_domain_aliases?.includes(b.accountId) || b.intra_domain_aliases?.includes(a.accountId)
        if (isLinkedCross || isLinkedIntra) {
          union(a.accountId, b.accountId)
        }
      }
    }

    const components = new Map<string, ReuseGroupAccount[]>()
    for (const a of group.accounts) {
      const root = find(a.accountId)
      if (!components.has(root)) components.set(root, [])
      components.get(root)!.push(a)
    }

    const activeForGroup: ReuseGroupAccount[] = []

    for (const comp of components.values()) {
      if (comp.length > 1) {
        resolved.push({ hash: group.hash, accounts: comp })
      } else {
        const a = comp[0]
        
        const processedDomains = new Set([
          ...(a.linked_domains || []),
          ...(a.dismissed_mirrors || []),
          a.domain
        ])
        
        const processedIds = new Set([
          ...(a.intra_domain_aliases || []),
          ...(a.dismissed_aliases || []),
          a.accountId
        ])
        
        const fullyProcessed = group.accounts.every((acc) => {
          if (acc.domain !== a.domain) {
            return processedDomains.has(acc.domain)
          } else {
            return processedIds.has(acc.accountId)
          }
        })

        if (fullyProcessed) {
          resolved.push({ hash: group.hash, accounts: comp })
        } else {
          activeForGroup.push(a)
        }
      }
    }

    if (activeForGroup.length > 0) {
      if (autoResolveLeftovers && activeForGroup.length === 1 && group.accounts.length > 1) {
        resolved.push({ hash: group.hash, accounts: activeForGroup })
      } else {
        active.push({ hash: group.hash, accounts: activeForGroup })
      }
    }
  }

  return { activeGroups: active, resolvedGroups: resolved }
}
