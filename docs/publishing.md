# Publishing LoginLens

Everything needed to get a build from a git tag into the Chrome Web Store, the
Edge Add-ons store, and addons.mozilla.org.

Text in fenced blocks is meant to be copied into a store form as-is. Where a
store asks *why* — permission justifications, data-use answers — the wording
matters more than it looks: those answers are what a reviewer compares the
manifest against, and a vague one is the usual reason a privacy-adjacent
extension sits in review for weeks.

---

## Before the first submission

| Check | Why |
| --- | --- |
| `npm test && npm run lint && npm run typecheck` all pass | The release workflow runs these too, but finding out here costs a minute instead of a tag. |
| `package.json` `version` is the version you intend to publish | Plasmo stamps the built manifest from this field, not from the git tag. |
| `CHANGELOG.md` has a `## [x.y.z]` section for it | The release workflow extracts its notes from that heading and fails if it is missing. |
| No plaintext credential files anywhere in the tree | `temp/` is gitignored, but the AMO source archive is built from `git archive`, so anything *tracked* ships to a reviewer. |
| A support email you are willing to publish | All three stores display it. |
| A privacy policy URL | Required by Chrome and Edge for anything touching user data. Use `https://loginlens.vkrishna04.me/docs` or the raw `docs/privacy.md` link. |

### Assets each store wants

You already have `assets/icon.png`, `assets/logo.png`, and
`assets/social_banner.png`. Still needed, and not something a build can
generate — they have to be actual screenshots of the running extension:

- **At least one screenshot at 1280×800** (all three stores accept this size).
  Four or five is better than one. Good candidates: the dashboard with a
  populated vault, the Security Review screen mid-triage, the export wizard,
  and Settings → About.
- **Chrome small promo tile, 440×280 PNG.** Optional, but without it the
  listing cannot be featured anywhere.

Use a vault of invented accounts for these. A screenshot of your real vault is
a permanent, indexed, public list of every site you have an account on.

---

## Release procedure

```bash
git tag v1.0.0 && git push origin v1.0.0
```

That tag triggers [release.yml](../.github/workflows/release.yml), which:

1. **Fails immediately if the tag does not match `package.json`.** Plasmo reads
   the version from `package.json`, so a mismatched tag produces seven
   artifacts that all identify as the *previous* version — which every store
   rejects as a duplicate upload, long after the release looks finished.
2. Runs the test suite once, before spending seven builds on it.
3. Builds all seven targets and zips each.
4. Builds `loginlens-source.zip` with `git archive`, so it contains exactly the
   tracked tree — `node_modules`, `build/`, `coverage/` and everything
   gitignored are excluded by construction rather than by a list that goes
   stale.
5. Writes `SHA256SUMS.txt`, so anyone side-loading an unpacked build can check
   what they downloaded against what the workflow produced.
6. Publishes a GitHub Release carrying all of it, with only this version's
   changelog section as the notes.

Download `loginlens-chrome.zip`, `loginlens-edge.zip`,
`loginlens-firefox.zip` and `loginlens-source.zip` from that release. Those are
what you upload below.

