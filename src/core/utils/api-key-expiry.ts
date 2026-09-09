import type { IdentityProfile } from '../storage/schema'

export type ApiKeyExpiryState = 'none' | 'valid' | 'soon' | 'expired'

export interface ApiKeyExpiry {
  state: ApiKeyExpiryState
  /** Whole days until expiry. Negative once past. Undefined when there is none. */
  daysLeft?: number
  /** The stored timestamp, for formatting. Undefined when there is none. */
  at?: number
}

/** Keys inside this window are called out as expiring soon. */
export const API_KEY_EXPIRY_SOON_DAYS = 30

const DAY_MS = 86_400_000

/**
 * Reads an account's expiry into something the UI can render.
 *
 * `api_key_expiry` being absent or null is "no expiry", which covers every key
 * saved before the field existed. A non-number is treated the same way rather
 * than shown as expired: a corrupt value should not make a working key look
 * dead.
 */
export function getApiKeyExpiry(
  acc: Pick<IdentityProfile, 'api_key_expiry'>,
  now: number = Date.now()
): ApiKeyExpiry {
  const at = acc?.api_key_expiry
  if (typeof at !== 'number' || !Number.isFinite(at)) return { state: 'none' }

  const daysLeft = Math.floor((at - now) / DAY_MS)
  if (at <= now) return { state: 'expired', daysLeft, at }
  if (daysLeft <= API_KEY_EXPIRY_SOON_DAYS) return { state: 'soon', daysLeft, at }
  return { state: 'valid', daysLeft, at }
}

/**
 * Turns a stored timestamp into the `yyyy-mm-dd` an `<input type="date">` wants.
 * Built from local date parts, not toISOString, which shifts the day across the
 * UTC boundary for anyone east or west of it.
 */
export function expiryToDateInput(at: number | null | undefined): string {
  if (typeof at !== 'number' || !Number.isFinite(at)) return ''
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Turns the date input's value back into a timestamp. An empty string is the
 * user choosing no expiry, so it returns null rather than throwing.
 *
 * The moment stored is the END of the chosen local day: a key marked "expires
 * 12 March" should still count as valid throughout the 12th.
 */
export function dateInputToExpiry(value: string): number | null {
  if (!value) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999)
  return Number.isNaN(d.getTime()) ? null : d.getTime()
}

export function formatExpiryLabel(e: ApiKeyExpiry): string {
  if (e.state === 'none' || e.at === undefined) return 'No expiry'
  const when = new Date(e.at).toLocaleDateString()
  if (e.state === 'expired') return `Expired ${when}`
  if (e.daysLeft === 0) return `Expires today (${when})`
  return `Expires ${when} (${e.daysLeft}d)`
}
