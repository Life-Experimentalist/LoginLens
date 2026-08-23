# LoginLens website

The project site at **https://loginlens.vkrishna04.me** — React, Vite and
Tailwind, prerendered to static files and published to GitHub Pages by
[`deploy-website.yml`](../.github/workflows/deploy-website.yml).

It is a separate npm project from the extension. Run every command below from
this directory.

```bash
npm install
npm run dev      # Vite dev server
npm run build    # client build, SSR build, then prerender
npm run lint     # oxlint
```

## It is prerendered, not a SPA

`npm run build` runs three steps. Vite builds the client bundle, Vite builds
`src/entry-server.tsx` for SSR, and then [`scripts/prerender.mjs`](scripts/prerender.mjs)
renders each route to its own `index.html`.

The reason is the site's whole job: it explains what the extension does to
people who have not installed it. A plain SPA serves one shell with an empty
`<div id="root">` at every URL, so anything that does not execute JavaScript —
every crawler, every link preview — sees a blank page, and every route shares
the homepage's title and description.

There is still no server at runtime. The output is files.

## `src/routes.ts` is the single source of truth

Each entry there carries a route's title, description, and:

| Field            | What it drives                                                    |
| ---------------- | ----------------------------------------------------------------- |
| `indexable`      | `noindex` on the page, and omission from `sitemap.xml`             |
| `priority`       | The sitemap's relative weight                                      |
| `sources`        | Files whose newest commit date becomes the page's `<lastmod>`      |
| `summary`        | The page's line in `llms.txt`                                      |
| `structuredData` | The JSON-LD written into that page's `<head>`                      |

Structured data is per route on purpose. One copy in `index.html` would put the
homepage's "this page **is** the extension" claim on `/docs` and `/decrypt`
too — a `SoftwareApplication` advertising a `url` that is not the page's own
canonical. So only `/` describes the extension; `/docs` is a `TechArticle` and
`/decrypt` a `WebApplication`, each with a breadcrumb back to the homepage, and
`/uninstall` — which is `noindex` — emits none at all. `npm run dev` therefore
serves no JSON-LD; the prerendered files are what ships.

`<lastmod>` comes from git rather than the clock. A build-time stamp says
"everything changed" on every deploy, which is the fastest way to have a
crawler stop believing the field — so the workflows check out full history
(`fetch-depth: 0`), and the stamp is dropped entirely rather than guessed when
git cannot answer.

The build also generates `sitemap.xml`, `robots.txt`, `llms.txt` and `404.html`
from the same table, so a new page cannot be added to one and forgotten in
another.

## `scripts/assert-build.sh`

Run after a build, by CI on pull requests and by the deploy workflow against
the exact tree it is about to publish. It fails if a page shipped an empty
root, if `sitemap.xml`, `robots.txt`, `llms.txt` or `CNAME` is missing, if the
sitemap has no `<lastmod>`, if `/uninstall` lost its `noindex`, or if `/docs`
has started claiming to be the extension.

A regression that turns the build back into a SPA is invisible in a browser —
React hydrates and the page looks right — and total for everything else.

## `public/CNAME`

Pages drops the custom domain when this file is absent, which silently moves
the site to `*.github.io` and breaks every published link to it. The custom
domain also has to be set on the repository's Pages settings; the file alone
is not enough for a workflow-based deploy.

Because the site is served from the root of that domain, the build uses the
default base of `/`. Building with `base=/LoginLens/` would 404 every asset.
