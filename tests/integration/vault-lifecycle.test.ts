import { beforeEach, describe, expect, it } from 'vitest'

import { nativeStorage } from '~/core/storage/native'
import { createSnapshot, restoreSnapshot } from '~/core/storage/snapshots'
import type { DomainEntry } from '~/core/storage/schema'
import { syncBidirectionalDomainLinks } from '~/core/utils/domain'
import { decryptData } from '~/core/utils/encryption'
import {
  buildEncryptedBackup,
  buildJsonBackup,
  readVaultBundle
} from '~/core/utils/export'
import { parseEdgePasswordsCSV } from '~/core/utils/csv-parser'
import {
  analyzePasswordHashes,
  calculateSecurityRisks
} from '~/core/utils/password-inference'
import {
  fingerprintPassword,
  getRawFingerprintKey,
  getWeakFingerprints,
  resetFingerprintCache,
  setRawFingerprintKey
} from '~/core/utils/password-fingerprint'

// Unit tests cover each module against its own contract. These cover the seams
// between them — the places where two modules each behave correctly but disagree
// about the shape or the meaning of what they hand over. Every bug this file has
// caught lived in a seam, not in a function.

const PASSPHRASE = 'correct horse battery staple'

/** A Chrome/Edge password export, including the awkward rows. */
const CSV = `name,url,username,password
GitHub,https://github.com/login,dev@example.com,Reused-P4ss!
Shopping,https://shop.example.net/signin,dev@example.com,Reused-P4ss!
Bank,https://bank.example.org/,dev@example.com,Unique-B4nk-Pass!
Weak,https://forum.example.io/,dev@example.com,letmein
Mirror A,https://9anime.to/,dev@example.com,Mirror-P4ss!
Mirror B,https://9anime.id/,dev@example.com,Mirror-P4ss!`

/**
 * Runs the CSV through the importer and then does what the import modal does
 * next: fingerprint every password so reuse analysis has something to compare.
 */
async function importCsv(csv = CSV): Promise<DomainEntry[]> {
  const { validDomains } = await parseEdgePasswordsCSV(csv)

  for (const entry of validDomains) {
    for (const account of entry.accounts) {
      const plaintext = (account as any).password
      if (typeof plaintext === 'string' && plaintext) {
        account.password_hash = await fingerprintPassword(plaintext)
      }
      // The plaintext never reaches storage — only the keyed fingerprint does.
      delete (account as any).password
    }
  }

  return validDomains
}

beforeEach(() => {
  resetFingerprintCache()
})

describe('first run: import a browser export', () => {
  it('lands every row in the vault under its own domain', async () => {
    const vault = await importCsv()

    expect(vault.map((d) => d.domain).sort()).toEqual([
      '9anime.id',
      '9anime.to',
      'bank.example.org',
      'forum.example.io',
      'github.com',
      'shop.example.net'
    ])
  })

  it('stores no plaintext password anywhere in the vault', async () => {
    // The single most important property in the product. Asserted against the
    // serialised vault so a password nested at any depth would still be caught.
    //
    // The weak fixture is "letmein" rather than "password" so the assertion
    // cannot be satisfied — or defeated — by the `password_hash` field name.
    const vault = await importCsv()
    await nativeStorage.set('saved_accounts', vault)

    const onDisk = JSON.stringify(await nativeStorage.get('saved_accounts'))

    for (const secret of [
      'Reused-P4ss!',
      'Unique-B4nk-Pass!',
      'Mirror-P4ss!',
      'letmein'
    ]) {
      expect(onDisk).not.toContain(secret)
    }
  })

  it('gives identical passwords identical fingerprints and nothing else', async () => {
    const vault = await importCsv()
    const hashOf = (domain: string) =>
      vault.find((d) => d.domain === domain)!.accounts[0].password_hash

    expect(hashOf('github.com')).toBe(hashOf('shop.example.net'))
    expect(hashOf('github.com')).not.toBe(hashOf('bank.example.org'))
  })
})

