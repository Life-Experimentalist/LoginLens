# LoginLens Cloud Sync Schema Token Registry

This document serves as the **authoritative registry** for all single-character and double-character tokens used in LoginLens's ultra-compact cloud sync schema (`minimizeVaultForSync` and `expandVaultFromSync` in `src/core/utils/compression.ts`).

To prevent key collisions between current and future fields, **all new fields added to `IdentityProfile`, `DomainEntry`, or `GlobalOAuthAccount` MUST be registered in this table before implementation.**

---

## 1. Top-Level Payload Tokens

| Token | JSON Property Name | Type | Description |
| :--- | :--- | :--- | :--- |
| `s` | `savedAccounts` | `Array<DomainToken>` | List of domain entries |
| `o` | `oauthRegistry` | `Array<OAuthToken>` | List of global OAuth registry items |
| `f` | `mfaRegistry` | `Array<MFAToken>` | List of global MFA authenticators |
| `fk` | `passwordFingerprintKey` | `string \| undefined` | Base64 HMAC-SHA256 key that `ph` fingerprints are computed under. Added by `pushToCloudSync`, not by callers. Absent in payloads written before it was synced |

---

## 2. Domain Entry Tokens (`DomainEntry`)

| Token | Full Property Name | Data Type | Notes / Value Mapping |
| :--- | :--- | :--- | :--- |
| `d` | `domain` | `string` | e.g. `"dash.cloudflare.com"`, `"localhost:5678"` |
| `t` | `domain_type` | `number \| undefined` | `1` = `'app'`, `2` = `'website'`, `undefined` = auto |
| `n` | `domain_notes` | `string \| undefined` | Custom domain notes |
| `a` | `accounts` | `Array<AccountToken>` | Array of identity profiles under this domain |

---

## 3. Identity Profile Tokens (`IdentityProfile`)

| Token | Full Property Name | Data Type | Notes / Value Mapping |
| :--- | :--- | :--- | :--- |
| `i` | `id` | `string` | Unique profile UUID |
| `l` | `label` | `string` | Account tag, e.g. `"Work"`, `"Personal"` |
| `u` | `identities` | `string[]` | Array of emails/usernames |
| `m` | `login_method.type` | `number` | `0` = `'password'`, `1` = `'oauth'`, `2` = `'passkey'`, `3` = `'api-key'` |
| `p` | `login_method.provider` | `string \| undefined` | e.g. `"google.com"`, `"github.com"` |
| `vl` | `login_method.vault_location` | `string \| undefined` | Storage provenance tag |
| `op` | `oauth_purpose` | `number` | `0` = `'login'`, `1` = `'integration'` |
| `sc` | `integration_scope` | `string \| undefined` | e.g. `"Resume Autofill"`, `"Repo Access"` |
| `vs` | `vault_source` | `string \| undefined` | Provenance (e.g. `"Google Password Manager"`) |
| `mfa` | `mfa` | `Object \| undefined` | Nested object: `{ t, dl, ai, la }` |
| `mfa.t` | `mfa.type` | `string` | `'totp_app'`, `'hardware_key'`, `'sms'`, etc. |
| `mfa.dl` | `mfa.device_location` | `string` | e.g. `"Google Authenticator on iPhone"` |
| `mfa.ai` | `mfa.authenticator_id` | `string \| undefined` | Master authenticator UUID |
| `mfa.la` | `mfa.linked_account` | `string \| undefined` | e.g. `"user@example.com"` |
| `tf` | `two_factor_location` | `string \| undefined` | Legacy fallback field |
| `nt` | `notes` | `string \| undefined` | Account notes |
| `ph` | `password_hash` | `string \| undefined` | Keyed HMAC-SHA256 fingerprint for reuse detection — not a bare digest, and not reversible to the password |
| `pn` | `pinned` | `number \| undefined` | `1` = `true`, `0` = `false` |
| `ap` | `auto_pinned` | `number \| undefined` | `1` = `true`, `0` = `false` |
| `rc` | `password_reuse_count` | `number \| undefined` | Count of accounts sharing hash |
| `rf` | `reuse_flag` | `number \| undefined` | `1` = `true`, `0` = `false` |
| `ut` | `updated_at` | `number` | Epoch timestamp in milliseconds |
| `at` | `api_title` | `string \| undefined` | Human readable API key name |
| `ae` | `api_endpoint` | `string \| undefined` | Base URL for API keys |
| `ks` | `key_scope` | `string \| undefined` | API key scope label |
| `ld` | `linked_domains` | `string[] \| undefined` | Cross-domain accounts list |
| `dm` | `dismissed_mirrors` | `string[] \| undefined` | Dismissed mirror domains list |
| `ia` | `intra_domain_aliases` | `string[] \| undefined` | Same-domain alias account IDs |
| `da` | `dismissed_aliases` | `string[] \| undefined` | Explicit non-alias account IDs |

---

## 4. Global OAuth Registry Tokens (`GlobalOAuthAccount`)

| Token | Full Property Name | Data Type | Notes / Value Mapping |
| :--- | :--- | :--- | :--- |
| `i` | `id` | `string` | Entry UUID |
| `p` | `provider` | `string` | e.g. `"google.com"` |
| `u` | `identity` | `string` | e.g. `"user@gmail.com"` |
| `w` | `linked_websites` | `string[] \| undefined` | Domains authorized by this identity |
| `n` | `notes` | `string \| undefined` | Custom registry notes |
| `m` | `is_manual` | `number \| undefined` | `1` = `true`, `0` = `false` |
| `ct` | `created_at` | `number \| undefined` | Timestamp |
| `ut` | `updated_at` | `number \| undefined` | Timestamp |

---

## 5. Global MFA Registry Tokens (`GlobalMFAAuthenticator`)

| Token | Full Property Name | Data Type | Notes / Value Mapping |
| :--- | :--- | :--- | :--- |
| `i` | `id` | `string` | Authenticator UUID |
| `n` | `name` | `string` | e.g. `"Google Authenticator on iPhone"` |
| `t` | `type` | `string` | `'totp_app'`, `'hardware_key'`, `'sms'`, etc. |
| `p` | `provider` | `string \| undefined` | e.g. `"authy"`, `"yubico"` |
| `la` | `linked_account` | `string \| undefined` | Identity this authenticator belongs to |
| `nt` | `notes` | `string \| undefined` | Custom notes |
| `ct` | `created_at` | `number \| undefined` | Timestamp |
| `ut` | `updated_at` | `number \| undefined` | Timestamp |

---

## 6. Rules for Adding New Tokens in Future Releases

1. **Length**: All new tokens MUST use **2 lowercase letters** (e.g. `cx`, `bk`, `tx`). Single-character tokens (`a-z`) are reserved for high-frequency root properties.
2. **Uniqueness**: Perform a case-sensitive search in this document and `src/core/utils/compression.ts` before assigning a token.
3. **Backwards Compatibility**: When adding a new token, always handle `undefined` during expansion so that older snapshots missing the new token expand cleanly with sensible default fallbacks.
