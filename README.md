<div align="center">

# LoginLens 🔍

**A local-only map of how you sign in to everything.**

Which account did you use on that site? Was it the Google button or a password?
Which authenticator guards it? LoginLens answers those questions without ever
storing a password and without a server to store it on.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-4285F4.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Built with Plasmo](https://img.shields.io/badge/Built%20with-Plasmo-6B4EFF.svg)](https://www.plasmo.com/)

[Website](https://loginlens.vkrishna04.me) ·
[Documentation](./docs/README.md) ·
[Privacy](./docs/privacy.md) ·
[Permissions](./PERMISSIONS.md) ·
[Contributing](./CONTRIBUTING.md)

</div>

---

## What it is

A password manager remembers your passwords. LoginLens remembers your *choices* —
the layer above them that nothing else keeps track of:

- You signed up to Figma with **Google**, not email. Two years later you have no
  idea which of your three Google accounts.
- You have an authenticator entry called `Acme` and no memory of which of your
  two Acme logins it belongs to.
- You changed one password and want to know which other sites shared it.

It runs entirely inside your browser. There is no server, no account, and no
sync unless you deliberately turn it on.

## What it stores — and what it doesn't

**Not stored:** your passwords. LoginLens never asks for one, never reads one
out of a form, and has nothing to leak if the vault file is read. The autofill
overlay fills the username and puts a placeholder in the password field.

**Stored, locally:** which usernames you use where, which OAuth provider backs
each login, which MFA method guards it, your notes and labels, and any API keys
you paste in yourself.

Full detail — every storage key, every encryption boundary — is in
[docs/privacy.md](./docs/privacy.md).

## Features

- **OAuth capture** — detects sign-ins with Google, GitHub, Microsoft, Apple,
  X/Twitter, Facebook, Discord, LinkedIn and Slack by watching the redirect
  chain, then queues them for one-click confirmation rather than saving anything
  behind your back. It is off until you turn it on, and manual recording stops
  itself after 15 minutes.
- **Password reuse detection without passwords** — reuse is inferred from
  HMAC-SHA256 fingerprints computed under a random 256-bit key generated on your
  device. Equal passwords produce equal fingerprints; without the key a
  fingerprint cannot be attacked offline, which a bare SHA-256 hash of a human
  password very much can.
- **Weak-password flagging** — the same keyed scheme flags the two dozen
  passwords that are broken on sight.
- **MFA registry** — track which authenticator, hardware key, or passkey covers
  which account, and get warned about accounts with none.
- **Mirror-domain linking** — tell it that `9anime.to` and `9anime.id` are the
  same place, and reuse warnings between them stop being noise.
- **Security review** — a single view of reused passwords, weak passwords, and
  unprotected accounts, with the fixes grouped by what to do first.
- **Local restore points** — automatic and manual snapshots of the vault,
  capped and rotated, restorable in one click.
- **Optional encrypted cloud sync** — off by default. When on, the vault is
  compressed, encrypted with AES-256-GCM under a passphrase-derived key, chunked,
  and handed to your browser's own sync. Ciphertext is all that is replicated.
- **Import and export** — CSV import from other managers, and export as
  encrypted `.LLBAK`, plaintext `.json`, or `.csv`. The `.LLBAK` format is
  documented well enough to decrypt offline in Python, and the extension will
  hand you that script.
- **Export & Leave** — a proper exit: take a backup, wipe the local vault, and
  clear the copy your browser already synced to your other devices.
- **Local-only favicons by default** — site icons are drawn from the domain name
  on your machine. Fetching real favicons from Google is available in Settings
  and is opt-in, because the domain would travel in the request URL.

## Permissions

`storage`, `tabs`, `clipboardWrite`, `alarms` — and **no host permissions**.
See [PERMISSIONS.md](./PERMISSIONS.md).

## Install

Store listings are pending. Until then, load it unpacked:

```bash
npm install
npm run build:chrome
```

Then open `chrome://extensions`, enable **Developer mode**, choose **Load
unpacked**, and select `build/chrome-mv3-prod`.

[docs/installation.md](./docs/installation.md) covers Firefox, Edge, Brave,
Opera, and Safari.

## Development

```bash
npm install
npm run dev
```

Plasmo writes a live-reloading build to `build/edge-mv3-dev` (change the target
in the `dev` script for another browser). Load that directory unpacked.

### Build targets

```bash
npm run build:chrome
npm run build:edge
npm run build:brave
npm run build:opera
npm run build:firefox
npm run build:firefox-mv2
npm run build:safari
```

### Quality gates

```bash
npm test
npm run typecheck
npm run lint
```

`npm run test:coverage` produces a coverage report. Every push and pull request
to `main` runs the same gates via GitHub Actions
([`.github/workflows/ci.yml`](./.github/workflows/ci.yml)).

## Tech stack

| Layer | Choice |
| --- | --- |
| Extension framework | [Plasmo](https://www.plasmo.com/) 0.90, Manifest V3 |
| UI | React 18, TailwindCSS 3, Framer Motion 11, Lucide |
| Storage | `@plasmohq/storage` over `chrome.storage.local` / `.sync` / `.session` |
| Crypto | WebCrypto — AES-256-GCM, PBKDF2-HMAC-SHA256 (600k iterations), HMAC-SHA256 |
| Language | TypeScript 5.4, strict |
| Tests | Vitest 3 |

The injected overlay renders inside a **closed** Shadow DOM, so host-page CSS
cannot reach it, it cannot leak styles back into the page, and page script
cannot read the accounts it is showing you out of `host.shadowRoot`.

## Contributing

[CONTRIBUTING.md](./CONTRIBUTING.md) covers the setup, the architecture, and
what a change needs before it can land. Security issues go to
[SECURITY.md](./SECURITY.md), not the public issue tracker.

## License

Apache-2.0. See [LICENSE](./LICENSE).
