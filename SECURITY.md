# Security Policy

LoginLens has no backend. There is no LoginLens account, no LoginLens server,
and no telemetry of any kind — nothing is ever sent to us. Everything below
describes what the code actually does, including the two cases where bytes do
leave the device, because a security policy that overstates its guarantees is
worse than one that states smaller ones honestly.

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.0.x   | ✅        |
| < 1.0   | ❌ (pre-release, not published) |

## Security architecture

1. **No servers of ours.** LoginLens has no analytics, no tracking beacons, no
   remote configuration and no crash reporting. The extension declares no
   host permissions beyond the pages its content scripts run on.

2. **Passwords are never stored.** Importing a CSV never writes a plaintext
   password to storage. What is kept is a **keyed HMAC-SHA256 fingerprint**
   under a 256-bit key generated once per install and never exported — not a
   bare SHA-256 digest, which for a human-chosen password is reversible by
   anyone with a wordlist. The fingerprint exists only to detect reuse of the
   same password across sites, and is meaningless outside the install that
   produced it.

3. **AES-256-GCM where encryption is claimed.** `.llbak` exports and cloud
   sync payloads are encrypted client-side with AES-256-GCM under a key derived
   by PBKDF2-HMAC-SHA256 (600,000 iterations, per-payload random salt and IV).
   **Local snapshots are not encrypted** — they are ordinary objects in
   `chrome.storage.local`, protected by the browser profile, exactly like the
   vault they snapshot. Anyone who can read the unlocked profile can read both.

4. **Closed Shadow DOM.** The on-page overlay and the recording indicator are
   rendered into `attachShadow({ mode: 'closed' })`, so page script cannot
   reach their contents through `host.shadowRoot`. The overlay also does not
   mark the pages it runs on, so an arbitrary site cannot use it to fingerprint
   that LoginLens is installed.

5. **Exact-or-subdomain host matching.** Every place that decides "this page
   belongs to provider X" matches the host exactly or as a subdomain of it.
   Substring matching is a bug here, not a shortcut: `github.com.example.net`
   is a domain anyone can register.

## What can leave your device

Two things, both **off by default**, both switched on by you:

- **Favicon fetch.** If enabled, site icons are requested from Google's public
  favicon endpoint. That request tells Google a domain you have an entry for.
  Left off, icons are drawn locally from the site's initial.
- **Encrypted browser sync.** If enabled, the vault is compressed, encrypted
  with your sync passphrase and written to `chrome.storage.sync`, which the
  browser vendor (Google for Chrome, Microsoft for Edge, Mozilla for Firefox)
  uploads to their servers and replicates to your other signed-in browsers.
  The uploaded blob is opaque without your passphrase, but it *is* a copy that
  exists off this device, and removing the extension here does not delete it
  there. See [`docs/privacy.md`](docs/privacy.md).

Nothing else makes an outbound request. Any future addition that does belongs
in this list before it ships.

## Known limitations

Stated so nobody has to discover them:

- **The device is the trust boundary.** The vault, the sync passphrase and the
  fingerprint key all live in `chrome.storage.local`. There is no master
  password gating the extension UI, so anyone with your unlocked browser
  profile has everything in it.
- **Identity scraping reads page-controlled DOM.** On a genuine provider page,
  what is scraped is the signed-in account. Values are length-capped and never
  executed, but they originate from the page.
- **Imported CSVs are trusted as data, not verified.** LoginLens cannot confirm
  that an imported row reflects a real account.

## Reporting a vulnerability

Please do **not** open a public GitHub issue for a security report.

- Use GitHub's private reporting form:
  <https://github.com/Life-Experimentalist/LoginLens/security/advisories/new>
- Include reproduction steps, affected version, browser and target, and any
  proof-of-concept.

We aim to acknowledge a report within 72 hours, agree a fix window with you,
and credit you in the release notes unless you would rather we did not.
