import { describe, expect, it } from 'vitest'
import {
  JSON_FORMAT,
  LLBAK_FORMAT,
  backupFilename,
  buildEncryptedBackup,
  buildJsonBackup,
  convertVaultToCSV,
  escapeCSV,
  readVaultBundle,
  type VaultBundle
} from '~/core/utils/export'
import { decryptData } from '~/core/utils/encryption'
import { makeFixtureVault } from '../helpers/vault-fixture'

const PASSPHRASE = 'a backup passphrase'

function bundle(): VaultBundle {
  return makeFixtureVault()
}

describe('buildJsonBackup', () => {
  it('writes a shape the importer can read back', () => {
    const original = bundle()
    const restored = readVaultBundle(JSON.parse(buildJsonBackup(original)))

    expect(restored.savedAccounts).toEqual(original.savedAccounts)
    expect(restored.oauthRegistry).toEqual(original.oauthRegistry)
    expect(restored.mfaRegistry).toEqual(original.mfaRegistry)
  })

  it('stamps the envelope so the importer can pick a decoder', () => {
    const parsed = JSON.parse(buildJsonBackup(bundle()))
    expect(parsed.format).toBe(JSON_FORMAT)
    expect(parsed.version).toBe('1.0.0')
    expect(parsed.exported_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('never carries the fingerprint key in an unencrypted file', () => {
    // The key is what makes reuse detection work across a restore. Putting it
    // in a plaintext export would hand an attacker the ability to confirm a
    // password guess offline against the stored fingerprints.
    expect(buildJsonBackup(bundle())).not.toContain('passwordFingerprintKey')
  })
})

describe('buildEncryptedBackup', () => {
  it('round-trips through decryptData', async () => {
    const original = bundle()
    const file = await buildEncryptedBackup(original, PASSPHRASE)
    const envelope = JSON.parse(file)

    expect(envelope.format).toBe(LLBAK_FORMAT)
    expect(envelope.encryption).toBe('AES-256-GCM / PBKDF2-HMAC-SHA256')

    const inner = JSON.parse(await decryptData(envelope.payload, PASSPHRASE))
    const restored = readVaultBundle(inner)

    expect(restored.savedAccounts).toEqual(original.savedAccounts)
    expect(restored.oauthRegistry).toEqual(original.oauthRegistry)
    expect(restored.mfaRegistry).toEqual(original.mfaRegistry)
    expect(typeof inner.passwordFingerprintKey).toBe('string')
    expect(inner.passwordFingerprintKey.length).toBeGreaterThan(0)
  })

  it('leaves nothing readable in the envelope', async () => {
    const file = await buildEncryptedBackup(bundle(), PASSPHRASE)
    for (const secret of [
      'dev@example.com',
      'github.com',
      'ghp_exampleTokenValueOnlyForTests',
      'Rotate the recovery codes'
    ]) {
      expect(file).not.toContain(secret)
    }
  })
})

describe('readVaultBundle', () => {
  it('accepts the legacy top-level shape', () => {
    const original = bundle()
    const restored = readVaultBundle({
      savedAccounts: original.savedAccounts,
      oauth_registry: original.oauthRegistry,
      mfa_registry: original.mfaRegistry
    })
    expect(restored.savedAccounts).toEqual(original.savedAccounts)
    expect(restored.oauthRegistry).toEqual(original.oauthRegistry)
    expect(restored.mfaRegistry).toEqual(original.mfaRegistry)
  })

  it('accepts a bare array of domain entries', () => {
    const original = bundle()
    expect(readVaultBundle(original.savedAccounts).savedAccounts).toEqual(
      original.savedAccounts
    )
  })

  it('returns empty collections rather than throwing on junk', () => {
    for (const junk of [null, undefined, 42, 'not a backup', {}, { vault: 7 }]) {
      expect(readVaultBundle(junk)).toEqual({
        savedAccounts: [],
        oauthRegistry: [],
        mfaRegistry: []
      })
    }
  })

  it('ignores a non-array sitting where a collection belongs', () => {
    // A malformed file used to reach `.forEach` on an object and crash the
    // import preview instead of reporting nothing to import.
    expect(
      readVaultBundle({ savedAccounts: { nope: true } }).savedAccounts
    ).toEqual([])
  })
})

describe('backupFilename', () => {
  it('dates the file so successive exports do not overwrite each other', () => {
    expect(backupFilename('loginlens_backup', '.llbak')).toMatch(
      /^loginlens_backup_\d{4}-\d{2}-\d{2}\.llbak$/
    )
  })
})

describe('convertVaultToCSV', () => {
  it('emits one row per account under the browser-import header', () => {
    const { savedAccounts } = bundle()
    const lines = convertVaultToCSV(savedAccounts).split('\n')
    const accountCount = savedAccounts.reduce(
      (n, d) => n + d.accounts.length,
      0
    )

    expect(lines[0]).toBe('name,url,username,password,note')
    expect(lines).toHaveLength(accountCount + 1)
  })

  it('quotes fields containing a comma so columns do not shift', () => {
    const csv = convertVaultToCSV([
      {
        domain: 'example.com',
        accounts: [
          {
            label: 'Work, personal',
            identities: ['a@example.com'],
            login_method: { type: 'password' }
          } as any
        ]
      } as any
    ])
    expect(csv.split('\n')[1]).toContain('"Work, personal"')
  })
})

describe('escapeCSV', () => {
  // The export wizard builds a second, wider CSV of its own and shares this
  // helper. It used to wrap every cell in quotes while doubling the quotes in
  // only one column, which produced rows no parser could read back.
  it('leaves an ordinary value unquoted', () => {
    expect(escapeCSV('example.com')).toBe('example.com')
  })

  it('doubles an embedded quote and wraps the field', () => {
    expect(escapeCSV('My "work" account')).toBe('"My ""work"" account"')
  })

  it('wraps a value containing a newline, so the row survives it', () => {
    expect(escapeCSV('line one\nline two')).toBe('"line one\nline two"')
  })

  it('renders an absent value as an empty field, not "undefined"', () => {
    expect(escapeCSV(undefined)).toBe('')
  })
})