describe('first run: what the security review reports', () => {
  it('flags the genuinely reused password', async () => {
    const vault = await importCsv()
    const weak = await getWeakFingerprints()

    const { reuseGroups } = analyzePasswordHashes(vault, weak)
    const domainsFlagged = reuseGroups.flatMap((g) => g.accounts.map((a) => a.domain))

    expect(domainsFlagged).toEqual(
      expect.arrayContaining(['github.com', 'shop.example.net'])
    )
  })

  it('flags the weak password even though it is used only once', async () => {
    // This is the seam that was broken: the weak set is computed asynchronously
    // under the fingerprint key, and analysis is synchronous. If the key each
    // side used differed, the sets could never intersect and this reported zero.
    const vault = await importCsv()
    const weak = await getWeakFingerprints()

    const { reuseGroups } = analyzePasswordHashes(vault, weak)
    const flagged = reuseGroups.flatMap((g) => g.accounts.map((a) => a.domain))

    expect(flagged).toContain('forum.example.io')
  })

  it('does not flag the bank, which has a unique strong password', async () => {
    const vault = await importCsv()
    const weak = await getWeakFingerprints()

    const { reuseGroups } = analyzePasswordHashes(vault, weak)
    const flagged = reuseGroups.flatMap((g) => g.accounts.map((a) => a.domain))

    expect(flagged).not.toContain('bank.example.org')
  })
})

describe('the user links two mirror domains', () => {
  it('stops reporting the mirror pair as reuse', async () => {
    const imported = await importCsv()

    // Before: the two mirrors look like two sites sharing one password.
    const before = analyzePasswordHashes(imported)
    expect(
      before.reuseGroups.some((g) =>
        g.accounts.some((a) => a.domain === '9anime.to')
      )
    ).toBe(true)

    // The user marks them as the same account. The linking helper is what the
    // UI calls; analysis has to agree with the link it writes.
    const linked = syncBidirectionalDomainLinks(
      imported.map((entry) =>
        entry.domain === '9anime.to'
          ? {
              ...entry,
              accounts: entry.accounts.map((a) => ({
                ...a,
                linked_domains: ['9anime.id']
              }))
            }
          : entry
      )
    )

    const after = analyzePasswordHashes(linked)
    expect(
      after.reuseGroups.some((g) => g.accounts.some((a) => a.domain === '9anime.to'))
    ).toBe(false)
  })

  it('leaves the unrelated reuse still flagged', async () => {
    // Resolving one finding must not quietly resolve the others.
    const imported = await importCsv()
    const linked = syncBidirectionalDomainLinks(
      imported.map((entry) =>
        entry.domain === '9anime.to'
          ? {
              ...entry,
              accounts: entry.accounts.map((a) => ({
                ...a,
                linked_domains: ['9anime.id']
              }))
            }
          : entry
      )
    )

    const after = analyzePasswordHashes(linked)
    const flagged = after.reuseGroups.flatMap((g) => g.accounts.map((a) => a.domain))

    expect(flagged).toEqual(expect.arrayContaining(['github.com', 'shop.example.net']))
    expect(calculateSecurityRisks(after)).toBeGreaterThan(0)
  })

  it('writes the link on both sides so either domain shows it', async () => {
    const imported = await importCsv()
    const linked = syncBidirectionalDomainLinks(
      imported.map((entry) =>
        entry.domain === '9anime.to'
          ? {
              ...entry,
              accounts: entry.accounts.map((a) => ({
                ...a,
                linked_domains: ['9anime.id']
              }))
            }
          : entry
      )
    )

    const other = linked.find((d) => d.domain === '9anime.id')!
    expect(other.accounts[0].linked_domains).toContain('9anime.to')
  })
})

