import type { DomainEntry } from '../storage/schema'
import { matchesDomain, normalizeOAuthProvider } from './domain'

/**
 * True when the vault already holds this exact OAuth login for this site.
 *
 * The background queues a PendingOAuthCapture every time it watches an OAuth
 * flow complete. It already refuses to queue a second copy of something sitting
 * in the pending queue, and refuses to add a second copy to `oauth_registry`,
 * but it never looked at `saved_accounts` — so signing back into a site whose
 * "Sign in with GitHub" the user approved and saved months ago put the same
 * capture in front of them again on every login.
 *
 * A match needs all three to line up:
 *   - the domain, by `matchesDomain` (so `dash.example.com` finds an entry
 *     saved as `example.com`) or by an explicit `linked_domains` mirror
 *   - the provider, normalised on both sides, since the registry stores
 *     `google.com` where a callback URL may have said `accounts.google.com`
 *   - the identity, case-folded, since an email is case-insensitive in practice
 *     and providers are inconsistent about which case they hand back
 */
export function hasSavedOAuthAccount(
  savedAccounts: DomainEntry[] | null | undefined,
  originSite: string,
  providerSite: string,
  identity: string
): boolean {
  if (!Array.isArray(savedAccounts)) return false
  if (!originSite || !providerSite || !identity) return false

  const wantProvider = normalizeOAuthProvider(providerSite)
  const wantIdentity = identity.trim().toLowerCase()
  if (!wantIdentity) return false

  return savedAccounts.some((entry) => {
    if (!entry?.domain || !Array.isArray(entry.accounts)) return false

    const domainMatches =
      matchesDomain(entry.domain, originSite, true) ||
      matchesDomain(originSite, entry.domain, true)

    return entry.accounts.some((acc) => {
      if (acc?.login_method?.type !== 'oauth') return false
      if (normalizeOAuthProvider(acc.login_method.provider || '') !== wantProvider)
        return false
      if (
        !acc.identities?.some((id) => id?.trim().toLowerCase() === wantIdentity)
      )
        return false

      // The domain test runs last so a linked mirror can stand in for it: an
      // account saved under `icloud.com` and linked to `apple.com` covers a
      // login recorded on either.
      if (domainMatches) return true
      return (acc.linked_domains || []).some((d) =>
        matchesDomain(d, originSite, true)
      )
    })
  })
}
