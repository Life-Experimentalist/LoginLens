// ---------------------------------------------------------------------------
// Encryption utilities — AES-256-GCM with PBKDF2-HMAC-SHA256 key derivation.
// ---------------------------------------------------------------------------
// Payload format (versioned so KDF parameters can be raised without breaking
// data written by older builds):
//
//   [0]      magic   0x4C ('L')
//   [1]      version 0x01
//   [2..5]   iterations, uint32 big-endian
//   [6..21]  salt, 16 bytes
//   [22..33] iv, 12 bytes
//   [34..]   AES-GCM ciphertext + 16-byte auth tag
//
// The whole blob is base64-encoded for storage/transport. Version 0 (legacy,
// headerless: salt|iv|ciphertext with a fixed 100k iterations) is still
// readable so existing backups keep working.
// ---------------------------------------------------------------------------

const MAGIC = 0x4c
const VERSION = 1

/** OWASP 2023 minimum for PBKDF2-HMAC-SHA256. */
export const PBKDF2_ITERATIONS = 600_000

/** Iteration count assumed for headerless payloads written by pre-1.0 builds. */
const LEGACY_ITERATIONS = 100_000

const SALT_BYTES = 16
const IV_BYTES = 12
const HEADER_BYTES = 6
const LEGACY_PREFIX_BYTES = SALT_BYTES + IV_BYTES

/**
 * AES-GCM produces a 16-byte auth tag, so any real ciphertext is at least
 * that long. Used to reject truncated payloads before touching WebCrypto.
 */
const GCM_TAG_BYTES = 16

function toBase64(bytes: Uint8Array): string {
  // Chunked to avoid "Maximum call stack size exceeded" on large vaults —
  // String.fromCharCode(...spread) blows up well before 1MB.
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  )

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Encrypts `text` with a key derived from `password`.
 * Returns a self-describing base64 payload (see format above).
 */
export async function encryptData(
  text: string,
  password: string
): Promise<string> {
  if (!password) {
    throw new Error('A password is required to encrypt data.')
  }

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS)

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(text)
    )
  )

  const payload = new Uint8Array(
    HEADER_BYTES + SALT_BYTES + IV_BYTES + ciphertext.length
  )
  payload[0] = MAGIC
  payload[1] = VERSION
  new DataView(payload.buffer).setUint32(2, PBKDF2_ITERATIONS, false)
  payload.set(salt, HEADER_BYTES)
  payload.set(iv, HEADER_BYTES + SALT_BYTES)
  payload.set(ciphertext, HEADER_BYTES + SALT_BYTES + IV_BYTES)

  return toBase64(payload)
}

interface ParsedPayload {
  salt: Uint8Array
  iv: Uint8Array
  ciphertext: Uint8Array
  iterations: number
}

function parsePayload(payload: Uint8Array): ParsedPayload {
  const isVersioned =
    payload.length > HEADER_BYTES && payload[0] === MAGIC && payload[1] === VERSION

  if (isVersioned) {
    const iterations = new DataView(
      payload.buffer,
      payload.byteOffset
    ).getUint32(2, false)

    // Guard against a corrupted header driving an absurd KDF cost that would
    // hang the UI thread for minutes.
    if (iterations < 1_000 || iterations > 5_000_000) {
      throw new Error('Backup file is corrupted (invalid key-derivation cost).')
    }

    return {
      iterations,
      salt: payload.slice(HEADER_BYTES, HEADER_BYTES + SALT_BYTES),
      iv: payload.slice(HEADER_BYTES + SALT_BYTES, HEADER_BYTES + SALT_BYTES + IV_BYTES),
      ciphertext: payload.slice(HEADER_BYTES + SALT_BYTES + IV_BYTES)
    }
  }

  // Legacy headerless payload: salt | iv | ciphertext, 100k iterations.
  return {
    iterations: LEGACY_ITERATIONS,
    salt: payload.slice(0, SALT_BYTES),
    iv: payload.slice(SALT_BYTES, LEGACY_PREFIX_BYTES),
    ciphertext: payload.slice(LEGACY_PREFIX_BYTES)
  }
}

/**
 * Decrypts a payload produced by `encryptData`, including legacy headerless
 * payloads from pre-1.0 builds.
 *
 * Throws a user-facing Error for every failure mode — malformed base64,
 * truncated data, and wrong password all surface as readable messages rather
 * than raw DOMExceptions.
 */
export async function decryptData(
  base64Payload: string,
  password: string
): Promise<string> {
  if (!base64Payload) {
    throw new Error('There is no backup data to decrypt.')
  }

  let payload: Uint8Array
  try {
    payload = fromBase64(base64Payload.trim())
  } catch {
    throw new Error('Backup file is not valid — it is corrupted or not a LoginLens backup.')
  }

  const parsed = parsePayload(payload)

  if (parsed.ciphertext.length < GCM_TAG_BYTES) {
    throw new Error('Backup file is truncated or incomplete.')
  }

  const key = await deriveKey(password, parsed.salt, parsed.iterations)

  let decrypted: ArrayBuffer
  try {
    decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: parsed.iv },
      key,
      parsed.ciphertext
    )
  } catch {
    throw new Error('Decryption failed. Incorrect password or corrupted data.')
  }

  return new TextDecoder().decode(decrypted)
}

/**
 * Returns true if `value` looks like a payload written by `encryptData`.
 * Used to tell encrypted backups apart from plain-JSON ones on import.
 */
export function isEncryptedPayload(value: string): boolean {
  if (!value) return false
  try {
    const bytes = fromBase64(value.trim().slice(0, 12))
    return bytes[0] === MAGIC && bytes[1] === VERSION
  } catch {
    return false
  }
}
