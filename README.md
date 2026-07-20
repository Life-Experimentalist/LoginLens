# LoginLens

LoginLens is a purely local, zero-server browser extension that observes logins natively, maps aliases to a unified account ID, tracks login methods/vault locations, and projects this data directly onto webpages using an isolated Shadow DOM UI.

## Features

- **Local Only:** Zero servers, no tracking, complete privacy.
- **Shadow DOM Injection:** Prevents website CSS from bleeding into the extension UI.
- **AI Handlers:** Local polymorphic AI execution for tricky login pages.
- **Cross-Browser sync:** Utilizes `chrome.storage.sync` under the hood.

## Development

You can use `npm`, `yarn`, `pnpm`, or `bun` to develop LoginLens.

### Install dependencies

```bash
npm install
# or
pnpm install
```

### Start development server

```bash
npm run dev
# or
pnpm run dev
```

This will run `plasmo dev` which starts the HMR development server.

### Build for production

```bash
npm run build
# or
pnpm run build
```

This compiles the code into `build/chrome-mv3-prod` and `build/firefox-mv3-prod`.
