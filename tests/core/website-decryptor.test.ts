/**
 * Cross-implementation contract: the recovery page on the website must open
 * exactly what the extension writes.
 *
 * These are two separate codebases that happen to agree on a byte layout, and
 * nothing but this file forces them to keep agreeing. When they drifted, the
 * failure was invisible in both halves — the extension exported fine, the page
 * loaded fine, and the mismatch only surfaced for someone who had already lost
 * the extension and had nothing left but the backup. So the test deliberately
 * imports the real encryptor from `src/` and the real decryptor from
 * `website/src/` rather than re-deriving either.
 */

import { beforeAll, describe, expect, it } from 'vitest'
import { encryptData } from '~/core/utils/encryption'
import { buildEncryptedBackup, buildJsonBackup } from '~/core/utils/export'
import {
  convertVaultToBrowserCSV,
  decryptVaultPayload,
  type DomainEntry as WebsiteDomainEntry
} from '../../website/src/utils/crypto'
import { makeFixtureVault } from '../helpers/vault-fixture'

const PASSPHRASE = 'correct horse battery staple'

const vault = makeFixtureVault()

/** Built once — PBKDF2 at 600k iterations is not free. */
let llbakFile: string

beforeAll(async () => {
  llbakFile = await buildEncryptedBackup(vault, PASSPHRASE)
}, 30_000)

/**
 * The pre-1.0 headerless envelope: salt | iv | ciphertext, PBKDF2 fixed at
 * 100,000 iterations. Written by hand because no current code path emits it,
 * and backups in that format are still out there.
 */
async function encryptLegacy(plaintext: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  )

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(plaintext)
    )
  )

  const payload = new Uint8Array(16 + 12 + ciphertext.length)
  payload.set(salt, 0)
  payload.set(iv, 16)
  payload.set(ciphertext, 28)

  return btoa(String.fromCharCode(...payload))
}

describe('website decryptor against extension output', () => {
  it('opens a .llbak file exported by the extension', async () => {
    const result = await decryptVaultPayload(llbakFile, PASSPHRASE)

    expect(result.savedAccounts).toEqual(vault.savedAccounts)
    expect(result.oauthRegistry).toEqual(vault.oauthRegistry)
    expect(result.mfaRegistry).toEqual(vault.mfaRegistry)
  }, 30_000)

  it('exposes the decrypted document verbatim for the JSON download', async () => {
    const result = await decryptVaultPayload(llbakFile, PASSPHRASE)

    // The fingerprint key rides inside the encrypted blob and must survive to
    // the download, or a restored vault recomputes different fingerprints and
    // reports every reused password as unique.
    expect(typeof result.raw.passwordFingerprintKey).toBe('string')
    expect(result.raw.savedAccounts).toEqual(vault.savedAccounts)
  }, 30_000)

  it('reads the collections under their camelCase names', async () => {
    // `saved_accounts` (snake_case) is not what the encrypted document uses.
    // Reading the wrong casing produced an empty vault and no error at all.
    const result = await decryptVaultPayload(llbakFile, PASSPHRASE)
    expect(result.savedAccounts.length).toBe(vault.savedAccounts.length)
    expect(result.savedAccounts[0].domain).toBe('github.com')
  }, 30_000)

  it('accepts a bare base64 envelope pasted without the JSON wrapper', async () => {
    const payload = await encryptData(
      JSON.stringify({ savedAccounts: vault.savedAccounts }),
      PASSPHRASE
    )

    const result = await decryptVaultPayload(payload, PASSPHRASE)
    expect(result.savedAccounts).toEqual(vault.savedAccounts)
  }, 30_000)

  it('still opens the pre-1.0 headerless envelope', async () => {
    const legacy = await encryptLegacy(
      JSON.stringify({ savedAccounts: vault.savedAccounts }),
      PASSPHRASE
    )

    const result = await decryptVaultPayload(legacy, PASSPHRASE)
    expect(result.savedAccounts).toEqual(vault.savedAccounts)
  }, 30_000)

  it('reads a plain .json backup without a passphrase', async () => {
    const result = await decryptVaultPayload(buildJsonBackup(vault), '')

    expect(result.savedAccounts).toEqual(vault.savedAccounts)
    expect(result.oauthRegistry).toEqual(vault.oauthRegistry)
    expect(result.mfaRegistry).toEqual(vault.mfaRegistry)
  })
})

describe('website decryptor failure modes', () => {
  it('reports a wrong passphrase rather than throwing a DOMException', async () => {
    await expect(decryptVaultPayload(llbakFile, 'not the passphrase')).rejects.toThrow(
      /incorrect passphrase/i
    )
  }, 30_000)

  it('asks for a passphrase instead of failing obscurely on an encrypted file', async () => {
    await expect(decryptVaultPayload(llbakFile, '')).rejects.toThrow(/passphrase/i)
  })

  it('rejects an absurd key-derivation cost instead of freezing the tab', async () => {
    const payload = new Uint8Array(6 + 16 + 12 + 32)
    payload[0] = 0x4c
    payload[1] = 0x01
    new DataView(payload.buffer).setUint32(2, 900_000_000, false)

    await expect(
      decryptVaultPayload(btoa(String.fromCharCode(...payload)), PASSPHRASE)
    ).rejects.toThrow(/corrupted/i)
  })

  it('rejects a truncated payload', async () => {
    const payload = new Uint8Array(6 + 16 + 12 + 4)
    payload[0] = 0x4c
    payload[1] = 0x01
    new DataView(payload.buffer).setUint32(2, 600_000, false)

    await expect(
      decryptVaultPayload(btoa(String.fromCharCode(...payload)), PASSPHRASE)
    ).rejects.toThrow(/truncated|incomplete/i)
  })

  it('says so plainly when the JSON holds no vault', async () => {
    await expect(
      decryptVaultPayload(JSON.stringify({ hello: 'world' }), PASSPHRASE)
    ).rejects.toThrow(/no LoginLens vault/i)
  })

  it('rejects an empty file', async () => {
    await expect(decryptVaultPayload('   ', PASSPHRASE)).rejects.toThrow(/no backup data/i)
  })
})

describe('convertVaultToBrowserCSV', () => {
  const accounts = vault.savedAccounts as unknown as WebsiteDomainEntry[]

  it('leaves the password column empty for every row', () => {
    const rows = convertVaultToBrowserCSV(accounts).split('\n')

    expect(rows[0]).toBe('name,url,username,password,note')
    for (const row of rows.slice(1)) {
      // name,url,username,<empty>,note — the fourth field is always blank
      // because LoginLens has no password to put there.
      expect(row.split(',')[3]).toBe('')
    }
  })

  it('emits one row per account and records how the account signs in', () => {
    const csv = convertVaultToBrowserCSV(accounts)
    const dataRows = csv.split('\n').slice(1)

    const expectedCount = accounts.reduce(
      (sum, entry) => sum + (entry.accounts?.length || 0),
      0
    )
    expect(dataRows.length).toBe(expectedCount)
    expect(csv).toContain('LoginLens: Authenticated via google.com')
    expect(csv).toContain('LoginLens: API Key / Token')
  })

  it('quotes fields containing commas so the file stays parseable', () => {
    const csv = convertVaultToBrowserCSV([
      {
        domain: 'example.com',
        accounts: [
          {
            id: 'a',
            label: 'Work, Personal',
            identities: ['me@example.com'],
            login_method: { type: 'password' }
          }
        ]
      }
    ])

    expect(csv).toContain('"Work, Personal"')
  })
})
