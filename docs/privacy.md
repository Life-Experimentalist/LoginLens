# Privacy & Architecture

This page describes what LoginLens stores, where it stores it, and every
circumstance under which it makes a network request. It is meant to be checked
against the source, not taken on faith.

## Zero-server architecture

- There is no backend server.
- There is no external database.
- There is no account to create and nothing to sign in to.
- There are no analytics, telemetry, or crash reporters.

While it is installed and left on its defaults, LoginLens makes **no network
requests at all**. The two ways that can change are both opt-in, and the one
thing that reaches the network without being switched on is the page your
browser opens *after* you uninstall. All three are listed under
[Network requests](#network-requests) below.

## LoginLens does not store passwords

This is worth stating plainly because it shapes everything else on this page.
LoginLens records *which* account you used on a site — the username or email,
whether it was a password login or an OAuth provider, and which MFA method
guards it. The password itself is never asked for, never captured from a form,
and never written to storage.

The autofill overlay fills the username field and writes a `********`
placeholder into the password field; it has nothing real to put there.

The one class of secret LoginLens *does* store is **API keys**, and only ones
you paste in yourself. They live in `chrome.storage.local` in plaintext, like
the rest of the vault — see [Encryption](#encryption).

## What is stored, and where

### `chrome.storage.local` — the vault

Everything below persists until you clear it or remove the extension.

| Key | Contents |
| --- | --- |
| `saved_accounts` | The vault. Domains, and per domain the identity profiles: usernames/emails, login method (password or OAuth provider), labels, notes, and any API keys you added. |
| `oauth_registry` | Your OAuth identities grouped by provider — "these 14 sites use this Google account". |
| `mfa_registry` | Your MFA methods (authenticator app, hardware key, SMS, …) and which accounts use each. No TOTP secrets. |
| `vault_snapshots` | Local restore points. Each holds a full copy of the three collections above. Capped at 5 manual, 7 automatic, and 8 scheduled. |
| `password_fingerprint_key` | A random HMAC key, generated on first run, or adopted from an encrypted backup or Cloud Sync payload you restore. See [Reuse detection](#reuse-detection). |
| `app_logs` | The diagnostic log shown in Settings → Developer → System Logs. Warnings and errors are always kept so you have something to attach to a bug report; routine informational entries are kept only while Debug Mode is on. Capped at 500 entries, oldest dropped. Usernames, emails, API keys, and anything under a key named like a secret are replaced with placeholders before an entry is written. |
| `pending_oauth_captures` | OAuth flows detected but not yet confirmed by you. Cleared when you accept or dismiss them. |

### `chrome.storage.local` — preferences

`debug_mode`, `always_record_oauth`, `is_recording_oauth`, `auto_resolve_leftovers`,
`favicon_source`, `dashboard_columns`, `suppress_mfa_warnings`,
`onboarding_complete`, `welcome_step`, `local_dev_collapsed`,
`oauth_registry_collapsed`.

These are flags and view state. None of them contain vault data.

### `chrome.storage.sync` — only if you turn on Cloud Sync

Cloud Sync is **off by default**. When you enable it and set a passphrase,
LoginLens compresses the vault, encrypts it with a key derived from that
passphrase, splits the result into ~6KB chunks, and writes them as
`sync_meta` and `sync_chunk_0…n`. Your browser replicates that to your other
signed-in devices.

What is replicated is ciphertext. The passphrase is not synced — you type it
again on the other device. `cloud_sync_enabled` and `cloud_sync_passphrase`
stay in `chrome.storage.local` on this device only.

Note the consequence for uninstalling: removing the extension on one device
does not reach the copy already replicated to the others. Settings → Data →
**Export & Leave** has a button that clears the synced copy first.

### `chrome.storage.session` — cleared when you close the browser

`ll_tab_*`, one entry per tab, holding the domain that tab started on so an
OAuth redirect chain can be tied back to where it began. Session storage is
wiped by the browser on shutdown and is not accessible to content scripts.

## When LoginLens reads a page

Two content scripts run on `http://*/*` and `https://*/*`:

- **The autofill overlay** watches for focus on a login field and offers the
  identities you have saved for that domain. It reads the page's form fields; it
  does not send anything anywhere.
- **The OAuth scraper** reads signed-in identities out of the page. It does
  nothing at all unless one of the two recording switches is on.

Manual recording (`Record OAuth Login` in the popup) is the mode that reads the
most, so it is bounded and visible:

- Every page shows a pill saying LoginLens is recording, with a Stop button.
- It stops by itself 15 minutes after you start it. The deadline is a
  `chrome.alarms` alarm, so it survives the popup closing, the service worker
  being killed, and the browser restarting.

*Always Record OAuth Logins* has no per-page pill — it is a setting you chose and
can see in Settings → General.

The OAuth registry is capped at 500 entries so that a hostile page rendering
thousands of synthetic addresses cannot fill your storage quota and block real
writes.

## Encryption

Being precise about this matters:

- **Vault data in `chrome.storage.local` is not encrypted.** It is protected by
  the browser's extension sandbox and by your OS user account, the same as
  every other extension's data. Anything with read access to your browser
  profile directory can read it. Local snapshots are stored the same way.
- **Cloud Sync data is encrypted** before it leaves the device: AES-256-GCM
  with a key derived from your passphrase via PBKDF2-HMAC-SHA256 at 600,000
  iterations, over a random per-write salt and IV.
- **`.LLBAK` exports are encrypted** with the same scheme.
- **`.json` and `.csv` exports are plaintext**, deliberately — they exist so
  another tool can read them. The export wizard warns you before writing one.

## Reuse detection

LoginLens can tell you "this password is used on four sites" without storing
the password. On first run it generates a random HMAC-SHA256 key
(`password_fingerprint_key`). When you tell it two accounts share a password, it
stores an HMAC of that password under that key — a value that cannot be reversed
into the password, and that means nothing to anyone who does not hold the key.

The key travels only inside things that are already encrypted: an encrypted
`.LLBAK` backup, and the Cloud Sync payload. Both are AES-256-GCM under a key
derived from your passphrase, so the key is never exposed to your browser
vendor or to anyone holding the file.

It has to travel, because a fingerprint is meaningless to a device holding a
different key. If the key stayed behind, a second device would compare your
synced fingerprints against ones it computed itself, match nothing, and report
every account as unique — a wrong answer rather than a missing one.

It is **never** written into plaintext `.json` exports.

## Network requests

1. **Favicons — off by default.** Settings → Interface → *Load Favicons from
   Google* fetches icons from `google.com/s2/favicons?domain=…`. The domain
   travels in the URL, so with this on, opening your vault tells Google which
   sites you have saved. With it off (the default) icons are generated locally
   from the domain name.
2. **Cloud Sync — off by default.** Uses the browser's own sync transport
   (`chrome.storage.sync`), not a LoginLens server. Ciphertext only.
3. **The uninstall page.** `chrome.runtime.setUninstallURL` registers
   `loginlens.vkrishna04.me/uninstall`, which your *browser* opens in a tab
   after you remove the extension — the extension itself is already gone by
   then. It carries no query string and no identifier, and it is the one
   outbound address that is not behind a setting. Nothing else about the page
   is special: close the tab and it never loads.

That is the complete list. LoginLens does not check for updates, fetch remote
configuration, or phone home on install.

## Permissions

LoginLens requests `storage`, `tabs`, `clipboardWrite`, and `alarms`, and no
host permissions. [PERMISSIONS.md](../PERMISSIONS.md) explains each one and
lists the permissions it deliberately does not request.

## MV3 compliance

LoginLens targets Manifest V3. The background logic is an event-driven service
worker rather than a persistent page, and all code is bundled at build time —
nothing is fetched and evaluated at runtime, which is also why no
`scripting` permission is needed.

## Deleting your data

- **Settings → Data → Clear Local Vault** purges `chrome.storage.local`.
- **Settings → Data → Export & Leave** walks you through taking a backup first,
  then clears the local vault *and* the synced copy on your other devices.
- Removing the extension deletes its local storage. It does not, by itself,
  clear what Chrome Sync has already replicated elsewhere — use Export & Leave
  for that.

## Auditing this yourself

Every claim on this page is checkable in the source:

- **Storage keys**: `src/core/storage/`
- **Network requests**: `src/` contains no `fetch(`, `XMLHttpRequest`,
  `sendBeacon`, or `WebSocket` call at all. The opt-in favicon `<img src>` in
  `src/components/ui/FaviconImage.tsx` is the only outbound URL in the codebase.
  You do not have to take that on trust — `tests/privacy-claims.test.ts` walks
  every file under `src/` and fails the build if any of those calls appear, if
  the favicon endpoint is reached from a second file, or if a name belonging to
  an analytics vendor turns up anywhere.
- **Permissions**: the `manifest` block in `package.json`
- **Crypto**: `src/core/utils/encryption.ts` and
  `src/core/utils/password-fingerprint.ts`
- **What gets logged**: `redact()` in `src/core/utils/logger.ts`

The repository is at
[github.com/Life-Experimentalist/LoginLens](https://github.com/Life-Experimentalist/LoginLens).
