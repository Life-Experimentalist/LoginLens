import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSnapshot,
  getSnapshots,
  deleteSnapshot,
  restoreSnapshot,
  type VaultSnapshot
} from '~/core/storage/snapshots'
import { nativeStorage } from '~/core/storage/native'
import {
  FIXTURE_MFA_REGISTRY,
  FIXTURE_OAUTH_REGISTRY,
  FIXTURE_SAVED_ACCOUNTS,
  makeFixtureVault
} from '../helpers/vault-fixture'
import type { DomainEntry, GlobalMFAAuthenticator } from '~/core/storage/schema'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const T0 = 1_760_000_000_000

/** Writes the fixture vault into storage as the live vault. */
async function seedVault() {
  const vault = makeFixtureVault()
  await nativeStorage.set('saved_accounts', vault.savedAccounts)
  await nativeStorage.set('oauth_registry', vault.oauthRegistry)
  await nativeStorage.set('mfa_registry', vault.mfaRegistry)
  return vault
}

let now = T0

beforeEach(() => {
  now = T0
  vi.spyOn(Date, 'now').mockImplementation(() => now)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createSnapshot', () => {
  it('captures all three collections, not just accounts and OAuth', async () => {
    // The MFA registry was declared in the snapshot type but never populated,
    // so restoring a snapshot silently dropped every authenticator the user
    // had recorded.
    await seedVault()
    const snap = await createSnapshot('manual')

    expect(snap).not.toBeNull()
    expect(snap!.data.savedAccounts).toEqual(FIXTURE_SAVED_ACCOUNTS)
    expect(snap!.data.oauthRegistry).toEqual(FIXTURE_OAUTH_REGISTRY)
    expect(snap!.data.mfaRegistry).toEqual(FIXTURE_MFA_REGISTRY)
  })

  it('records the counts the restore UI shows', async () => {
    await seedVault()
    const snap = await createSnapshot('manual')

    const expectedAccounts = FIXTURE_SAVED_ACCOUNTS.reduce(
      (sum, d) => sum + d.accounts.length,
      0
    )
    expect(snap!.accountCount).toBe(expectedAccounts)
    expect(snap!.domainCount).toBe(FIXTURE_SAVED_ACCOUNTS.length)
  })

  it('works on a vault that has never been written', async () => {
    const snap = await createSnapshot('manual')
    expect(snap!.data.savedAccounts).toEqual([])
    expect(snap!.data.oauthRegistry).toEqual([])
    expect(snap!.data.mfaRegistry).toEqual([])
  })

  it('survives a corrupted key rather than throwing', async () => {
    await nativeStorage.set('saved_accounts', 'not an array')
    const snap = await createSnapshot('manual')
    expect(snap!.data.savedAccounts).toEqual([])
  })

  it('gives every snapshot a distinct id', async () => {
    await seedVault()
    const a = await createSnapshot('manual', 'one')
    now += 1000
    const b = await createSnapshot('manual', 'two')
    expect(a!.id).not.toBe(b!.id)
  })
})

describe('retention limits', () => {
  it('keeps at most 5 manual snapshots, dropping the oldest', async () => {
    await seedVault()
    for (let i = 0; i < 8; i++) {
      now += 1000
      await createSnapshot('manual', `manual-${i}`)
    }

    const manual = (await getSnapshots()).filter((s) => s.type === 'manual')
    expect(manual).toHaveLength(5)
    expect(manual.map((s) => s.label)).toEqual([
      'manual-7',
      'manual-6',
      'manual-5',
      'manual-4',
      'manual-3'
    ])
  })

  it('keeps at most 7 automatic snapshots', async () => {
    await seedVault()
    for (let i = 0; i < 12; i++) {
      now += 1000
      await createSnapshot('auto', `auto-${i}`)
    }

    const auto = (await getSnapshots()).filter((s) => s.type === 'auto')
    expect(auto).toHaveLength(7)
    expect(auto[0].label).toBe('auto-11')
  })

  it('caps scheduled snapshots so they cannot grow without bound', async () => {
    // "At most one a week" is not a bound. Uncapped, a long-lived install
    // accumulates a full copy of the vault per week, forever, in local storage.
    await seedVault()
    const accounts: DomainEntry[] = structuredClone(FIXTURE_SAVED_ACCOUNTS)

    for (let i = 0; i < 14; i++) {
      now += WEEK_MS
      // The vault has to actually change, or the scheduled snapshot is skipped.
      accounts.push({ domain: `week-${i}.example`, accounts: [] })
      await nativeStorage.set('saved_accounts', accounts)
      await createSnapshot('scheduled')
    }

    const scheduled = (await getSnapshots()).filter(
      (s) => s.type === 'scheduled'
    )
    expect(scheduled).toHaveLength(8)
  })

  it('keeps the three tiers independent', async () => {
    await seedVault()
    for (let i = 0; i < 6; i++) {
      now += 1000
      await createSnapshot('manual', `m${i}`)
      await createSnapshot('auto', `a${i}`)
    }

    const all = await getSnapshots()
    expect(all.filter((s) => s.type === 'manual')).toHaveLength(5)
    expect(all.filter((s) => s.type === 'auto')).toHaveLength(6)
  })

  it('returns them newest first', async () => {
    await seedVault()
    for (let i = 0; i < 4; i++) {
      now += 1000
      await createSnapshot('manual', `m${i}`)
    }

    const timestamps = (await getSnapshots()).map((s) => s.timestamp)
    expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a))
  })
})

