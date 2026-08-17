import type {
  DomainEntry,
  GlobalMFAAuthenticator,
  GlobalOAuthAccount
} from '~/core/storage/schema'

/**
 * A vault that exercises **every** field in `core/storage/schema.ts`.
 *
 * This is the fixture referenced by the contract in `core/utils/compression.ts`:
 * adding a schema field means adding it to the minifier, the expander, and here.
 * The round-trip test walks the schema key-by-key, so a field left out of this
 * fixture is a field nothing proves survives sync.
 *
 * It also pins down the cases that used to be silently lost: booleans the user
 * explicitly set to `false`, a `password_reuse_count` of exactly 0, and an
 * `oauth_purpose` of `'login'` (which is not the same as "never classified").
 */

export const FIXTURE_SAVED_ACCOUNTS: DomainEntry[] = [
  {
    domain: 'github.com',
    domain_notes: 'Primary code host. Two identities, one of them a bot.',
    domain_type: 'website',
    accounts: [
      {
        // Fully populated password account.
        id: 'acc-github-main',
        label: 'Work',
        identities: ['dev@example.com', 'dev-alt@example.com'],
        login_method: {
          type: 'password',
          provider: 'github.com',
          vault_location: '1Password / Work vault'
        },
        oauth_purpose: 'login',
        integration_scope: 'Code Repository Access',
        vault_source: 'Google Password Manager',
        mfa: {
          type: 'hardware_key',
          device_location: 'YubiKey 5C NFC on keyring',
          authenticator_id: 'mfa-yubikey',
          linked_account: 'dev@example.com'
        },
        two_factor_location: 'YubiKey (legacy field)',
        notes: 'Rotate the recovery codes every January.',
        password_hash: 'fp_5f4dcc3b5aa765d61d8327deb882cf99',
        pinned: true,
        auto_pinned: false,
        password_reuse_count: 3,
        reuse_flag: true,
        updated_at: 1_760_000_000_000,
        api_title: 'GitHub Actions PAT',
        api_endpoint: 'https://api.github.com',
        key_scope: 'repo:read, workflow',
        api_key: 'ghp_exampleTokenValueOnlyForTests',
        linked_domains: ['gist.github.com', 'githubusercontent.com'],
        dismissed_mirrors: ['github.io'],
        intra_domain_aliases: ['acc-github-bot'],
        dismissed_aliases: ['acc-github-old']
      },
      {
        // The false-boolean case. Every one of these used to round-trip back to
        // `undefined`, which re-armed auto-pinning and cleared reuse flags.
        id: 'acc-github-bot',
        label: 'Account',
        identities: ['ci-bot@example.com'],
        login_method: { type: 'api-key' },
        oauth_purpose: 'integration',
        pinned: false,
        auto_pinned: false,
        password_reuse_count: 0,
        reuse_flag: false,
        updated_at: 1_760_000_100_000
      }
    ]
  },
  {
    domain: 'com.example.mobileapp',
    domain_type: 'app',
    accounts: [
      {
        // Minimal account — nothing optional set.
        id: 'acc-app-min',
        label: 'Account',
        identities: [],
        login_method: { type: 'password' },
        updated_at: 1_760_000_200_000
      },
      {
        id: 'acc-app-oauth',
        label: 'Personal',
        identities: ['me@gmail.com'],
        login_method: { type: 'oauth', provider: 'google.com' },
        oauth_purpose: 'login',
        mfa: {
          type: 'prompt',
          device_location: 'Google prompt on Pixel 9'
        },
        auto_pinned: true,
        updated_at: 1_760_000_300_000
      },
      {
        id: 'acc-app-passkey',
        label: 'Passkey',
        identities: ['me@icloud.com'],
        login_method: { type: 'passkey', vault_location: 'iCloud Keychain' },
        updated_at: 1_760_000_400_000
      }
    ]
  },
  {
    // Domain with no explicit type — must stay undefined, not default to one.
    domain: 'untyped.example',
    accounts: []
  }
]

export const FIXTURE_OAUTH_REGISTRY: GlobalOAuthAccount[] = [
  {
    id: 'oauth-google-personal',
    provider: 'google.com',
    identity: 'me@gmail.com',
    linked_websites: ['dash.cloudflare.com', 'roadmap.sh'],
    notes: 'Personal Google account.',
    is_manual: true,
    created_at: 1_759_000_000_000,
    updated_at: 1_760_000_000_000
  },
  {
    // is_manual explicitly false — a captured, not hand-entered, provider.
    id: 'oauth-github-captured',
    provider: 'github.com',
    identity: 'dev@example.com',
    is_manual: false,
    created_at: 1_759_000_100_000,
    updated_at: 1_760_000_100_000
  }
]

export const FIXTURE_MFA_REGISTRY: GlobalMFAAuthenticator[] = [
  {
    id: 'mfa-yubikey',
    name: 'YubiKey 5C NFC',
    type: 'hardware_key',
    provider: 'Yubico',
    linked_account: 'dev@example.com',
    notes: 'On the keyring. Backup key is in the safe.',
    created_at: 1_758_000_000_000,
    updated_at: 1_760_000_000_000
  },
  {
    id: 'mfa-totp',
    name: 'Personal Google Authenticator',
    type: 'totp_app',
    created_at: 1_758_000_100_000,
    updated_at: 1_760_000_100_000
  }
]

export function makeFixtureVault() {
  return {
    savedAccounts: structuredClone(FIXTURE_SAVED_ACCOUNTS),
    oauthRegistry: structuredClone(FIXTURE_OAUTH_REGISTRY),
    mfaRegistry: structuredClone(FIXTURE_MFA_REGISTRY)
  }
}

/**
 * Every optional key the schema defines, per top-level type. The round-trip
 * test asserts the fixture actually populates each one, so the fixture cannot
 * quietly drift behind the schema.
 */
export const SCHEMA_KEYS = {
  identityProfile: [
    'id',
    'label',
    'identities',
    'login_method',
    'oauth_purpose',
    'integration_scope',
    'vault_source',
    'mfa',
    'two_factor_location',
    'notes',
    'password_hash',
    'pinned',
    'auto_pinned',
    'password_reuse_count',
    'reuse_flag',
    'updated_at',
    'api_title',
    'api_endpoint',
    'key_scope',
    'api_key',
    'linked_domains',
    'dismissed_mirrors',
    'intra_domain_aliases',
    'dismissed_aliases'
  ],
  domainEntry: ['domain', 'domain_notes', 'domain_type', 'accounts'],
  oauthAccount: [
    'id',
    'provider',
    'identity',
    'linked_websites',
    'notes',
    'is_manual',
    'created_at',
    'updated_at'
  ],
  mfaAuthenticator: [
    'id',
    'name',
    'type',
    'provider',
    'linked_account',
    'notes',
    'created_at',
    'updated_at'
  ]
} as const
