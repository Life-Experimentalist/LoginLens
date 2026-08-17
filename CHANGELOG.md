# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — first public release

Nothing was released before this, so this entry describes the whole feature set
rather than a diff against an earlier version.

### The vault

- **Per-site identity records.** For every domain, which username or email you
  used, whether the login was a password or an OAuth provider, and free-form
  labels and notes. Multiple identities per domain are first-class — the point
  of the extension is telling your three Google accounts apart.
- **Global OAuth registry.** Identities grouped by provider, so you can see
  "these 14 sites use this Google account" in one place. Editing an identity
  here cascades to every domain linked to it.
- **MFA registry.** Track which authenticator app, hardware key, passkey, or SMS
  number guards each account, and see which accounts have nothing at all.
- **Mirror-domain linking.** Declare that two hostnames are the same service so
  reuse warnings between them stop being noise.
- **Provenance.** Each entry records where it came from — a Chrome export, an
  Edge export, an OAuth capture, or you.

### Passwords are never stored

- Reuse is detected from **HMAC-SHA256 fingerprints** computed under a random
  256-bit key generated on the device and never transmitted. Equal passwords
  produce equal fingerprints; without the key a fingerprint cannot be attacked
  offline, which a bare hash of a human password can.
- The same keyed scheme flags passwords from a small list of ones that are
  broken on sight.
- The autofill overlay fills the username and writes a placeholder into the
  password field. It has nothing real to put there.

### Capturing sign-ins

- OAuth flows to Google, GitHub, Microsoft, Apple, X/Twitter, Facebook,
  Discord, LinkedIn and Slack are recognised by their redirect chain, plus a
  generic fallback for any authorization URL carrying a `client_id`.
- Captures land in a pending queue for one-click confirmation. Nothing is
  written to the vault behind your back.
- Capture is off unless you turn it on. **Record OAuth Login** runs for 15
  minutes and then stops itself — the deadline is a `chrome.alarms` alarm, so it
  survives the popup closing, the service worker being killed, and a browser
  restart — and while it runs, every page shows a pill with a Stop button.
  **Always Record OAuth Logins** is the persistent alternative, off by default.
- The Google Linked Apps page has a dedicated handler that reads the apps
  already connected to your account.
- New providers are added by extending a registry, not by editing the scraper.

### Security review

- One view of reused passwords, weak passwords, and accounts with no MFA, with
  the fixes ordered by what to do first.
- Accounts that share a password are grouped together, so each group can be
  worked through site by site — mark mirror domains as linked, dismiss the ones
  that are deliberate, and reset a group to start over.

### Finding your way around

- **Settings → About** shows the version you are running and the browser it is
  running in, and links out to the documentation, the issue tracker, the
  security policy, the source, and the license.

### Data you can get back out

- **Restore points.** Manual, automatic and scheduled local snapshots of the
  whole vault, each capped and rotated, restorable in one click.
- **Export** as encrypted `.LLBAK`, plaintext `.json`, or `.csv`, through a
  wizard that says plainly which of those are readable by anyone who gets the
  file.
- **Import** from Chrome, Edge, Bitwarden and 1Password CSV exports. Column
  names are matched by alias, so an export does not have to use Chrome's
  spelling. Passwords in the file are fingerprinted and discarded.
- **Offline decryption.** The `.LLBAK` format is documented, and the extension
  hands you a standalone Python script that decrypts a backup without it. The
  project website also has an in-browser decryptor with no backend behind it: it
  makes no network request once loaded, so you can disconnect from the network,
  decrypt, download the JSON, and close the tab before reconnecting.

### Sync and exit

- **Cloud sync is optional and off by default.** When enabled with a passphrase,
  the vault is compressed, encrypted with AES-256-GCM under a key derived by
  PBKDF2-HMAC-SHA256 at 600,000 iterations, chunked, and handed to the browser's
  own sync transport. Only ciphertext is replicated; the passphrase is not.
- **Export & Leave.** A real exit path: take a backup, wipe the local vault, and
  clear the copy your browser already replicated to your other devices —
  something uninstalling on one machine cannot do on its own.
- Uninstalling opens a page explaining what was and was not removed.

### Privacy posture

- No server, no account, no analytics, no telemetry, no update check.
- Permissions requested: `storage`, `tabs`, `clipboardWrite`, `alarms`. **No
  host permissions.** CI fails the build if that set changes.
- Favicons are generated locally from the domain name. Fetching real icons from
  Google is available in Settings and is opt-in, because the domain would travel
  in the request URL.
- Diagnostic logs redact usernames, emails, API keys, and anything under a
  secret-looking key before an entry is written, and are capped at 500 entries.
- The OAuth registry is capped at 500 entries so a hostile page cannot fill the
  storage quota.

### Platforms

Builds for Chrome, Edge, Brave, Opera, Firefox (MV3 and MV2) and Safari from a
single source tree. See [docs/browsers.md](docs/browsers.md) for what differs
between them.

### Interface

- Dashboard, At a Glance, Stats, MFA registry, OAuth registry and Settings
  views, with multi-select and bulk actions.
- A first-run walkthrough that sets expectations before anything is imported.
- Restoring from cloud sync and repairing the vault each take a restore point
  first, so neither is a one-way door.

[1.0.0]: https://github.com/Life-Experimentalist/LoginLens/releases/tag/v1.0.0
