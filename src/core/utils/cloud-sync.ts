// ---------------------------------------------------------------------------
// Optional encrypted cross-device sync via chrome.storage.sync.
// ---------------------------------------------------------------------------
// IMPORTANT — read before changing anything here.
//
// chrome.storage.sync is NOT local storage. Everything written here is
// uploaded to the browser vendor's servers (Google for Chrome, Microsoft for
// Edge) and replicated to the user's other signed-in browsers.
//
// Because of that, this module holds to three rules:
//
//   1. OFF by default. Sync only runs after the user explicitly turns it on.
//   2. Never upload plaintext. The payload is AES-256-GCM encrypted with a key
//      derived from a user-chosen sync passphrase before it leaves the device.
//      Without the passphrase the uploaded blob is opaque to the vendor.
//   3. Fail closed. If the passphrase is missing or encryption fails, we abort
//      the upload rather than falling back to plaintext.
//
// The payload carries the reuse-detection HMAC key alongside the vault. That is
// deliberate: the fingerprints are useless — worse, silently wrong — on a device
// holding a different key. It is only acceptable because of rule 2, and it is
// the same trade already made for encrypted .llbak exports.
//
// The passphrase is stored in chrome.storage.local so background sync can run
// unattended. That protects the *cloud copy*, not the local device — anyone
// with access to the unlocked profile can read both. This is the same trade-off
// browser sync passphrases make, and it is stated plainly in docs/privacy.md.
// ---------------------------------------------------------------------------

import { Storage } from '@plasmohq/storage'
import { compressData, decompressData, type ExpandedVault } from './compression'
import { encryptData, decryptData } from './encryption'
import {
  getRawFingerprintKey,
  setRawFingerprintKey
} from './password-fingerprint'
import { log } from './logger'

const syncStorage = new Storage({ area: 'sync' })
const localStorage = new Storage({ area: 'local' })

export const CLOUD_SYNC_ENABLED_KEY = 'cloud_sync_enabled'
export const CLOUD_SYNC_PASSPHRASE_KEY = 'cloud_sync_passphrase'

// chrome.storage.sync limits (Chrome, and matched by Edge/Firefox):
//   QUOTA_BYTES_PER_ITEM  8,192
//   QUOTA_BYTES         102,400
//   MAX_ITEMS               512
// We keep a margin under the per-item cap for the key name and JSON framing.
const CHUNK_SIZE = 6_000
export const MAX_TOTAL_BYTES = 100 * 1024
const MAX_CHUNKS = 16

/** Bytes of framing encryptData prepends: header + salt + IV, plus the GCM tag. */
const ENCRYPTION_OVERHEAD_BYTES = 6 + 16 + 12 + 16

/**
 * A stand-in for the fingerprint key, used only to size a payload.
 *
 * `pushToCloudSync` adds the real key after the estimate has already been
 * drawn, and reading it here would make the estimate async. Substituting a
 * value of the same shape — 32 bytes, base64, 44 characters — measures its cost
 * through the real compressor instead of guessing at it. It has to stay
 * incompressible: a run of repeated characters would collapse under LZ and
 * under-report, which is the one direction a gauge drawn against a hard limit
 * must never err in.
 */
const FINGERPRINT_KEY_PLACEHOLDER = 'nQ8vK2xR7mL4wZ1pT6yB9cF3hJ5sD0gA8kN2qV4uX7e='

/**
 * Slack over the measured size, covering the few bytes by which one random key
 * may compress differently from another.
 */
const ESTIMATE_MARGIN_BYTES = 16

function attachFingerprintKey(
  payload: unknown,
  passwordFingerprintKey: string
): object {
  // A bare array is the legacy "just the domains" shape, still accepted by
  // minimizeVaultForSync — it has nowhere to hang a sibling field, so name it.
  if (Array.isArray(payload)) return { savedAccounts: payload, passwordFingerprintKey }
  return { ...(payload as object), passwordFingerprintKey }
}