describe('scheduled snapshots', () => {
  it('takes the first one unconditionally', async () => {
    await seedVault()
    expect(await createSnapshot('scheduled')).not.toBeNull()
  })

  it('skips when less than a week has passed', async () => {
    await seedVault()
    await createSnapshot('scheduled')

    now += WEEK_MS - 1
    await nativeStorage.set('saved_accounts', [
      ...FIXTURE_SAVED_ACCOUNTS,
      { domain: 'new.example', accounts: [] }
    ])

    expect(await createSnapshot('scheduled')).toBeNull()
  })

  it('skips when a week has passed but nothing changed', async () => {
    await seedVault()
    await createSnapshot('scheduled')

    now += WEEK_MS + 1
    expect(await createSnapshot('scheduled')).toBeNull()
  })

  it('takes one when a week has passed and the vault changed', async () => {
    await seedVault()
    await createSnapshot('scheduled')

    now += WEEK_MS + 1
    await nativeStorage.set('saved_accounts', [
      ...FIXTURE_SAVED_ACCOUNTS,
      { domain: 'new.example', accounts: [] }
    ])

    expect(await createSnapshot('scheduled')).not.toBeNull()
  })

  it('notices a week in which only the MFA registry changed', async () => {
    // The change checksum has to cover everything the snapshot stores. When it
    // only covered accounts and OAuth, a week spent reorganising authenticators
    // read as "nothing changed" and produced no restore point — precisely the
    // week the user would want one.
    await seedVault()
    await createSnapshot('scheduled')

    now += WEEK_MS + 1
    const extraAuthenticator: GlobalMFAAuthenticator = {
      id: 'mfa-new',
      name: 'Backup YubiKey',
      type: 'hardware_key',
      created_at: now,
      updated_at: now
    }
    await nativeStorage.set('mfa_registry', [
      ...FIXTURE_MFA_REGISTRY,
      extraAuthenticator
    ])

    const snap = await createSnapshot('scheduled')
    expect(snap).not.toBeNull()
    expect(snap!.data.mfaRegistry).toHaveLength(FIXTURE_MFA_REGISTRY.length + 1)
  })

  it('does not block manual snapshots on the weekly rule', async () => {
    await seedVault()
    await createSnapshot('scheduled')
    expect(await createSnapshot('manual')).not.toBeNull()
  })
})

