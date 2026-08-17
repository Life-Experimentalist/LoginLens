import LZString from 'lz-string'
import type {
  DomainEntry,
  IdentityProfile,
  GlobalOAuthAccount,
  GlobalMFAAuthenticator,
  LoginMethodType
} from '../storage/schema'

/**
 * Compact minified representation for cloud sync.
 *
 * Verbose JSON keys are replaced with short tokens so the vault fits inside
 * the browser's 100KB sync quota. The mapping is exact in both directions —
 * every field defined in `storage/schema.ts` has a token here, and
 * `expandVaultFromSync` restores it unchanged. The round-trip is covered by
 * tests; if you add a schema field, add it in three places: the minifier, the
 * expander, and the fixture.
 *
 * Note that booleans which the user can explicitly set to `false` (pinned,
 * auto_pinned) are encoded as 0/1 rather than being omitted when falsy —
 * omitting them would turn "the user unpinned this" back into "never decided",
 * which silently re-enables auto-pinning on the next sync.
 */
export function minimizeVaultForSync(data: any): any {
  if (!data) return { s: [], o: [], f: [] }

  const savedAccountsList = Array.isArray(data)
    ? data
    : data.savedAccounts || data.saved_accounts || []
  const oauthRegistryList = Array.isArray(data)
    ? []
    : data.oauthRegistry || data.oauth_registry || []
  const mfaRegistryList: GlobalMFAAuthenticator[] = Array.isArray(data)
    ? []
    : data.mfaRegistry || data.mfa_registry || []

  const saved = savedAccountsList.map((d: DomainEntry) => {
    const dObj: any = { d: d.domain }
    if (d.domain_type === 'app') dObj.t = 1
    else if (d.domain_type === 'website') dObj.t = 2
    if (d.domain_notes) dObj.n = d.domain_notes

    dObj.a = (d.accounts || []).map((a: IdentityProfile) => {
      const aObj: any = {
        i: a.id,
        u: a.identities
      }
      if (a.label && a.label !== 'Account') aObj.l = a.label
      if (a.login_method?.type && a.login_method.type !== 'password') {
        aObj.m = a.login_method.type === 'oauth' ? 1 : a.login_method.type === 'passkey' ? 2 : 3
      }
      if (a.login_method?.provider) aObj.p = a.login_method.provider
      if (a.login_method?.vault_location) aObj.vl = a.login_method.vault_location
      // 1 = integration, 0 = an explicit 'login'. Absent means the field was
      // never set, which is not the same thing and must stay absent.
      if (a.oauth_purpose === 'integration') aObj.op = 1
      else if (a.oauth_purpose === 'login') aObj.op = 0
      if (a.integration_scope) aObj.sc = a.integration_scope
      if (a.vault_source) aObj.vs = a.vault_source
      if (a.mfa) {
        const mfaObj: any = {
          t: a.mfa.type,
          dl: a.mfa.device_location
        }
        if (a.mfa.authenticator_id) mfaObj.ai = a.mfa.authenticator_id
        if (a.mfa.linked_account) mfaObj.la = a.mfa.linked_account
        aObj.mfa = mfaObj
      }
      if (a.two_factor_location) aObj.tf = a.two_factor_location
      if (a.notes) aObj.nt = a.notes
      if (a.password_hash) aObj.ph = a.password_hash
      if (a.pinned !== undefined) aObj.pn = a.pinned ? 1 : 0
      if (a.auto_pinned !== undefined) aObj.ap = a.auto_pinned ? 1 : 0
      if (a.password_reuse_count !== undefined) aObj.rc = a.password_reuse_count
      if (a.reuse_flag !== undefined) aObj.rf = a.reuse_flag ? 1 : 0
      if (a.updated_at) aObj.ut = a.updated_at
      if (a.api_title) aObj.at = a.api_title
      if (a.api_endpoint) aObj.ae = a.api_endpoint
      if (a.key_scope) aObj.ks = a.key_scope
      if (a.api_key) aObj.ak = a.api_key
      if (a.linked_domains?.length) aObj.ld = a.linked_domains
      if (a.dismissed_mirrors?.length) aObj.dm = a.dismissed_mirrors
      if (a.intra_domain_aliases?.length) aObj.ia = a.intra_domain_aliases
      if (a.dismissed_aliases?.length) aObj.da = a.dismissed_aliases

      return aObj
    })

    return dObj
  })

  const oauth = oauthRegistryList.map((r: GlobalOAuthAccount) => {
    const oObj: any = {
      i: r.id,
      p: r.provider,
      u: r.identity
    }
    if (r.linked_websites?.length) oObj.w = r.linked_websites
    if (r.notes) oObj.n = r.notes
    if (r.is_manual !== undefined) oObj.m = r.is_manual ? 1 : 0
    if (r.created_at) oObj.ct = r.created_at
    if (r.updated_at) oObj.ut = r.updated_at
    return oObj
  })

  // The MFA registry used to be dropped here, so every authenticator the user
  // had recorded vanished the moment a vault round-tripped through sync.
  const mfa = mfaRegistryList.map((m: GlobalMFAAuthenticator) => {
    const mObj: any = { i: m.id, n: m.name, t: m.type }
    if (m.provider) mObj.p = m.provider
    if (m.linked_account) mObj.la = m.linked_account
    if (m.notes) mObj.nt = m.notes
    if (m.created_at) mObj.ct = m.created_at
    if (m.updated_at) mObj.ut = m.updated_at
    return mObj
  })

  const out: any = { s: saved, o: oauth, f: mfa }

  // The reuse-detection HMAC key. Fingerprints (`ph`) are meaningless to a
  // device holding a different key, so syncing them without it made the second
  // device report every account as unique — a wrong answer, not a missing one.
  // Safe to include only because the whole payload is AES-256-GCM encrypted
  // under the user's sync passphrase before it is uploaded.
  if (data.passwordFingerprintKey) out.fk = data.passwordFingerprintKey

  return out
}