describe('backup and restore on a new install', () => {
  it('round-trips the vault through an encrypted backup', async () => {
    const vault = await importCsv()
    const bundle = { savedAccounts: vault, oauthRegistry: [], mfaRegistry: [] }

    const backup = await buildEncryptedBackup(bundle, PASSPHRASE)
    const inner = JSON.parse(
      await decryptData(JSON.parse(backup).payload, PASSPHRASE)
    )

    expect(readVaultBundle(inner).savedAccounts).toEqual(vault)
  })

  it('keeps reuse detection working after restoring onto a fresh install', async () => {
    // The seam: `password_hash` is keyed, so the fingerprint key has to travel
    // with the backup. Without it a restored vault recomputes different
    // fingerprints and cheerfully reports every account as unique.
    const vault = await importCsv()
    const backup = await buildEncryptedBackup(
      { savedAccounts: vault, oauthRegistry: [], mfaRegistry: [] },
      PASSPHRASE
    )

    // A different machine: no vault, no key.
    await nativeStorage.remove('password_fingerprint_key')
    resetFingerprintCache()
    const freshKey = await getRawFingerprintKey()

    const inner = JSON.parse(
      await decryptData(JSON.parse(backup).payload, PASSPHRASE)
    )
    expect(inner.passwordFingerprintKey).toBeTypeOf('string')
    expect(inner.passwordFingerprintKey).not.toBe(freshKey)

    await setRawFingerprintKey(inner.passwordFingerprintKey)
    const restored = readVaultBundle(inner).savedAccounts

    // Weak detection has to survive too, and it is recomputed under the new key.
    const weak = await getWeakFingerprints()
    const flagged = analyzePasswordHashes(restored, weak).reuseGroups.flatMap((g) =>
      g.accounts.map((a) => a.domain)
    )

    expect(flagged).toEqual(
      expect.arrayContaining(['github.com', 'shop.example.net', 'forum.example.io'])
    )
  })

  it('never puts the fingerprint key in a plain JSON export', async () => {
    // The key is not a secret on its own, but paired with a leaked vault it
    // turns fingerprints into a confirm-the-guess oracle. It belongs only
    // inside the encrypted blob.
    const vault = await importCsv()
    await getRawFingerprintKey()

    const json = buildJsonBackup({
      savedAccounts: vault,
      oauthRegistry: [],
      mfaRegistry: []
    })

    expect(json).not.toContain('passwordFingerprintKey')
    expect(json).not.toContain(await getRawFingerprintKey())
  })

  it('refuses the wrong passphrase rather than returning a partial vault', async () => {
    const vault = await importCsv()
    const backup = await buildEncryptedBackup(
      { savedAccounts: vault, oauthRegistry: [], mfaRegistry: [] },
      PASSPHRASE
    )

    await expect(
      decryptData(JSON.parse(backup).payload, 'not the passphrase')
    ).rejects.toThrow()
  })
})

describe('snapshot and undo', () => {
  it('puts the vault back exactly as it was', async () => {
    const original = await importCsv()
    await nativeStorage.set('saved_accounts', original)
    await nativeStorage.set('oauth_registry', [])
    await nativeStorage.set('mfa_registry', [])

    const snapshot = await createSnapshot('manual')
    expect(snapshot).not.toBeNull()

    // The destructive step a restore point exists to undo.
    await nativeStorage.set('saved_accounts', [])
    expect(await nativeStorage.get<DomainEntry[]>('saved_accounts')).toEqual([])

    await restoreSnapshot(snapshot!)

    expect(await nativeStorage.get<DomainEntry[]>('saved_accounts')).toEqual(original)
  })

  it('restores a vault that still reports the same findings', async () => {
    // Round-tripping the data is not enough — the fingerprints have to survive
    // serialisation intact or the security review comes back empty.
    const original = await importCsv()
    await nativeStorage.set('saved_accounts', original)
    await nativeStorage.set('oauth_registry', [])
    await nativeStorage.set('mfa_registry', [])

    const weak = await getWeakFingerprints()
    const before = calculateSecurityRisks(analyzePasswordHashes(original, weak))

    const snapshot = await createSnapshot('manual')
    await nativeStorage.set('saved_accounts', [])
    await restoreSnapshot(snapshot!)

    const restored = await nativeStorage.get<DomainEntry[]>('saved_accounts')
    expect(calculateSecurityRisks(analyzePasswordHashes(restored!, weak))).toBe(before)
  })
})

describe('a hostile or damaged backup file', () => {
  it('imports as an empty vault rather than throwing', async () => {
    expect(readVaultBundle({ nonsense: true })).toEqual({
      savedAccounts: [],
      oauthRegistry: [],
      mfaRegistry: []
    })
  })

  it('survives null and undefined', () => {
    expect(readVaultBundle(null).savedAccounts).toEqual([])
    expect(readVaultBundle(undefined).savedAccounts).toEqual([])
  })

  it('does not mistake a string for a collection', () => {
    expect(readVaultBundle({ savedAccounts: 'oops' }).savedAccounts).toEqual([])
  })

  it('reads a backup that nests the collections under vault', async () => {
    const vault = await importCsv()
    const parsed = JSON.parse(
      buildJsonBackup({ savedAccounts: vault, oauthRegistry: [], mfaRegistry: [] })
    )

    expect(readVaultBundle(parsed).savedAccounts).toEqual(vault)
  })
})
