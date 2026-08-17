import { beforeEach, describe, expect, it } from 'vitest'
import {
  CLOUD_SYNC_ENABLED_KEY,
  CLOUD_SYNC_PASSPHRASE_KEY,
  clearCloudSync,
  estimateSyncPayloadBytes,
  getCloudSyncStatus,
  isCloudSyncEnabled,
  pullFromCloudSync,
  pushToCloudSync
} from '~/core/utils/cloud-sync'
import {
  FINGERPRINT_KEY_STORAGE_KEY,
  fingerprintPassword,
  getRawFingerprintKey,
  resetFingerprintCache
} from '~/core/utils/password-fingerprint'
import { compressData } from '~/core/utils/compression'
import { encryptData } from '~/core/utils/encryption'
import { nativeStorage } from '~/core/storage/native'
import { makeFixtureVault } from '../helpers/vault-fixture'
import { peekStore } from '../helpers/chrome-mock'

/**
 * Incompressible filler. LZ-String collapses repeated characters to almost
 * nothing, so `'n'.repeat(n)` cannot be used to grow a payload.
 */
function noise(chars: number): string {
  const bytes = new Uint8Array(Math.ceil((chars * 3) / 4))
  // getRandomValues rejects anything over 65,536 bytes in one call.
  for (let i = 0; i < bytes.length; i += 65_536) {
    crypto.getRandomValues(bytes.subarray(i, Math.min(i + 65_536, bytes.length)))
  }
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary).slice(0, chars)
}

const PASSPHRASE = 'a sync passphrase'

/**
 * @plasmohq/storage JSON-encodes every value it writes, so seeding the raw
 * chrome.storage mock has to encode too — otherwise the library's own `get`
 * throws while parsing and the module under test silently sees `undefined`.
 */
async function seedLocal(key: string, value: unknown) {
  await chrome.storage.local.set({ [key]: JSON.stringify(value) })
}

async function enableSync(passphrase: string | null = PASSPHRASE) {
  await seedLocal(CLOUD_SYNC_ENABLED_KEY, true)
  if (passphrase !== null) {
    await seedLocal(CLOUD_SYNC_PASSPHRASE_KEY, passphrase)
  }
}

/** Every sync_chunk_* key currently in the mocked sync area. */
function chunkKeys(): string[] {
  return [...peekStore('sync').keys()].filter((k) => k.startsWith('sync_chunk_'))
}

describe('opt-in', () => {
  it('is off when nothing has been set', async () => {
    expect(await isCloudSyncEnabled()).toBe(false)
  })

  it('refuses to upload while disabled', async () => {
    const result = await pushToCloudSync(makeFixtureVault())
    expect(result).toMatchObject({ ok: false, reason: 'disabled' })
    expect(peekStore('sync').size).toBe(0)
  })

  it('is only on for an explicit true, not a truthy value', async () => {
    await seedLocal(CLOUD_SYNC_ENABLED_KEY, 'yes')
    expect(await isCloudSyncEnabled()).toBe(false)
  })
})

describe('fail-closed encryption', () => {
  it('refuses to upload without a passphrase rather than uploading plaintext', async () => {
    await enableSync(null)
    const result = await pushToCloudSync(makeFixtureVault())
    expect(result).toMatchObject({ ok: false, reason: 'no-passphrase' })
    expect(peekStore('sync').size).toBe(0)
  })

  it('treats an empty-string passphrase as no passphrase', async () => {
    await enableSync('')
    const result = await pushToCloudSync(makeFixtureVault())
    expect(result).toMatchObject({ ok: false, reason: 'no-passphrase' })
  })

  it('never writes anything recognisable as the vault', async () => {
    await enableSync()
    await pushToCloudSync(makeFixtureVault())

    const uploaded = chunkKeys()
      .map((k) => peekStore('sync').get(k))
      .join('')

    // These strings are all in the fixture in cleartext.
    for (const secret of [
      'dev@example.com',
      'github.com',
      'ghp_exampleTokenValueOnlyForTests',
      'Rotate the recovery codes'
    ]) {
      expect(uploaded).not.toContain(secret)
    }
  })
})