export interface ExpandedVault {
  savedAccounts: DomainEntry[]
  oauthRegistry: GlobalOAuthAccount[]
  mfaRegistry: GlobalMFAAuthenticator[]
  /** Absent in payloads written before the key was synced. */
  passwordFingerprintKey?: string
}

/**
 * Inverse of `minimizeVaultForSync`. Every token it writes is read back here.
 */
export function expandVaultFromSync(minified: any): ExpandedVault {
  if (!minified) return { savedAccounts: [], oauthRegistry: [], mfaRegistry: [] }

  // Fallback if data was already in legacy unminified format
  if (minified.savedAccounts || minified.saved_accounts) {
    return {
      savedAccounts: minified.savedAccounts || minified.saved_accounts || [],
      oauthRegistry: minified.oauthRegistry || minified.oauth_registry || [],
      mfaRegistry: minified.mfaRegistry || minified.mfa_registry || [],
      passwordFingerprintKey: minified.passwordFingerprintKey
    }
  }

  const methodTypeMap: Record<number, LoginMethodType> = {
    0: 'password',
    1: 'oauth',
    2: 'passkey',
    3: 'api-key'
  }

  const savedAccounts: DomainEntry[] = (minified.s || []).map((d: any) => ({
    domain: d.d,
    domain_type: d.t === 1 ? 'app' : d.t === 2 ? 'website' : undefined,
    domain_notes: d.n,
    accounts: (d.a || []).map((a: any) => ({
      id: a.i || Math.random().toString(36).substring(2),
      label: a.l || 'Account',
      identities: a.u || [],
      login_method: {
        type: methodTypeMap[a.m] || 'password',
        provider: a.p,
        vault_location: a.vl
      },
      oauth_purpose:
        a.op === undefined ? undefined : a.op === 1 ? 'integration' : 'login',
      integration_scope: a.sc,
      vault_source: a.vs,
      mfa: a.mfa ? {
        type: a.mfa.t || 'unknown',
        device_location: a.mfa.dl || '',
        authenticator_id: a.mfa.ai,
        linked_account: a.mfa.la
      } : undefined,
      two_factor_location: a.tf,
      notes: a.nt,
      password_hash: a.ph,
      pinned: a.pn !== undefined ? a.pn === 1 : undefined,
      auto_pinned: a.ap !== undefined ? a.ap === 1 : undefined,
      password_reuse_count: a.rc,
      reuse_flag: a.rf !== undefined ? a.rf === 1 : undefined,
      updated_at: a.ut || Date.now(),
      api_title: a.at,
      api_endpoint: a.ae,
      key_scope: a.ks,
      api_key: a.ak,
      linked_domains: a.ld,
      dismissed_mirrors: a.dm,
      intra_domain_aliases: a.ia,
      dismissed_aliases: a.da
    }))
  }))

  const oauthRegistry: GlobalOAuthAccount[] = (minified.o || []).map((r: any) => ({
    id: r.i || Math.random().toString(36).substring(2),
    provider: r.p,
    identity: r.u,
    linked_websites: r.w,
    notes: r.n,
    is_manual: r.m !== undefined ? r.m === 1 : undefined,
    created_at: r.ct || Date.now(),
    updated_at: r.ut || Date.now()
  }))

  const mfaRegistry: GlobalMFAAuthenticator[] = (minified.f || []).map((m: any) => ({
    id: m.i || Math.random().toString(36).substring(2),
    name: m.n,
    type: m.t,
    provider: m.p,
    linked_account: m.la,
    notes: m.nt,
    created_at: m.ct || Date.now(),
    updated_at: m.ut || Date.now()
  }))

  return {
    savedAccounts,
    oauthRegistry,
    mfaRegistry,
    passwordFingerprintKey: minified.fk
  }
}

export function compressData(data: any): string {
  if (!data) return ''
  const minified = minimizeVaultForSync(data)
  const json = JSON.stringify(minified)
  return LZString.compressToBase64(json)
}

export function decompressData(base64: string): ExpandedVault | null {
  if (!base64) return null
  const json = LZString.decompressFromBase64(base64)
  if (!json) return null
  try {
    const raw = JSON.parse(json)
    return expandVaultFromSync(raw)
  } catch (e) {
    console.error('Failed to parse decompressed data', e)
    return null
  }
}

export function getCompressedSize(data: any): number {
  if (!data) return 0
  return new TextEncoder().encode(compressData(data)).length
}