/**
 * Adds the reuse-detection key to a payload on its way out.
 *
 * Done here rather than at each call site deliberately: there are four places
 * that push, and the whole reason reuse detection was broken across devices is
 * that adding the key was every caller's job and therefore nobody's.
 */
async function withFingerprintKey(payload: unknown): Promise<object> {
  return attachFingerprintKey(payload, await getRawFingerprintKey())
}

/**
 * Size the upload would be, without actually deriving a key.
 *
 * The UI has to show the number the limit is checked against — the compressed
 * size alone understates it by about a third, because the encrypted blob is
 * base64-encoded before it is chunked.
 */
export function estimateSyncPayloadBytes(payload: unknown): number {
  // Sized with the key in place, because the key is part of what gets uploaded
  // and it is added downstream of every caller.
  const compressed = new TextEncoder().encode(
    compressData(attachFingerprintKey(payload, FINGERPRINT_KEY_PLACEHOLDER))
  ).length
  // base64 emits 4 characters per 3-byte group, padded — not 4/3 of the byte
  // count. Rounding the wrong way here under-reports by up to 3 bytes, which
  // is exactly the wrong direction for a gauge drawn against a hard limit.
  return (
    4 * Math.ceil((compressed + ENCRYPTION_OVERHEAD_BYTES) / 3) +
    ESTIMATE_MARGIN_BYTES
  )
}

const CHUNK_PREFIX = 'sync_chunk_'
const META_KEY = 'sync_meta'

export interface SyncMeta {
  numChunks: number
  updated_at: number
  /** Format version, so a future change can be detected on pull. */
  v: number
}

export type SyncResult =
  | { ok: true; chunks: number; bytes: number }
  | { ok: false; reason: 'disabled' | 'no-passphrase' | 'too-large' | 'error'; message: string }

export async function isCloudSyncEnabled(): Promise<boolean> {
  // Default OFF — sync uploads data off-device, so it must be opted into.
  return (await localStorage.get<boolean>(CLOUD_SYNC_ENABLED_KEY)) === true
}

