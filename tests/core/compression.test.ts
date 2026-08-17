import { describe, expect, it } from 'vitest'
import {
  compressData,
  decompressData,
  expandVaultFromSync,
  getCompressedSize,
  minimizeVaultForSync
} from '~/core/utils/compression'
import {
  FIXTURE_MFA_REGISTRY,
  FIXTURE_OAUTH_REGISTRY,
  FIXTURE_SAVED_ACCOUNTS,
  SCHEMA_KEYS,
  makeFixtureVault
} from '../helpers/vault-fixture'

describe('sync minification round-trip', () => {
  it('restores the vault unchanged', () => {
    const vault = makeFixtureVault()
    const restored = decompressData(compressData(vault))

    expect(restored).not.toBeNull()
    expect(restored!.savedAccounts).toEqual(vault.savedAccounts)
    expect(restored!.oauthRegistry).toEqual(vault.oauthRegistry)
    expect(restored!.mfaRegistry).toEqual(vault.mfaRegistry)
  })

  it('survives being round-tripped twice', () => {
    const vault = makeFixtureVault()
    const once = decompressData(compressData(vault))!
    const twice = decompressData(compressData(once))!
    expect(twice).toEqual(once)
  })

  // The fixture is the coverage guarantee. If a schema field is added but not
  // exercised here, the round-trip test above would still pass while silently
  // proving nothing about the new field.
  it('exercises every field the schema defines', () => {
    const allAccounts = FIXTURE_SAVED_ACCOUNTS.flatMap((d) => d.accounts)

    for (const key of SCHEMA_KEYS.identityProfile) {
      expect(
        allAccounts.some((a) => (a as any)[key] !== undefined),
        `no fixture account sets IdentityProfile.${key}`
      ).toBe(true)
    }
    for (const key of SCHEMA_KEYS.domainEntry) {
      expect(
        FIXTURE_SAVED_ACCOUNTS.some((d) => (d as any)[key] !== undefined),
        `no fixture domain sets DomainEntry.${key}`
      ).toBe(true)
    }
    for (const key of SCHEMA_KEYS.oauthAccount) {
      expect(
        FIXTURE_OAUTH_REGISTRY.some((r) => (r as any)[key] !== undefined),
        `no fixture entry sets GlobalOAuthAccount.${key}`
      ).toBe(true)
    }
    for (const key of SCHEMA_KEYS.mfaAuthenticator) {
      expect(
        FIXTURE_MFA_REGISTRY.some((m) => (m as any)[key] !== undefined),
        `no fixture entry sets GlobalMFAAuthenticator.${key}`
      ).toBe(true)
    }
  })
})

describe('booleans the user explicitly set to false', () => {
  const vault = makeFixtureVault()
  const restored = decompressData(compressData(vault))!
  const bot = restored.savedAccounts
    .find((d) => d.domain === 'github.com')!
    .accounts.find((a) => a.id === 'acc-github-bot')!

  it('keeps pinned:false distinct from "never pinned"', () => {
    expect(bot.pinned).toBe(false)
  })

  it('keeps auto_pinned:false, so sync does not re-arm auto-pinning', () => {
    expect(bot.auto_pinned).toBe(false)
  })

  it('keeps reuse_flag:false', () => {
    expect(bot.reuse_flag).toBe(false)
  })

  it('keeps a password_reuse_count of exactly 0', () => {
    expect(bot.password_reuse_count).toBe(0)
  })

  it('keeps is_manual:false on OAuth registry entries', () => {
    const captured = restored.oauthRegistry.find(
      (r) => r.id === 'oauth-github-captured'
    )!
    expect(captured.is_manual).toBe(false)
  })
})

describe('fields that must stay absent', () => {
  const restored = decompressData(compressData(makeFixtureVault()))!

  it('leaves an unset domain_type undefined rather than guessing', () => {
    const untyped = restored.savedAccounts.find(
      (d) => d.domain === 'untyped.example'
    )!
    expect(untyped.domain_type).toBeUndefined()
  })

  it('leaves an unclassified oauth_purpose undefined', () => {
    // 'login' is a decision; undefined means the user never made one.
    const minimal = restored.savedAccounts
      .find((d) => d.domain === 'com.example.mobileapp')!
      .accounts.find((a) => a.id === 'acc-app-min')!
    expect(minimal.oauth_purpose).toBeUndefined()
    expect(minimal.pinned).toBeUndefined()
    expect(minimal.auto_pinned).toBeUndefined()
  })

  it('distinguishes oauth_purpose "login" from unset', () => {
    const oauth = restored.savedAccounts
      .find((d) => d.domain === 'com.example.mobileapp')!
      .accounts.find((a) => a.id === 'acc-app-oauth')!
    expect(oauth.oauth_purpose).toBe('login')
  })
})