**The first submission to each store must be made by hand.** None of the APIs
accept a listing, screenshots, a category, or privacy answers — only a package
for an item that already exists. [publish-stores.yml](../.github/workflows/publish-stores.yml)
handles every release after the first; see [Automating later releases](#automating-later-releases).

---

## Shared listing copy

### Name

```
LoginLens
```

### Short summary

Chrome caps this at 132 characters, AMO at 250, Edge shows its own limit in the
form. This is 118, so it fits everywhere:

```
See which account, OAuth provider and MFA method you used on each site. No passwords stored, no account, no telemetry.
```

### Full description

```
LoginLens answers a question your browser cannot: which account did I use here?

Password managers remember your password. They rarely remember that you signed
into Figma with your work Google account, that the Netflix login is the shared
family email, or that one site has a TOTP code sitting in an authenticator app
you have since replaced. LoginLens records exactly that — the identity, the
OAuth provider, and the MFA method behind every site you sign into — and keeps
all of it on your machine.

IT DOES NOT STORE PASSWORDS

There is no password field anywhere in LoginLens. When you import a browser or
password-manager export, each password is turned into a keyed HMAC-SHA256
fingerprint and the password itself is discarded before anything is written to
disk. The fingerprint is what lets LoginLens tell you "you have used this same
password on four sites" without ever holding the password that would make that
knowledge dangerous.

WHAT IT DOES

- Records which identity you used on each site, and which OAuth provider stands
  behind it, by watching sign-in redirect chains — no network interception.
- Tracks MFA per account: TOTP, passkey, SMS, hardware key, or none at all.
- Flags reused passwords by fingerprint, groups the accounts that share one,
  and lets you mark mirror domains as linked so the warning stops being noise.
- Stores API keys and developer tokens in the same vault, marked as such.
- Imports from Chrome, Edge, Bitwarden and 1Password CSV exports.
- Exports as encrypted .LLBAK, plaintext .json, or .csv, through a wizard that
  says plainly which of those anyone who gets the file can read.
- Keeps local restore points — manual, automatic and scheduled — each capped
  and rotated, restorable in one click.
- Optional cloud sync that uses your browser's own sync transport and uploads
  ciphertext only, encrypted with AES-256-GCM under a passphrase that never
  leaves your device.

PRIVACY

There is no LoginLens server. There is no account to create. There are no
analytics, telemetry, or crash reporters. While it is installed and left on its
defaults, LoginLens makes no network requests at all.

Two things can change that, and both are switched off until you switch them on:
Google favicon lookups (which would tell Google which sites are in your vault)
and encrypted cloud sync (which uses the browser's sync, not a server of ours).
A third address is reached only after LoginLens is already gone: your browser
opens an uninstall page when you remove the extension. It carries no identifier
and closing the tab stops it.

The source is Apache-2.0 and every claim above is checkable in it. The test
suite includes a check that walks the source and fails the build if a network
call, a second favicon caller, or an analytics vendor name ever appears.

OPEN SOURCE

https://github.com/Life-Experimentalist/LoginLens
```

### Category

- **Chrome:** Productivity → Workflow & Planning
- **Edge:** Productivity
- **AMO:** Privacy & Security

Not "Password manager" on any of them. LoginLens does not store or fill
passwords, and a reviewer who tests it against that category's expectations
will find it missing the feature the category is named for.

### Support and policy links

```
Homepage:        https://loginlens.vkrishna04.me
Support site:    https://github.com/Life-Experimentalist/LoginLens/issues
Privacy policy:  https://loginlens.vkrishna04.me/docs
```

---

## Chrome Web Store

Dashboard: <https://chrome.google.com/webstore/devconsole>. One-time US$5
developer registration fee.

### Single purpose

Chrome requires one sentence, and rejects anything that reads as two products.

```
LoginLens records which account, OAuth provider and MFA method you used on each website, and shows that record back to you.
```

### Permission justifications

One box per permission. Copy each into the matching field.

**`storage`**

```
Stores the vault — the record of which account, OAuth provider and MFA method belongs to each site — in chrome.storage.local on the user's own device. When the user turns on the optional Cloud Sync feature, an encrypted and compressed copy is also written to chrome.storage.sync. Per-tab navigation state used to follow an OAuth redirect chain lives in chrome.storage.session and is cleared when the browser closes.
```

**`tabs`**

```
Lets the background service worker observe when a tab navigates to a known OAuth provider and back again. Reconstructing "you signed into Figma with your Google account" from that redirect chain is the extension's core function. It reads tab URLs only; it does not inspect, intercept or modify any network traffic, and it requests no webRequest or declarativeNetRequest permission.
```

**`clipboardWrite`**

```
Powers the Copy buttons for usernames, stored API keys, and the diagnostic log that users are asked to attach to a bug report. The extension only writes to the clipboard; it never reads it.
```

**`alarms`**

```
A Manifest V3 service worker is terminated whenever it goes idle, and chrome.alarms is the only timer that survives that. The extension registers exactly one alarm, which fires daily and writes a local restore point only if a week has passed and the vault has changed since the last one. Nothing is sent anywhere.
```

**Host permissions / broad content script access**

Chrome asks about this separately because the two broad content scripts trigger
the *"Read and change your data on all websites"* install warning.

```
The extension declares no host_permissions. Two content scripts match http://*/* and https://*/* because a login form or an OAuth redirect can occur on any site, and neither is knowable in advance. One draws an autofill suggestion overlay when a login field is focused, and renders nothing on a site with no entry in the user's vault. The other watches for OAuth sign-in flows so the account mapping can be recorded without manual entry. Neither reads page content beyond form fields and the URL, neither transmits anything off the device, and both deliberately leave no detectable trace on the page — otherwise every site visited would learn that this browser runs a credential-adjacent extension. A third content script is pinned to the extension's own website and sets a single attribute so that site can tell the extension is installed.
```

### Data use disclosure

Chrome shows a grid of data categories. **Check nothing.** Then certify all
three statements — they are all true here:

- I do not sell or transfer user data to third parties, apart from the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

If a reviewer questions the favicon setting, this is the answer:

```
The extension collects and transmits nothing. One optional setting, off by default, loads site icons from google.com/s2/favicons, which places the domain in the request URL. It is disabled unless the user turns it on, the setting text states plainly that enabling it reveals the user's saved sites to Google, and with it off the icons are drawn locally. No data is collected by the developer under either setting — there is no server to collect it on.
```

### Remote code

Answer **No**. If asked to elaborate:

```
All code is bundled at build time. Nothing is fetched and evaluated at runtime, no eval or new Function is used, every content script is declared statically in the manifest, and the extension requests no scripting permission.
```

### Expect

A first review of a few days to two weeks. Extensions that touch credentials
are reviewed by a human. The broad content-script match is the thing that gets
questioned; the justification above is written to answer it before it is asked.

---

## Microsoft Edge Add-ons

Dashboard: <https://partner.microsoft.com/dashboard/microsoftedge>. Free, no
registration fee.

Upload `loginlens-edge.zip`. The Chrome build also works — Edge accepts MV3
Chromium packages — but the Edge target is built and shipped separately so the
manifest matches what was actually tested there.

Edge reuses the Chrome listing copy above. Two fields differ:

**Properties → Why are the permissions required?**

Edge asks for one combined answer rather than one per permission:

```
storage — keeps the vault (which account, OAuth provider and MFA method belongs to each site) in local extension storage on the user's device, and, only if the user enables Cloud Sync, an encrypted copy in the browser's own sync storage.

tabs — lets the background service worker see when a tab navigates to a known OAuth provider and back, which is how the extension reconstructs which account was used to sign in. It reads tab URLs only and inspects no network traffic.

clipboardWrite — for the Copy buttons on usernames, stored API keys and diagnostic logs. The extension writes to the clipboard and never reads it.

alarms — an MV3 service worker is terminated when idle, and alarms is the only timer that survives that. One alarm fires daily and writes a local restore point when the vault has changed. Nothing leaves the device.

Two content scripts match all http and https URLs because a login form or an OAuth redirect can appear on any site. Neither sends anything off the device. The extension declares no host_permissions and requests no webRequest, scripting, cookies, history or downloads permission.
```

**Availability → Publish visibility**

Set **Visible in store**. "Hidden" produces a working install link that no one
can find by searching, which is only what you want for a private beta.

### Expect

Usually faster than Chrome — often 24–72 hours. Edge occasionally rejects a
package for a missing privacy policy URL before a human ever looks at it, so
fill that field before submitting.

---

## Firefox Add-ons (AMO)

Dashboard: <https://addons.mozilla.org/developers/>. Free.

Upload `loginlens-firefox.zip` (the MV3 build). `loginlens-firefox-mv2.zip`
exists for users on older Firefox ESR builds and is distributed through GitHub
Releases, not AMO — do not submit both to the same listing.

### The source archive is mandatory

AMO requires a source-code upload for any add-on assembled by a bundler,
because a reviewer cannot read Parcel's output. Upload
`loginlens-source.zip` from the same GitHub Release.

**Notes for reviewer** — this field is the difference between a review that
takes days and one that takes a month:

```
Build environment
  Node.js 22, npm 10. Windows and Linux both work; CI builds on ubuntu-latest.

To reproduce the submitted package from the attached source archive:
  npm ci
  npm run build:firefox

The output appears in build/firefox-mv3-prod/, which is the exact content of
the uploaded package.

Notes
- Built with Plasmo 0.90.5, which wraps Parcel. The bundled output is minified;
  the attached archive is the complete unminified source, generated with
  git archive from the tagged commit.
- No code is fetched or evaluated at runtime. No eval, no new Function, no
  remote scripts. Every content script is declared statically in the manifest.
- The extension makes no network requests on default settings. One setting,
  off by default, loads favicons from google.com/s2/favicons. The only other
  outbound address is the uninstall page, which the browser opens after the
  add-on is already removed.
- No passwords are stored. Imported passwords are converted to keyed
  HMAC-SHA256 fingerprints and discarded before anything is written to disk.
  See src/core/utils/password-fingerprint.ts.
- The test suite includes tests/privacy-claims.test.ts, which walks every file
  under src/ and fails the build if a network API call, a second caller of the
  favicon endpoint, or an analytics vendor name appears. Run it with `npm test`.
```

### License

Select **Apache License 2.0** to match `LICENSE` and `package.json`. A mismatch
between the declared licence and the one in the source archive is a review
finding.

### Expect

Days to a few weeks depending on the queue. AMO reviews are the most thorough
of the three and the reviewer reads the source. The notes above exist to answer
what they will ask.

---

## Automating later releases

Once each listing exists, [publish-stores.yml](../.github/workflows/publish-stores.yml)
can push a new package to any combination of the three. Run it from the Actions
tab, give it a tag, and tick the stores you want.

Each job skips itself when its credentials are missing, so the workflow is
harmless before any secret exists — it will just report every store as skipped.

### Secrets to add

Repository → Settings → Secrets and variables → Actions.

**Chrome** — from a Google Cloud project with the Chrome Web Store API enabled,
then a one-time OAuth consent to get the refresh token:

| Secret | Where it comes from |
| --- | --- |
| `CHROME_EXTENSION_ID` | The 32-character id in the item's dashboard URL |
| `CHROME_CLIENT_ID` | OAuth 2.0 client (type: Desktop app) |
| `CHROME_CLIENT_SECRET` | Same client |
| `CHROME_REFRESH_TOKEN` | Exchanged once, by hand, from an authorization code |

**Edge** — Publish API credentials, under the item's *Publish API* page:

| Secret | Where it comes from |
| --- | --- |
| `EDGE_PRODUCT_ID` | The item's product id |
| `EDGE_CLIENT_ID` | Publish API page |
| `EDGE_API_KEY` | Publish API page. Rotate it if it is ever exposed — it is a bearer credential with publish rights. |

**Firefox** — <https://addons.mozilla.org/developers/addon/api/key/>:

| Secret | Where it comes from |
| --- | --- |
| `AMO_JWT_ISSUER` | JWT issuer |
| `AMO_JWT_SECRET` | JWT secret |

All of these can publish a new version of your extension to millions of
browsers. Treat them like signing keys: repository secrets only, never in a
workflow file, and rotate immediately if one is ever printed in a log.

### What automation still cannot do

Listing text, screenshots, category, privacy answers, and anything a store
review team has flagged. Those stay manual, on all three.

---

## Version bump checklist

For each subsequent release:

1. Bump `version` in `package.json`.
2. Add a `## [x.y.z] - YYYY-MM-DD` section to `CHANGELOG.md` describing the
   change in terms of what a user can now do differently.
3. Commit, tag `vx.y.z`, push the tag.
4. Wait for the release workflow to finish and produce the artifacts.
5. Run **Publish to stores** against that tag.

Never re-tag a version that has already reached a store. Every one of them
treats the version string as immutable, and a re-uploaded package under a
version they have already seen is rejected rather than replaced.
