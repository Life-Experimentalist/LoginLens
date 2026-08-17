# LoginLens Extension Permissions

LoginLens asks for four permissions and no host permissions. This page lists
every one of them, what it is used for, and — where it matters — what it is
*not* used for.

The authoritative list is the `manifest` block in [`package.json`](package.json);
if this page and that block ever disagree, the manifest is right and this page
is a bug.

## Host permissions

**None.** LoginLens declares no `host_permissions`, so the background service
worker cannot make network requests to arbitrary sites.

## Content scripts

Content scripts are declared separately from host permissions, and the browser
shows them at install time as *"Read and change your data on websites you
visit"*. LoginLens registers three:

| Script | Runs on | Purpose |
| --- | --- | --- |
| `contents/injector.tsx` | `http://*/*`, `https://*/*` | Draws the autofill suggestion overlay when you focus a login field. Renders nothing on a site that has no entry in your vault. |
| `contents/universal-scraper.ts` | `http://*/*`, `https://*/*` | Watches for OAuth sign-in flows so the mapping can be recorded without manual entry. |
| `contents/bridge-content.ts` | `loginlens.vkrishna04.me`, `*.vkrishna04.me`, `localhost`, `127.0.0.1` | Sets a `data-loginlens-installed` attribute so the LoginLens website can tell you already have the extension. |

The first two need broad matches because a login form can appear on any site.
`http://` is included so vault entries for local development servers work.

Only `bridge-content.ts` announces that LoginLens is installed, and only on the
LoginLens site itself. The two broad scripts deliberately leave no detectable
trace on the pages they run on — otherwise every site you visited would learn
that this browser runs a credential-adjacent extension.

## Standard permissions

* **`storage`** — persists your vault in `chrome.storage.local`. When you turn
  on Cloud Sync it also writes an encrypted, compressed copy to
  `chrome.storage.sync`. Transient per-tab navigation state lives in
  `chrome.storage.session`, which the browser clears when you close it.

* **`tabs`** — lets the background service worker see when a tab navigates to a
  known OAuth provider and back again. This is what lets LoginLens reconstruct
  "you signed in to Figma with your Google account" from a redirect chain,
  without intercepting any network traffic.

* **`clipboardWrite`** — powers the "Copy" buttons for usernames, API keys, and
  diagnostic logs.

* **`alarms`** — an MV3 service worker is terminated whenever it goes idle, and
  `chrome.alarms` is the only timer that survives that. LoginLens registers one
  alarm, `scheduled_snapshot`, which fires daily and writes a local restore
  point only if a week has passed *and* the vault has changed since the last
  one. Nothing leaves the machine.

## Permissions LoginLens does *not* request

* No `downloads` — exports go through a normal browser download prompt.
* No `webRequest` / `declarativeNetRequest` — network traffic is never inspected.
* No `cookies`, `history`, or `bookmarks`.
* No `scripting` — nothing is injected at runtime; every content script is
  declared statically in the manifest, which is also why LoginLens ships no
  remotely-loaded code.

## The one outbound request, and how to stop it

While it is installed and left on its defaults, LoginLens makes **no network
requests at all**.

There is a single opt-in exception: **Settings → Interface → Load Favicons from
Google**. Turning it on fetches each site's icon from
`google.com/s2/favicons?domain=…`, which puts the domain in the URL — so with
it enabled, opening your vault tells Google which sites you have saved. It is
off by default, and with it off the icons are drawn locally from the domain
name.

One address is reached without being switched on, and only after LoginLens is
already gone: `chrome.runtime.setUninstallURL` asks the browser to open
`loginlens.vkrishna04.me/uninstall` in a tab when you remove the extension. The
extension is uninstalled by the time that page loads, the URL carries no query
string and no identifier, and closing the tab is enough to stop it.

See [docs/privacy.md](docs/privacy.md) for what is stored and where.
