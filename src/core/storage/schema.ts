// ---------------------------------------------------------------------------
// Core Storage Schema — source of truth for all data structures in LoginLens
// ---------------------------------------------------------------------------

export type LoginMethodType = 'password' | 'oauth' | 'passkey' | 'api-key';

/**
 * A single saved identity profile for a website.
 */
export interface IdentityProfile {
  id: string;
  label: string; // Free-form tag: Work, Personal, Burner, etc.
  identities: string[]; // usernames/emails
  login_method: {
    type: LoginMethodType;
    provider?: string; // e.g. "github.com" for OAuth
    vault_location?: string;
  };
  vault_source?: string; // Provenance tag: e.g., "Google Password Manager"
  mfa?: {
    type: 'totp_app' | 'hardware_key' | 'sms' | 'prompt' | 'unknown';
    device_location: string; // e.g. "Google Authenticator on iPhone", "YubiKey"
    linked_account?: string; // e.g. the specific Google account it's tied to
  };
  two_factor_location?: string; // Legacy fallback
  notes?: string;
  password_hash?: string; // SHA-256 hash of the password for detecting reuse without storing the actual password
  pinned?: boolean;
  updated_at: number;
  // API Key specific fields
  api_title?: string;   // Human-readable name for the key, e.g. "OpenAI Production Key"
  api_endpoint?: string; // Base URL/endpoint this key is used with
}

/**
 * A single domain entry in the vault — one per website.
 * Stored as an array: DomainEntry[] in chrome.storage.local under "saved_accounts".
 */
export interface DomainEntry {
  domain: string;
  domain_notes?: string;
  accounts: IdentityProfile[];
}

// ---------------------------------------------------------------------------
// Legacy type alias — kept for backwards compatibility during migration.
// DomainMapping[] was previously used everywhere. DomainEntry[] is the new name.
// ---------------------------------------------------------------------------
export type DomainMapping = DomainEntry;

/**
 * Global OAuth Registry Entry
 * Tracks centralized OAuth identities across the extension.
 * Stored as an array: GlobalOAuthAccount[] in chrome.storage.local under "oauth_registry".
 */
export interface GlobalOAuthAccount {
  id: string;
  provider: string; // e.g., "google.com", "github.com"
  identity: string; // e.g., "user@gmail.com"
  linked_websites?: string[]; // Arrays of domains this identity has authorized, e.g. ["dash.cloudflare.com", "roadmap.sh"]
  notes?: string;   // e.g., "Work account", "Trash email"
  is_manual?: boolean; // Flag to indicate if user manually added this provider
  created_at: number;
  updated_at: number;
}

/**
 * A pending OAuth capture that requires user confirmation before saving.
 * Stored as an array: PendingOAuthCapture[] in chrome.storage.local under "pending_oauth_captures".
 */
export interface PendingOAuthCapture {
  id: string;
  provider: string;
  identity: string;
  suggested_domain: string;
  timestamp: number;
}
