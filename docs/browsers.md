# Multi-Browser Support

LoginLens is one codebase built into seven browser-specific bundles. Every
target below is built on every push by [CI](../.github/workflows/ci.yml), so a
target that stops compiling fails the build rather than being discovered by a
user.

## Supported browsers

| Browser | Minimum version | Build target | Status |
| --- | --- | --- | --- |
| Google Chrome | 88 | `chrome-mv3` | Supported |
| Microsoft Edge | 88 | `edge-mv3` | Supported |
| Brave | 1.34 | `brave-mv3` | Supported |
| Opera | 74 | `opera-mv3` | Supported |
| Firefox | 109 | `firefox-mv3` | Supported |
| Firefox (older) | 78 | `firefox-mv2` | Supported, unsigned builds only |
| Safari | 16.4 | `safari-mv3` | Builds, but needs Xcode packaging — see below |

Brave and Opera are Chromium-based and can also load the Chrome build; the
dedicated targets exist so their store listings can be produced from CI
artifacts without a manual repack.

---

## Building each target

Requires Node.js 18 or newer.

```bash
npm install
```

```bash
npm run build:chrome
```

The other targets follow the same pattern: `build:edge`, `build:brave`,
`build:opera`, `build:firefox`, `build:firefox-mv2`, `build:safari`.

Output lands in `build/<target>-prod/` — for example
`build/firefox-mv3-prod/`. A bare `npm run build` produces the Chrome MV3
bundle.

---

## Firefox notes

- **Namespace.** The code calls `chrome.*` directly. Firefox 109+ exposes the
  `chrome.*` namespace for MV3 extensions, so no polyfill is bundled.
- **Loading a development build.** Open `about:debugging#/runtime/this-firefox`,
  choose **Load Temporary Add-on…**, and select `manifest.json` inside the build
  folder. Temporary add-ons are removed when Firefox restarts.
- **MV2 target.** `firefox-mv2` exists for installations pinned below Firefox
  109. It is functionally identical; Mozilla no longer accepts new MV2
  submissions to addons.mozilla.org, so this target is for self-hosted or
  unsigned installs.
- **Signing.** A public Firefox release must be signed through the Mozilla
  Add-on Developer Hub.

---

## Storage across browsers

The vault lives in `chrome.storage.local` on every target, reached through
`@plasmohq/storage`. Behaviour and persistence are the same everywhere.

Optional encrypted sync uses `chrome.storage.sync`, which is replicated by the
browser vendor — Google for Chrome, Microsoft for Edge, Mozilla for Firefox.
That is why it is off by default and why the payload is encrypted before it
leaves the device. See [Privacy & Architecture](./privacy.md).

Sync quotas are set by the browser, not by LoginLens: 8 KB per item, 100 KB
total. A vault larger than that cannot use browser sync and should use an
encrypted file export instead.

---

## Safari

The `safari-mv3` target compiles and is built by CI, but Safari extensions
cannot be installed from a folder. Distribution requires:

1. macOS with Xcode.
2. Wrapping the build with `xcrun safari-web-extension-converter`.
3. Signing and shipping the resulting app through the App Store or a
   Developer ID.

Because that pipeline needs a Mac and an Apple developer account, Safari is
**not officially released**. The build target is kept green so the port stays a
packaging problem rather than a code problem.
