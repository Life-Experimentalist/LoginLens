import type {
  DomainEntry,
  IdentityProfile,
  PendingOAuthCapture
} from '../storage/schema'
import { isNonOriginDomain } from './domain'

/**
 * Pending-capture rules shared by the popup and the vault, so the two cannot
 * disagree. The popup used to count every queued item while the vault hid the
 * ones it could not act on, so "3 pending" could lead to an empty section.
 */

export const isReviewableCapture = (c: PendingOAuthCapture): boolean =>
  Boolean(
    c.identity &&
      c.identity !== 'Unknown Account' &&
      c.identity.includes('@') &&
      !isNonOriginDomain(c.suggested_domain)
  )

export const reviewableCaptures = (
  list: PendingOAuthCapture[] | null | undefined
): PendingOAuthCapture[] => (list ?? []).filter(isReviewableCapture)

export const cleanCaptureDomain = (raw: string): string =>
  raw
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]

const providerName = (provider: string): string => {
  const first = provider.split('.')[0]
  return first.charAt(0).toUpperCase() + first.slice(1)
}

export interface ApproveResult {
  savedAccounts: DomainEntry[]
  oauthRegistry: any[]
  pending: PendingOAuthCapture[]
  /** False when the domain was rejected and nothing was applied. */
  changed: boolean
}

/**
 * Applies one confirmed capture. Pure: nothing passed in is mutated, and a
 * domain that is not a real origin changes nothing and leaves the capture
 * queued. The registry is only updated when it already knows the identity.
 */
export function approveCapture(
  savedAccounts: DomainEntry[] | null | undefined,
  oauthRegistry: any[] | null | undefined,
  pending: PendingOAuthCapture[] | null | undefined,
  capture: PendingOAuthCapture,
  rawDomain: string,
  now: number,
  newId: string,
  overridePurpose?: 'login' | 'integration'
): ApproveResult {
  const saved = savedAccounts ?? []
  const registry = oauthRegistry ?? []
  const queue = pending ?? []
  const domain = cleanCaptureDomain(rawDomain)
  if (!domain || isNonOriginDomain(domain)) {
    return {
      savedAccounts: saved,
      oauthRegistry: registry,
      pending: queue,
      changed: false
    }
  }

  const purpose = overridePurpose || capture.oauth_purpose || 'login'
  const name = providerName(capture.provider)
  const profile: IdentityProfile = {
    id: newId,
    label: purpose === 'integration' ? `${name} Data Link` : `${name} OAuth`,
    identities: [capture.identity],
    login_method: { type: 'oauth', provider: capture.provider },
    oauth_purpose: purpose,
    integration_scope: capture.integration_scope,
    updated_at: now,
    notes:
      purpose === 'integration'
        ? `Connected data source for ${capture.integration_scope || 'Autofill / Scope access'}`
        : 'Recorded during OAuth login'
  }

  const existing = saved.find((d) => d.domain === domain)
  let nextSaved: DomainEntry[]
  if (existing) {
    const already = existing.accounts.some(
      (a) =>
        a.login_method.type === 'oauth' &&
        a.login_method.provider === capture.provider &&
        a.identities[0] === capture.identity
    )
    nextSaved = already
      ? saved
      : saved.map((d) =>
          d === existing ? { ...d, accounts: [...d.accounts, profile] } : d
        )
  } else {
    nextSaved = [...saved, { domain, accounts: [profile] }]
  }

  const nextRegistry = registry.map((r) =>
    r.provider === capture.provider &&
    r.identity === capture.identity &&
    !(r.linked_websites || []).includes(domain)
      ? { ...r, linked_websites: [...(r.linked_websites || []), domain] }
      : r
  )

  return {
    savedAccounts: nextSaved,
    oauthRegistry: nextRegistry,
    pending: queue.filter((p) => p.id !== capture.id),
    changed: true
  }
}