describe('the MFA registry', () => {
  it('is carried through sync', () => {
    const restored = decompressData(compressData(makeFixtureVault()))!
    expect(restored.mfaRegistry).toHaveLength(FIXTURE_MFA_REGISTRY.length)
    expect(restored.mfaRegistry).toEqual(FIXTURE_MFA_REGISTRY)
  })

  it('is present in the minified payload under its own key', () => {
    const minified = minimizeVaultForSync(makeFixtureVault())
    expect(minified.f).toHaveLength(FIXTURE_MFA_REGISTRY.length)
  })
})

describe('login method encoding', () => {
  it('round-trips every LoginMethodType', () => {
    const restored = decompressData(compressData(makeFixtureVault()))!
    const types = restored.savedAccounts
      .flatMap((d) => d.accounts)
      .map((a) => a.login_method.type)
    expect(new Set(types)).toEqual(
      new Set(['password', 'oauth', 'passkey', 'api-key'])
    )
  })
})

describe('degenerate input', () => {
  it('minifies null to an empty payload', () => {
    expect(minimizeVaultForSync(null)).toEqual({ s: [], o: [], f: [] })
  })

  it('expands null to an empty vault', () => {
    expect(expandVaultFromSync(null)).toEqual({
      savedAccounts: [],
      oauthRegistry: [],
      mfaRegistry: []
    })
  })

  it('accepts a bare array of domains', () => {
    const minified = minimizeVaultForSync(FIXTURE_SAVED_ACCOUNTS)
    expect(minified.s).toHaveLength(FIXTURE_SAVED_ACCOUNTS.length)
    expect(minified.o).toEqual([])
    expect(minified.f).toEqual([])
  })

  it('passes through a legacy unminified payload', () => {
    const legacy = {
      savedAccounts: FIXTURE_SAVED_ACCOUNTS,
      oauth_registry: FIXTURE_OAUTH_REGISTRY,
      mfa_registry: FIXTURE_MFA_REGISTRY
    }
    const expanded = expandVaultFromSync(legacy)
    expect(expanded.savedAccounts).toEqual(FIXTURE_SAVED_ACCOUNTS)
    expect(expanded.oauthRegistry).toEqual(FIXTURE_OAUTH_REGISTRY)
    expect(expanded.mfaRegistry).toEqual(FIXTURE_MFA_REGISTRY)
  })

  it('returns null for an empty or corrupt string', () => {
    expect(decompressData('')).toBeNull()
    expect(decompressData('not-valid-lz-string')).toBeNull()
  })

  it('reports zero size for no data', () => {
    expect(getCompressedSize(null)).toBe(0)
  })
})

describe('passwordFingerprintKey token (`fk`)', () => {
  const KEY = 'Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZmdoaWo='

  it('round-trips through the minified form', () => {
    const vault = { ...makeFixtureVault(), passwordFingerprintKey: KEY }
    expect(decompressData(compressData(vault))!.passwordFingerprintKey).toBe(KEY)
  })

  it('uses the registered token and no other', () => {
    // SYNC_SCHEMA_TOKENS.md is the registry; a silent rename here would break
    // every payload already uploaded.
    const minified = minimizeVaultForSync({
      ...makeFixtureVault(),
      passwordFingerprintKey: KEY
    })
    expect(minified.fk).toBe(KEY)
  })

  it('is absent rather than empty when there is no key', () => {
    const minified = minimizeVaultForSync(makeFixtureVault())
    expect('fk' in minified).toBe(false)
    expect(
      decompressData(compressData(makeFixtureVault()))!.passwordFingerprintKey
    ).toBeUndefined()
  })

  it('survives the legacy unminified shape', () => {
    const expanded = expandVaultFromSync({
      saved_accounts: FIXTURE_SAVED_ACCOUNTS,
      passwordFingerprintKey: KEY
    })
    expect(expanded.passwordFingerprintKey).toBe(KEY)
  })
})

describe('compression actually compresses', () => {
  it('produces a payload smaller than the raw JSON', () => {
    const vault = makeFixtureVault()
    const raw = new TextEncoder().encode(JSON.stringify(vault)).length
    expect(getCompressedSize(vault)).toBeLessThan(raw)
  })
})