describe('push then pull', () => {
  beforeEach(async () => {
    await enableSync()
  })

  it('round-trips the whole vault through chrome.storage.sync', async () => {
    const vault = makeFixtureVault()
    const push = await pushToCloudSync(vault)
    expect(push.ok).toBe(true)

    const pulled = await pullFromCloudSync()
    expect(pulled).not.toBeNull()
    expect(pulled!.savedAccounts).toEqual(vault.savedAccounts)
    expect(pulled!.oauthRegistry).toEqual(vault.oauthRegistry)
    expect(pulled!.mfaRegistry).toEqual(vault.mfaRegistry)
  })

  it('accepts the snake_case shape the background worker reads from storage', async () => {
    const vault = makeFixtureVault()
    await pushToCloudSync({
      saved_accounts: vault.savedAccounts,
      oauth_registry: vault.oauthRegistry,
      mfa_registry: vault.mfaRegistry
    })

    const pulled = await pullFromCloudSync()
    expect(pulled!.savedAccounts).toEqual(vault.savedAccounts)
    expect(pulled!.mfaRegistry).toEqual(vault.mfaRegistry)
  })

  it('returns null when nothing has ever been uploaded', async () => {
    expect(await pullFromCloudSync()).toBeNull()
  })

  it('reports the upload timestamp and chunk count', async () => {
    await pushToCloudSync(makeFixtureVault())
    const meta = await getCloudSyncStatus()
    expect(meta!.numChunks).toBe(chunkKeys().length)
    expect(meta!.updated_at).toBeGreaterThan(0)
    expect(meta!.v).toBe(1)
  })

  it('fails with a readable message on the wrong passphrase', async () => {
    await pushToCloudSync(makeFixtureVault())
    await seedLocal(CLOUD_SYNC_PASSPHRASE_KEY, 'a different passphrase')
    await expect(pullFromCloudSync()).rejects.toThrow(/Incorrect password/i)
  })

  it('asks for the passphrase rather than failing obscurely when it is missing', async () => {
    await pushToCloudSync(makeFixtureVault())
    await chrome.storage.local.remove(CLOUD_SYNC_PASSPHRASE_KEY)
    await expect(pullFromCloudSync()).rejects.toThrow(/sync passphrase/i)
  })

  it('reports an incomplete upload instead of a decryption error', async () => {
    await pushToCloudSync(makeFixtureVault())
    const keys = chunkKeys()
    // Simulate one chunk failing to replicate.
    await chrome.storage.sync.remove(keys[keys.length - 1])
    await expect(pullFromCloudSync()).rejects.toThrow(/incomplete/i)
  })
})

