# Contributing to LoginLens

Thanks for your interest. Bug fixes, new OAuth handlers, tests, and
documentation corrections are all welcome.

## Development setup

Requires Node.js 22 or newer, with npm 11 or newer. Node 24 (Active LTS) is
what CI builds and releases with, and what you should use unless you have a
reason not to.

The Node floor comes from the test toolchain — jsdom and
`@testing-library/jest-dom` both refuse to install below it — not from the
extension itself, which runs in the browser.

The npm floor is about the lock file. `package-lock.json` is written by npm 12,
which nests some transitive dependencies where npm 10 hoists them; npm 10 reads
that as out of sync and fails `npm ci` outright. npm 11 and newer install it
correctly. Node 24 bundles npm 11, so this only bites on Node 22 — there, run
`npm install -g npm@12` first.

```bash
git clone https://github.com/Life-Experimentalist/LoginLens
```

```bash
npm install
```

```bash
npm run dev
```

`npm run dev` builds the Edge MV3 target with live reload. Load the unpacked
extension:

- **Chrome / Edge / Brave / Opera** — `chrome://extensions`, enable
  **Developer mode**, **Load unpacked**, select `build/edge-mv3-dev`
  (or the matching `-dev` folder for whichever target you built).
- **Firefox** — `about:debugging#/runtime/this-firefox`, **Load Temporary
  Add-on**, select `build/firefox-mv3-dev/manifest.json`.

---

## Before opening a pull request

All three must pass; CI runs the same commands on Node 22, 24 and 26 — the
Maintenance LTS, Active LTS and Current lines that `engines.node: >=22` covers.

```bash
npm run lint
```

```bash
npm run typecheck
```

```bash
npm test
```

`npm run format` applies Prettier. `npm run test:coverage` produces a coverage
report over `src/core`.

---

## Changing the artwork

`assets/` holds the masters, at the size the store listings and the website
need. The extension UI imports the smaller copies in `assets/ui/` instead,
because a component that draws a 1536px master at 80px ships several megabytes
to render a thumbnail.

After editing anything in `assets/`, regenerate them and commit the result:

```bash
npm run assets
```

Import from `~/assets/ui/...` in components. `assets/icon.png` stays a master —
Plasmo generates the manifest icon set from it.

---

## Project layout

```text
src/
├── background/       # MV3 service worker: tab tracking, sync, alarms
├── contents/         # Content scripts
│   ├── injector.tsx            # Autofill / identity hint overlay
│   ├── universal-scraper.ts    # OAuth capture
│   ├── recording-indicator.tsx # On-page "recording" pill
│   └── bridge-content.ts       # Install detection, LoginLens site only
├── core/
│   ├── ai-patcher/   # Selector repair handlers
│   ├── constants/    # Shared constant tables
│   ├── hooks/        # Shared React hooks
│   ├── scrapers/     # HandlerRegistry + per-provider handlers
│   ├── storage/      # schema.ts, native.ts, config.ts, snapshots.ts
│   └── utils/        # encryption, compression, cloud-sync, csv-parser,
│                     # domain, password-fingerprint, password-inference,
│                     # export, logger, runtime, browser
├── components/
│   ├── ui/           # Reusable components and modals
│   └── views/        # Vault views
├── tabs/             # vault.tsx, uninstall.tsx
└── popup.tsx         # Toolbar popup
tests/                # Vitest suites, mirroring src/core
website/              # Marketing site and offline decryptor (separate build)
```

---

## Adding an OAuth provider

Most providers need only a URL pattern.

1. Open `src/contents/universal-scraper.ts` and find `extractOAuthInfo()`.
2. Add a branch before the generic fallback:

   ```ts
   } else if (url.includes('sso.example.com/authorize')) {
     provider = 'example.com'
   }
   ```

3. The generic fallback already catches most providers — a URL with a
   `client_id` parameter and `oauth`, `authorize` or `auth` in the path. Add a
   named branch only when the fallback picks the wrong hostname, or when the
   provider needs to be normalised to a canonical name.

If extracting the signed-in identity needs real DOM work, write a handler
instead:

1. Add a file under `src/core/scrapers/handlers/`.
2. Export an object satisfying `ScraperHandler` — `name`, `domains`, `execute`.
3. Register it in `universal-scraper.ts` with
   `HandlerRegistry.register(YourHandler)`.

See `GoogleHandler.ts` for a worked example.

---

## Things to know before changing code

- **Permissions are asserted in CI.** The built manifest must request exactly
  `alarms`, `clipboardWrite`, `storage`, `tabs` and no `host_permissions`.
  Adding one is a deliberate decision that needs to be argued in the PR, not a
  side effect. See [PERMISSIONS.md](PERMISSIONS.md).
- **Never store a raw password.** Passwords are reduced to a keyed HMAC
  fingerprint (`core/utils/password-fingerprint.ts`) and the plaintext is
  dropped.
- **`chrome.storage.sync` leaves the device.** Anything added to the sync
  payload is replicated by the browser vendor. It must be encrypted first, and
  sync must stay off by default.
- **`@plasmohq/storage` JSON-serializes values.** A raw
  `chrome.storage.onChanged` listener receives `"false"`, not `false`. Parse
  before testing truthiness.
- **The service worker is ephemeral.** Register listeners synchronously at the
  top level, and use `chrome.alarms` for anything that has to survive
  termination — `setTimeout` does not.
- **Content scripts run on every page.** Anything they write to storage needs a
  bound, and anything they stamp on the DOM is a fingerprinting signal.

---

## Pull requests

1. Branch descriptively — `feat/oauth-okta-handler`, `fix/storage-sanitization`.
2. One logical change per PR.
3. Say what changed and why. "Why" is the part reviewers cannot reconstruct.
4. CI must be green.

Security issues go to [SECURITY.md](SECURITY.md), not the public issue tracker.