describe('restoreSnapshot', () => {
  it('puts all three collections back', async () => {
    await seedVault()
    const snap = await createSnapshot('manual')

    await nativeStorage.set('saved_accounts', [])
    await nativeStorage.set('oauth_registry', [])
    await nativeStorage.set('mfa_registry', [])

    await restoreSnapshot(snap!)

    expect(await nativeStorage.get('saved_accounts')).toEqual(
      FIXTURE_SAVED_ACCOUNTS
    )
    expect(await nativeStorage.get('oauth_registry')).toEqual(
      FIXTURE_OAUTH_REGISTRY
    )
    expect(await nativeStorage.get('mfa_registry')).toEqual(FIXTURE_MFA_REGISTRY)
  })

  it('leaves current authenticators alone when restoring a pre-MFA snapshot', async () => {
    // A snapshot taken before the MFA registry existed has no mfaRegistry key.
    // Treating that as an empty list would wipe authenticators the user still
    // has — a restore that destroys data it never captured.
    await seedVault()

    const legacy: VaultSnapshot = {
      id: 'legacy',
      type: 'manual',
      label: 'Pre-MFA backup',
      timestamp: T0,
      accountCount: 0,
      domainCount: 0,
      checksum: 'x',
      data: {
        savedAccounts: [],
        oauthRegistry: []
      }
    }

    await restoreSnapshot(legacy)

    expect(await nativeStorage.get('mfa_registry')).toEqual(FIXTURE_MFA_REGISTRY)
    expect(await nativeStorage.get('saved_accounts')).toEqual([])
  })

  it('ignores a collection that is not an array instead of writing it', async () => {
    await seedVault()

    await restoreSnapshot({
      id: 'broken',
      type: 'manual',
      label: 'Hand-edited',
      timestamp: T0,
      accountCount: 0,
      domainCount: 0,
      checksum: 'x',
      data: { savedAccounts: 'oops' as any, oauthRegistry: [] }
    })

    expect(await nativeStorage.get('saved_accounts')).toEqual(
      FIXTURE_SAVED_ACCOUNTS
    )
  })

  describe('when a write fails partway through', () => {
    /**
     * The vault spans three storage keys and only one can be written at a time.
     * Letting a failure stand would leave accounts from the snapshot beside an
     * OAuth registry from the present — a state nothing downstream can reason
     * about, and one no later restore can distinguish from a real vault.
     */
    function failOnKey(key: string) {
      const real = nativeStorage.set
      return vi
        .spyOn(nativeStorage, 'set')
        .mockImplementation(async (k: string, v: unknown) => {
          if (k === key) throw new Error('QUOTA_BYTES quota exceeded.')
          return real(k, v)
        })
    }

    it('rethrows so the caller can report that nothing was restored', async () => {
      await seedVault()
      failOnKey('oauth_registry')

      await expect(
        restoreSnapshot({
          id: 's1',
          type: 'manual',
          label: 'Backup',
          timestamp: T0,
          accountCount: 0,
          domainCount: 0,
          checksum: 'x',
          data: { savedAccounts: [], oauthRegistry: [], mfaRegistry: [] }
        })
      ).rejects.toThrow(/quota/i)
    })

    it('rolls the already-written keys back to what they were', async () => {
      await seedVault()
      failOnKey('oauth_registry')

      await restoreSnapshot({
        id: 's1',
        type: 'manual',
        label: 'Backup',
        timestamp: T0,
        accountCount: 0,
        domainCount: 0,
        checksum: 'x',
        data: { savedAccounts: [], oauthRegistry: [], mfaRegistry: [] }
      }).catch(() => undefined)

      // saved_accounts was written before the failure; it must not stay empty.
      expect(await nativeStorage.get('saved_accounts')).toEqual(
        FIXTURE_SAVED_ACCOUNTS
      )
      expect(await nativeStorage.get('oauth_registry')).toEqual(
        FIXTURE_OAUTH_REGISTRY
      )
      expect(await nativeStorage.get('mfa_registry')).toEqual(
        FIXTURE_MFA_REGISTRY
      )
    })

    it('leaves keys the failure never reached untouched', async () => {
      await seedVault()
      failOnKey('saved_accounts')

      await restoreSnapshot({
        id: 's1',
        type: 'manual',
        label: 'Backup',
        timestamp: T0,
        accountCount: 0,
        domainCount: 0,
        checksum: 'x',
        data: { savedAccounts: [], oauthRegistry: [], mfaRegistry: [] }
      }).catch(() => undefined)

      expect(await nativeStorage.get('oauth_registry')).toEqual(
        FIXTURE_OAUTH_REGISTRY
      )
    })
  })
})

describe('deleteSnapshot', () => {
  it('removes only the one named', async () => {
    await seedVault()
    now += 1000
    const a = await createSnapshot('manual', 'keep')
    now += 1000
    const b = await createSnapshot('manual', 'drop')

    await deleteSnapshot(b!.id)

    const remaining = await getSnapshots()
    expect(remaining.map((s) => s.id)).toEqual([a!.id])
  })

  it('is a no-op for an id that is not there', async () => {
    await seedVault()
    await createSnapshot('manual')
    await deleteSnapshot('does-not-exist')
    expect(await getSnapshots()).toHaveLength(1)
  })
})

describe('getSnapshots', () => {
  it('returns an empty list rather than undefined on a fresh install', async () => {
    expect(await getSnapshots()).toEqual([])
  })

  it('returns an empty list when the stored value is not an array', async () => {
    await nativeStorage.set('vault_snapshots', { nope: true })
    expect(await getSnapshots()).toEqual([])
  })
})
