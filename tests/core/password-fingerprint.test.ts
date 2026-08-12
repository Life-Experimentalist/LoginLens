import { beforeEach, describe, expect, it } from 'vitest'

import {
  FINGERPRINT_KEY_STORAGE_KEY,
  WEAK_PASSWORD_COUNT,
  fingerprintPassword,
  getRawFingerprintKey,
  getWeakFingerprints,
  resetFingerprintCache,
  setRawFingerprintKey
} from '~/core/utils/password-fingerprint'
import { nativeStorage } from '~/core/storage/native'

// The whole point of this module is that reuse can be detected without the
// password being recoverable. These tests hold both halves of that: equality is
// preserved, and nothing derived from the password is reversible or portable.

beforeEach(() => {
  // Storage is wiped between tests by the global setup, but the module keeps
  // the key and the weak-password set memoised in module scope.
  resetFingerprintCache()
})

describe('getRawFingerprintKey', () => {
  it('generates a key on first use and persists it', async () => {
    const key = await getRawFingerprintKey()

    expect(key).toBeTypeOf('string')
    // 32 random bytes, base64 encoded.
    expect(key.length).toBeGreaterThanOrEqual(40)
    expect(await nativeStorage.get<string>(FINGERPRINT_KEY_STORAGE_KEY)).toBe(key)
  })

  it('returns the same key on subsequent calls', async () => {
    const first = await getRawFingerprintKey()
    resetFingerprintCache()
    const second = await getRawFingerprintKey()

    expect(second).toBe(first)
  })

  it('generates a different key for a different install', async () => {
    const first = await getRawFingerprintKey()

    await nativeStorage.remove(FINGERPRINT_KEY_STORAGE_KEY)
    resetFingerprintCache()
    const second = await getRawFingerprintKey()

    expect(second).not.toBe(first)
  })

  it('generates exactly one key when called concurrently on a fresh install', async () => {
    // getWeakFingerprints() fans out two dozen fingerprint calls at once, and
    // each of them needs the key. If the generate-and-store step is not shared,
    // every caller mints its own key and the results do not compare.
    const keys = await Promise.all(
      Array.from({ length: 24 }, () => getRawFingerprintKey())
    )

    expect(new Set(keys).size).toBe(1)
    expect(await nativeStorage.get<string>(FINGERPRINT_KEY_STORAGE_KEY)).toBe(keys[0])
  })

  it('replaces a stored value too short to be a real key', async () => {
    await nativeStorage.set(FINGERPRINT_KEY_STORAGE_KEY, 'truncated')
    resetFingerprintCache()

    const key = await getRawFingerprintKey()

    expect(key).not.toBe('truncated')
    expect(key.length).toBeGreaterThanOrEqual(40)
  })
})

describe('fingerprintPassword', () => {
  it('returns the same fingerprint for the same password', async () => {
    const a = await fingerprintPassword('correct horse battery staple')
    const b = await fingerprintPassword('correct horse battery staple')

    expect(a).toBe(b)
  })

  it('returns different fingerprints for different passwords', async () => {
    const a = await fingerprintPassword('hunter2')
    const b = await fingerprintPassword('hunter3')

    expect(a).not.toBe(b)
  })

  it('is case- and whitespace-sensitive', async () => {
    const base = await fingerprintPassword('Passw0rd')

    expect(await fingerprintPassword('passw0rd')).not.toBe(base)
    expect(await fingerprintPassword('Passw0rd ')).not.toBe(base)
  })

  it('returns a 64-character lowercase hex digest', async () => {
    const fp = await fingerprintPassword('hunter2')

    expect(fp).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns an empty string for an empty password', async () => {
    // Callers rely on this to tell "no password recorded" apart from
    // "password recorded" — an empty string must not be a real fingerprint.
    expect(await fingerprintPassword('')).toBe('')
  })

  it('does not contain the password', async () => {
    const fp = await fingerprintPassword('hunter2')

    expect(fp).not.toContain('hunter2')
    expect(fp.toLowerCase()).not.toContain('hunter')
  })

  it('produces a different fingerprint under a different key', async () => {
    const underFirstKey = await fingerprintPassword('hunter2')

    // A fingerprint stolen from one machine is meaningless on another, which is
    // the property a bare SHA-256 would not have.
    await nativeStorage.remove(FINGERPRINT_KEY_STORAGE_KEY)
    resetFingerprintCache()
    const underSecondKey = await fingerprintPassword('hunter2')

    expect(underSecondKey).not.toBe(underFirstKey)
  })

  it('handles unicode passwords', async () => {
    const a = await fingerprintPassword('пароль🔐')
    const b = await fingerprintPassword('пароль🔐')

    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('setRawFingerprintKey', () => {
  it('makes fingerprints match again after a restore', async () => {
    // Simulates: fingerprint on device A, restore an encrypted backup on B.
    const originalKey = await getRawFingerprintKey()
    const onDeviceA = await fingerprintPassword('hunter2')

    await nativeStorage.remove(FINGERPRINT_KEY_STORAGE_KEY)
    resetFingerprintCache()
    expect(await fingerprintPassword('hunter2')).not.toBe(onDeviceA)

    await setRawFingerprintKey(originalKey)

    expect(await fingerprintPassword('hunter2')).toBe(onDeviceA)
    expect(await nativeStorage.get<string>(FINGERPRINT_KEY_STORAGE_KEY)).toBe(
      originalKey
    )
  })

  it('recomputes the weak-password set under the new key', async () => {
    // Leaving the memoised set behind would silently stop weak-password
    // detection from matching anything after a restore.
    const originalKey = await getRawFingerprintKey()
    const weakBefore = await getWeakFingerprints()
    expect(weakBefore.has(await fingerprintPassword('password'))).toBe(true)

    await nativeStorage.remove(FINGERPRINT_KEY_STORAGE_KEY)
    resetFingerprintCache()
    await getWeakFingerprints()

    await setRawFingerprintKey(originalKey)
    const weakAfter = await getWeakFingerprints()

    expect(weakAfter.has(await fingerprintPassword('password'))).toBe(true)
  })
})

describe('getWeakFingerprints', () => {
  it('contains one fingerprint per known-weak password', async () => {
    const weak = await getWeakFingerprints()

    expect(weak.size).toBe(WEAK_PASSWORD_COUNT)
  })

  it('matches the well-known weak passwords', async () => {
    const weak = await getWeakFingerprints()

    for (const password of ['password', 'password1', '123456', 'letmein', 'dragon']) {
      expect(
        weak.has(await fingerprintPassword(password)),
        `expected "${password}" to be flagged weak`
      ).toBe(true)
    }
  })

  it('does not match a strong password', async () => {
    const weak = await getWeakFingerprints()

    expect(weak.has(await fingerprintPassword('correct horse battery staple'))).toBe(
      false
    )
  })

  it('returns the same set instance on repeated calls', async () => {
    expect(await getWeakFingerprints()).toBe(await getWeakFingerprints())
  })
})
