// ---------------------------------------------------------------------------
// Password fingerprinting for reuse detection.
// ---------------------------------------------------------------------------
// LoginLens never stores a password. To tell "these two accounts share a
// password" we only need a value that is EQUAL for equal passwords — we do not
// need it to be reversible, and we must not let it be reversible.
//
// A bare SHA-256 of a password is not safe for this: the whole keyspace of
// human passwords is small enough that a rainbow table recovers it instantly.
// Anyone who reads the vault file would effectively read the passwords.
//
// Instead we use HMAC-SHA256 under a 256-bit key generated once per install
// and stored locally. Equality is preserved (same password + same key => same
// fingerprint), but without the key a fingerprint is not attackable offline.
//
// The key travels inside encrypted exports/sync payloads only, so reuse
// detection survives a restore on another device without ever exposing the key.
// ---------------------------------------------------------------------------

import { nativeStorage } from '../storage/native'

export const FINGERPRINT_KEY_STORAGE_KEY = 'password_fingerprint_key'

let cachedKey: CryptoKey | null = null
let cachedRawKey: string | null = null

// The in-flight key lookup, not just its result.
//
// Caching only the resolved value is not enough, because the first thing that
// touches this module is `getWeakFingerprints()`, which fingerprints two dozen
// passwords *concurrently*. On a fresh install all of those calls found no key,
// all of them generated their own random one, and all of them wrote it — so the
// weak-password set was computed under two dozen different keys and matched
// nothing afterwards. Sharing the promise makes the generate-and-store step
// happen exactly once.
let keyPromise: Promise<string> | null = null

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * Returns the raw (base64) fingerprint key, creating it on first use.
 * Exported so encrypted backups can carry it — never write this anywhere
 * that is not itself encrypted.
 */
export async function getRawFingerprintKey(): Promise<string> {
  if (cachedRawKey) return cachedRawKey
  if (keyPromise) return keyPromise

  keyPromise = (async () => {
    const existing = await nativeStorage.get<string>(FINGERPRINT_KEY_STORAGE_KEY)
    if (typeof existing === 'string' && existing.length >= 40) {
      cachedRawKey = existing
      return existing
    }

    const raw = bytesToBase64(crypto.getRandomValues(new Uint8Array(32)))
    await nativeStorage.set(FINGERPRINT_KEY_STORAGE_KEY, raw)
    cachedRawKey = raw
    return raw
  })()

  try {
    return await keyPromise
  } catch (err) {
    // A failed lookup must not be cached, or every later call inherits it.
    keyPromise = null
    throw err
  }
}

/**
 * Installs a fingerprint key recovered from an encrypted backup, so restored
 * accounts keep matching each other. Resets the in-memory cache.
 */
export async function setRawFingerprintKey(raw: string): Promise<void> {
  await nativeStorage.set(FINGERPRINT_KEY_STORAGE_KEY, raw)
  cachedRawKey = raw
  cachedKey = null
  keyPromise = null
  // The weak-password set is keyed too. Leaving it memoised under the old key
  // would mean weak-password detection silently stops matching after a restore.
  weakSetPromise = null
}

async function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey
  const raw = await getRawFingerprintKey()
  cachedKey = await crypto.subtle.importKey(
    'raw',
    base64ToBytes(raw),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return cachedKey
}

/**
 * Computes the reuse fingerprint for a password.
 * Returns '' for an empty password so callers can treat "no password recorded"
 * distinctly from "password recorded".
 */
export async function fingerprintPassword(password: string): Promise<string> {
  if (!password) return ''
  const key = await getKey()
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(password)
  )
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Fingerprints of passwords that are common enough to be considered broken on
 * sight. Computed at runtime under the install's own key — hardcoding digests
 * is not possible with a keyed scheme, and it was never reliable: the previous
 * hardcoded SHA-256 table had three wrong entries that silently never matched.
 */
const WEAK_PASSWORDS = [
  'password',
  'password1',
  'password123',
  '123456',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty',
  'qwerty123',
  'abc123',
  'admin',
  'letmein',
  'welcome',
  'monkey',
  'dragon',
  '111111',
  '000000',
  'iloveyou',
  'sunshine',
  'princess',
  'football',
  'baseball',
  'trustno1',
  'changeme'
]

let weakSetPromise: Promise<Set<string>> | null = null

/**
 * Returns the set of fingerprints corresponding to `WEAK_PASSWORDS` under the
 * current install key. Computed once and memoised.
 */
export async function getWeakFingerprints(): Promise<Set<string>> {
  if (!weakSetPromise) {
    weakSetPromise = Promise.all(WEAK_PASSWORDS.map(fingerprintPassword)).then(
      (list) => new Set(list)
    )
  }
  return weakSetPromise
}

/** Clears memoised state. Call after the fingerprint key changes. */
export function resetFingerprintCache(): void {
  cachedKey = null
  cachedRawKey = null
  keyPromise = null
  weakSetPromise = null
}

export const WEAK_PASSWORD_COUNT = WEAK_PASSWORDS.length
