// ---------------------------------------------------------------------------
// Core Storage Schema — source of truth for all data structures in LoginLens
// ---------------------------------------------------------------------------

export type LoginMethodType = 'password' | 'oauth' | 'passkey' | 'api-key'

/**
 * A single saved identity profile for a website.
 */
export interface IdentityProfile {
  id: string
  label: string // Free-form tag: Work, Personal, Burner, etc.
  identities: string[] // usernames/emails
  login_method: {
    type: LoginMethodType
    provider?: string // e.g. "github.com" for OAuth
    vault_location?: string
  }
  /**
   * Classification for OAuth connections:
   * `'login'` = Primary authentication method used to sign into the account.
   * `'integration'` = Third-party data link / autofill / resource access (e.g. Resume import via LinkedIn, repo sync via GitHub).
   */
  oauth_purpose?: 'login' | 'integration'
  integration_scope?: string // e.g., "Resume Import / Profile Autofill", "Code Repository Access"
  vault_source?: string // Provenance tag: e.g., "Google Password Manager"
  mfa?: {
    type: 'totp_app' | 'hardware_key' | 'sms' | 'prompt' | 'passkey' | 'unknown'
    device_location: string // e.g. "Google Authenticator on iPhone", "YubiKey"
    /**
     * Optional link to a master GlobalMFAAuthenticator ID
     */
    authenticator_id?: string
    /**
     * For TOTP apps, the specific OAuth/Google/Microsoft account the authenticator
     * is registered to. e.g. "user@example.com" for Google Authenticator.
     */
    linked_account?: string
  }
  two_factor_location?: string // Legacy fallback
  notes?: string
  /**
   * Keyed fingerprint of the password (HMAC-SHA256 under a per-install random
   * key — see core/utils/password-fingerprint). Lets us detect reuse without
   * storing the password, and without producing a digest anyone could reverse
   * with a rainbow table. Never a bare hash.
   */
  password_hash?: string
  /**
   * Manual pin — user explicitly pinned this entry. Highest precedence.
   * Stored as `true` or `false` (never undefined after the user acts).
   */
  pinned?: boolean
  /**
   * Auto-pin — set automatically when this is the ONLY account for the domain.
   * Cleared when a second account is added and the user is prompted.
   * Manual pin (pinned: true) always wins over auto_pinned.
   */
  auto_pinned?: boolean
  /**
   * Password reuse flags — populated by the hash inference engine.
   * Counts how many other accounts share the same password_hash.
   * `reuse_flag` = true if the same hash is found on 2+ accounts.
   */
  password_reuse_count?: number
  reuse_flag?: boolean
  updated_at: number
  // API Key specific fields
  api_title?: string // Human-readable name for the key, e.g. "OpenAI Production Key"
  api_endpoint?: string // Base URL/endpoint this key is used with
  key_scope?: string // E.g., "Read-only", "Admin", "Billing"
  api_key?: string // Secret API key string stored in dedicated space

  /**
   * Cross-domain account linking.
   * Stores a list of domain names that share this exact same account identity/credentials.
   * Useful for dismissing password reuse warnings for legitimate multi-domain accounts (e.g., apple.com and icloud.com).
   */
  linked_domains?: string[]
  /**
   * List of domain names explicitly marked by the user as NOT being mirror domains of this account.
   */
  dismissed_mirrors?: string[]
  /**
   * List of account IDs within the same domain that are marked as aliases for this identity.
   */
  intra_domain_aliases?: string[]
  /**
   * List of account IDs within the same domain that are explicitly marked as DIFFERENT accounts (not aliases).
   */
  dismissed_aliases?: string[]
}

/**
 * A single domain entry in the vault — one per website.
 * Stored as an array: DomainEntry[] in chrome.storage.local under "saved_accounts".
 */
export interface DomainEntry {
  domain: string
  domain_notes?: string
  /**
   * Manual override for the domain type.
   * `undefined` = auto-detect (web domain vs app package ID heuristic)
   * `'app'` = user marked this as a mobile/desktop app
   * `'website'` = user marked this as a regular website (even if it looks like an app ID)
   */
  domain_type?: 'app' | 'website'
  accounts: IdentityProfile[]
}

// ---------------------------------------------------------------------------
// Legacy type alias — kept for backwards compatibility during migration.
// DomainMapping[] was previously used everywhere. DomainEntry[] is the new name.
// ---------------------------------------------------------------------------
export type DomainMapping = DomainEntry

/**
 * Global OAuth Registry Entry
 * Tracks centralized OAuth identities across the extension.
 * Stored as an array: GlobalOAuthAccount[] in chrome.storage.local under "oauth_registry".
 */
export interface GlobalOAuthAccount {
  id: string
  provider: string // e.g., "google.com", "github.com"
  identity: string // e.g., "user@gmail.com"
  linked_websites?: string[] // Arrays of domains this identity has authorized, e.g. ["dash.cloudflare.com", "roadmap.sh"]
  notes?: string // e.g., "Work account", "Trash email"
  is_manual?: boolean // Flag to indicate if user manually added this provider
  created_at: number
  updated_at: number
}

/**
 * A pending OAuth capture that requires user confirmation before saving.
 * Stored as an array: PendingOAuthCapture[] in chrome.storage.local under "pending_oauth_captures".
 */
export interface PendingOAuthCapture {
  id: string
  provider: string
  identity: string
  suggested_domain: string
  oauth_purpose?: 'login' | 'integration'
  integration_scope?: string
  timestamp: number
}

/**
 * Global MFA Authenticator Entry
 * Centralized registry of master 2FA devices, authenticators, and hardware keys.
 * Stored as an array: GlobalMFAAuthenticator[] in chrome.storage.local under "mfa_registry".
 */
export interface GlobalMFAAuthenticator {
  id: string
  name: string // e.g. "Personal Google Authenticator", "YubiKey 5C NFC", "Authy on Work Mac"
  type: 'totp_app' | 'hardware_key' | 'sms' | 'prompt' | 'passkey' | 'unknown'
  provider?: string // e.g. "Google Authenticator", "Yubico", "1Password", "Authy"
  linked_account?: string // e.g. "user@example.com"
  notes?: string // e.g. "Stored on personal iPhone 15"
  created_at: number
  updated_at: number
}