export async function getSyncPassphrase(): Promise<string | null> {
  const value = await localStorage.get<string>(CLOUD_SYNC_PASSPHRASE_KEY)
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * Encrypts and uploads the vault to chrome.storage.sync.
 * Returns a structured result instead of throwing so callers can surface an
 * accurate message in the UI.
 */
export async function pushToCloudSync(payload: unknown): Promise<SyncResult> {
  if (!(await isCloudSyncEnabled())) {
    return { ok: false, reason: 'disabled', message: 'Cloud sync is turned off.' }
  }

  const passphrase = await getSyncPassphrase()
  if (!passphrase) {
    // Fail closed — never fall back to an unencrypted upload.
    log.warn('Cloud sync is enabled but no passphrase is set; upload skipped.')
    return {
      ok: false,
      reason: 'no-passphrase',
      message: 'Set a sync passphrase before syncing.'
    }
  }

  let encrypted: string
  try {
    encrypted = await encryptData(
      compressData(await withFingerprintKey(payload)),
      passphrase
    )
  } catch (err) {
    log.error('Cloud sync encryption failed; upload aborted.', err)
    return { ok: false, reason: 'error', message: 'Could not encrypt the vault for sync.' }
  }

  if (encrypted.length > MAX_TOTAL_BYTES) {
    return {
      ok: false,
      reason: 'too-large',
      message: `Vault is ${Math.round(encrypted.length / 1024)}KB encrypted, over the ${MAX_TOTAL_BYTES / 1024}KB browser sync limit. Use an encrypted file export instead.`
    }
  }

  const numChunks = Math.ceil(encrypted.length / CHUNK_SIZE)
  if (numChunks > MAX_CHUNKS) {
    return {
      ok: false,
      reason: 'too-large',
      message: 'Vault is too large for browser sync. Use an encrypted file export instead.'
    }
  }

  try {
    // Write chunks first, then the metadata. Ordering matters: a pull that
    // races a push must never see a chunk count that points at chunks which
    // have not landed yet.
    for (let i = 0; i < numChunks; i++) {
      await syncStorage.set(
        `${CHUNK_PREFIX}${i}`,
        encrypted.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
      )
    }

    const meta: SyncMeta = { numChunks, updated_at: Date.now(), v: 1 }
    await syncStorage.set(META_KEY, JSON.stringify(meta))

    // Only now drop chunks left over from a previously larger vault.
    for (let i = numChunks; i < MAX_CHUNKS; i++) {
      await syncStorage.remove(`${CHUNK_PREFIX}${i}`)
    }

    log.info(`Cloud sync: uploaded ${numChunks} encrypted chunk(s).`)
    return { ok: true, chunks: numChunks, bytes: encrypted.length }
  } catch (err) {
    // Most commonly MAX_WRITE_OPERATIONS_PER_MINUTE or QUOTA_BYTES.
    log.error('Cloud sync upload failed.', err)
    return {
      ok: false,
      reason: 'error',
      message: 'Browser sync rejected the upload (quota or rate limit). It will retry on the next change.'
    }
  }
}

/**
 * Downloads and decrypts the vault from chrome.storage.sync.
 * Returns null when there is nothing stored; throws with a user-facing message
 * when data exists but cannot be read (usually a mismatched passphrase).
 */
export async function pullFromCloudSync(): Promise<ExpandedVault | null> {
  const metaRaw = await syncStorage.get<string>(META_KEY)
  if (!metaRaw) return null

  let meta: SyncMeta
  try {
    meta = typeof metaRaw === 'string' ? JSON.parse(metaRaw) : (metaRaw as SyncMeta)
  } catch {
    throw new Error('Synced data is corrupted and cannot be read.')
  }

  if (!meta?.numChunks || meta.numChunks > MAX_CHUNKS) {
    throw new Error('Synced data is corrupted and cannot be read.')
  }

  const passphrase = await getSyncPassphrase()
  if (!passphrase) {
    throw new Error('Enter your sync passphrase to restore synced data.')
  }

  let encrypted = ''
  for (let i = 0; i < meta.numChunks; i++) {
    const chunk = await syncStorage.get<string>(`${CHUNK_PREFIX}${i}`)
    if (!chunk) {
      // A missing chunk means a partial upload — decrypting would fail the
      // auth tag anyway, so report the real cause.
      throw new Error('Synced data is incomplete. Re-sync from the device that has the full vault.')
    }
    encrypted += chunk
  }

  const decrypted = await decryptData(encrypted, passphrase)
  const vault = decompressData(decrypted)

  // A pull replaces the local vault wholesale, so the key that produced the
  // incoming fingerprints has to replace the local one too. Skipped for
  // payloads written before the key was synced — there is nothing to install,
  // and clearing the local key would strand the fingerprints already here.
  if (vault?.passwordFingerprintKey) {
    await setRawFingerprintKey(vault.passwordFingerprintKey)
  }

  return vault
}

/** Removes every synced chunk and its metadata from the cloud. */
export async function clearCloudSync(): Promise<void> {
  for (let i = 0; i < MAX_CHUNKS; i++) {
    await syncStorage.remove(`${CHUNK_PREFIX}${i}`)
  }
  await syncStorage.remove(META_KEY)
  log.info('Cloud sync: remote copy cleared.')
}

/** Timestamp of the last successful upload, or null if nothing is synced. */
export async function getCloudSyncStatus(): Promise<SyncMeta | null> {
  const metaRaw = await syncStorage.get<string>(META_KEY)
  if (!metaRaw) return null
  try {
    return typeof metaRaw === 'string' ? JSON.parse(metaRaw) : (metaRaw as SyncMeta)
  } catch {
    return null
  }
}