describe('chunking', () => {
  beforeEach(async () => {
    await enableSync()
  })

  it('keeps every item under the browser 8KB per-item cap', async () => {
    await pushToCloudSync(makeFixtureVault())
    for (const key of chunkKeys()) {
      const bytes = new TextEncoder().encode(
        key + JSON.stringify(peekStore('sync').get(key))
      ).length
      expect(bytes).toBeLessThan(8_192)
    }
  })

  it('drops stale chunks when the vault shrinks', async () => {
    const vault = makeFixtureVault()
    // Inflate the vault so it needs several chunks.
    vault.savedAccounts[0].accounts[0].notes = noise(30_000)
    await pushToCloudSync(vault)
    const before = chunkKeys().length
    expect(before).toBeGreaterThan(1)

    await pushToCloudSync(makeFixtureVault())
    const after = chunkKeys().length
    expect(after).toBeLessThan(before)

    // A leftover chunk would be concatenated onto the next pull and corrupt it.
    const pulled = await pullFromCloudSync()
    expect(pulled!.savedAccounts).toEqual(makeFixtureVault().savedAccounts)
  })

  it('refuses a vault too large for the sync quota', async () => {
    const vault = makeFixtureVault()
    vault.savedAccounts[0].accounts[0].notes = noise(400_000)

    const result = await pushToCloudSync(vault)
    expect(result).toMatchObject({ ok: false, reason: 'too-large' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toMatch(/export/i)
  })

  it('writes chunks before the metadata that points at them', async () => {
    // A pull racing a push must never read a chunk count that outruns the
    // chunks themselves, so metadata is written last.
    await pushToCloudSync(makeFixtureVault())
    const keys = [...peekStore('sync').keys()]
    expect(keys.indexOf('sync_meta')).toBeGreaterThan(
      keys.indexOf('sync_chunk_0')
    )
  })
})

describe('clearCloudSync', () => {
  it('removes every chunk and the metadata', async () => {
    await enableSync()
    await pushToCloudSync(makeFixtureVault())
    expect(peekStore('sync').size).toBeGreaterThan(0)

    await clearCloudSync()
    expect(peekStore('sync').size).toBe(0)
    expect(await getCloudSyncStatus()).toBeNull()
    expect(await pullFromCloudSync()).toBeNull()
  })
})

describe('reuse-detection key', () => {
  beforeEach(async () => {
    // The module memoises the key; storage alone being wiped is not enough.
    resetFingerprintCache()
    await enableSync()
  })

  it('carries the key so a second device computes matching fingerprints', async () => {
    // The bug this guards: fingerprints synced, key did not. Device B compared
    // A's fingerprints against ones computed under its own key, matched
    // nothing, and reported every account as unique — a wrong answer.
    const onDeviceA = await fingerprintPassword('hunter2')
    await pushToCloudSync(makeFixtureVault())

    // Become a different install: no key, nothing memoised.
    await nativeStorage.remove(FINGERPRINT_KEY_STORAGE_KEY)
    resetFingerprintCache()
    expect(await fingerprintPassword('hunter2')).not.toBe(onDeviceA)

    resetFingerprintCache()
    await nativeStorage.remove(FINGERPRINT_KEY_STORAGE_KEY)
    await pullFromCloudSync()

    expect(await fingerprintPassword('hunter2')).toBe(onDeviceA)
  })

  it('installs the key into storage, not just the in-memory cache', async () => {
    const original = await getRawFingerprintKey()
    await pushToCloudSync(makeFixtureVault())

    await nativeStorage.remove(FINGERPRINT_KEY_STORAGE_KEY)
    resetFingerprintCache()
    await pullFromCloudSync()

    expect(await nativeStorage.get<string>(FINGERPRINT_KEY_STORAGE_KEY)).toBe(
      original
    )
  })

  it('adds the key even when the caller never supplied it', async () => {
    // Four call sites push, and none of them pass the key — that is precisely
    // why it is added inside the module rather than by each caller.
    const original = await getRawFingerprintKey()
    await pushToCloudSync({ saved_accounts: makeFixtureVault().savedAccounts })

    await nativeStorage.remove(FINGERPRINT_KEY_STORAGE_KEY)
    resetFingerprintCache()
    const pulled = await pullFromCloudSync()

    expect(pulled!.passwordFingerprintKey).toBe(original)
  })

  it('never leaves the key readable in what is uploaded', async () => {
    const key = await getRawFingerprintKey()
    await pushToCloudSync(makeFixtureVault())

    const uploaded = chunkKeys()
      .map((k) => peekStore('sync').get(k))
      .join('')

    expect(uploaded).not.toContain(key)
  })

  it('keeps the local key when the synced payload predates it', async () => {
    // Wiping the local key on a payload with nothing to install would strand
    // every fingerprint already on this device.
    const original = await getRawFingerprintKey()

    const legacy = await encryptData(
      // No passwordFingerprintKey on the payload, so compressData emits no `fk`.
      compressData({ savedAccounts: makeFixtureVault().savedAccounts }),
      PASSPHRASE
    )
    await chrome.storage.sync.set({
      sync_chunk_0: JSON.stringify(legacy),
      sync_meta: JSON.stringify({ numChunks: 1, updated_at: 1, v: 1 })
    })

    const pulled = await pullFromCloudSync()

    expect(pulled!.passwordFingerprintKey).toBeUndefined()
    expect(await nativeStorage.get<string>(FINGERPRINT_KEY_STORAGE_KEY)).toBe(
      original
    )
  })
})

describe('estimateSyncPayloadBytes', () => {
  it('is within a few percent of what actually gets uploaded', async () => {
    await enableSync()
    const vault = makeFixtureVault()
    const estimate = estimateSyncPayloadBytes(vault)

    const result = await pushToCloudSync(vault)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const error = Math.abs(estimate - result.bytes) / result.bytes
    expect(error).toBeLessThan(0.05)
  })

  it('never under-reports, which would let an over-limit vault look safe', async () => {
    await enableSync()
    const vault = makeFixtureVault()
    const result = await pushToCloudSync(vault)
    if (!result.ok) throw new Error('push should have succeeded')
    expect(estimateSyncPayloadBytes(vault)).toBeGreaterThanOrEqual(result.bytes)
  })
})
