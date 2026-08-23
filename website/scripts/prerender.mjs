/**
 * Turns the client build into one static HTML file per route.
 *
 * The site was a plain SPA: every URL served the same shell with an empty
 * `<div id="root">`, so a crawler that does not execute JavaScript saw a blank
 * page, and every route shared the homepage's title and description. This runs
 * after `vite build` and `vite build --ssr`, renders each route to HTML, and
 * writes it with its own `<head>`. There is still no server at runtime — the
 * output is files.
 *
 * Run via `npm run build`.
 */
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const ssrEntry = join(root, 'dist-ssr', 'entry-server.js')

const { render, ROUTES, SITE_ORIGIN } = await import(
  pathToFileURL(ssrEntry).href
)

const template = await readFile(join(dist, 'index.html'), 'utf8')

if (!template.includes('<div id="root"></div>')) {
  throw new Error(
    'index.html no longer contains the empty <div id="root"></div> the prerender writes into'
  )
}

/** Escapes a value being placed inside a double-quoted HTML attribute. */
function attr(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Replaces the value of a single `<meta>` tag, matched on the attribute that
 * identifies it. Throws rather than silently no-opping if the tag is not in the
 * template — a metadata rewrite that quietly does nothing is how every page
 * ends up sharing the homepage's description.
 */
function setMeta(html, identifier, value) {
  const pattern = new RegExp(
    `(<meta\\s+${identifier}\\s+content=")[^"]*(")`,
    'i'
  )
  if (!pattern.test(html)) {
    throw new Error(`No <meta ${identifier}> in index.html to rewrite`)
  }
  return html.replace(pattern, `$1${attr(value)}$2`)
}

/**
 * Serialises the route's JSON-LD into `<script>` blocks.
 *
 * `<` is escaped because a value containing `</script>` would otherwise close
 * the block early — the same guard the FAQ schema on the landing page uses.
 */
function structuredDataTags(route) {
  return (route.structuredData ?? [])
    .map(
      (graph) =>
        `    <script type="application/ld+json">${JSON.stringify(graph).replace(
          /</g,
          '\\u003c'
        )}</script>`
    )
    .join('\n')
}

function buildPage(route, appHtml) {
  const canonical = `${SITE_ORIGIN}${route.path === '/' ? '/' : route.path}`

  let html = template
    .replace(/<title>[^<]*<\/title>/i, `<title>${attr(route.title)}</title>`)
    .replace(
      /(<link rel="canonical" href=")[^"]*(")/i,
      `$1${attr(canonical)}$2`
    )

  html = setMeta(html, 'name="title"', route.title)
  html = setMeta(html, 'name="description"', route.description)
  html = setMeta(html, 'property="og:title"', route.title)
  html = setMeta(html, 'property="og:description"', route.description)
  html = setMeta(html, 'property="og:url"', canonical)
  html = setMeta(html, 'name="twitter:title"', route.title)
  html = setMeta(html, 'name="twitter:description"', route.description)
  html = setMeta(html, 'name="twitter:url"', canonical)

  if (!route.indexable) {
    html = setMeta(html, 'name="robots"', 'noindex, follow')
  }

  const tags = structuredDataTags(route)
  if (tags) {
    if (!html.includes('</head>')) {
      throw new Error('No </head> in index.html to write structured data into')
    }
    html = html.replace('</head>', `${tags}\n  </head>`)
  }

  return html.replace(
    '<div id="root"></div>',
    `<div id="root">${appHtml}</div>`
  )
}

/**
 * The newest commit date across the files a page is rendered from, as
 * `YYYY-MM-DD`.
 *
 * Returns null rather than guessing when git cannot answer — an absent
 * `<lastmod>` costs nothing, while one that reports the build date on every
 * deploy teaches crawlers to ignore the field. That makes the depth of the
 * checkout matter: `.github/workflows/deploy-website.yml` fetches full history
 * for exactly this reason.
 */
function lastModified(sources) {
  const dates = (sources ?? [])
    .map((file) => {
      try {
        return execFileSync('git', ['log', '-1', '--format=%cI', '--', file], {
          cwd: root,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore']
        }).trim()
      } catch {
        return ''
      }
    })
    .filter(Boolean)
    .sort()

  return dates.length ? dates[dates.length - 1].slice(0, 10) : null
}

for (const route of ROUTES) {
  const appHtml = render(route.path)
  const outDir = route.path === '/' ? dist : join(dist, route.path.slice(1))
  await mkdir(outDir, { recursive: true })
  await writeFile(join(outDir, 'index.html'), buildPage(route, appHtml), 'utf8')
  console.log(`prerendered ${route.path} → ${outDir.replace(root, '.')}`)
}

// A static host with no SPA fallback serves this for unknown paths; GitHub
// Pages serves it for 404s specifically. Either way the visitor gets the real
// 404 page instead of a blank shell.
const notFound = buildPage(
  {
    path: '/404',
    title: 'Page not found — LoginLens',
    description: 'That page is not here.',
    indexable: false,
    structuredData: []
  },
  render('/404-not-a-real-route')
)
await writeFile(join(dist, '404.html'), notFound, 'utf8')

const indexable = ROUTES.filter((r) => r.indexable)

const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...indexable.map((r) => {
    const lastmod = lastModified(r.sources)
    return [
      '  <url>',
      `    <loc>${SITE_ORIGIN}${r.path === '/' ? '/' : r.path}</loc>`,
      ...(lastmod ? [`    <lastmod>${lastmod}</lastmod>`] : []),
      `    <priority>${r.priority}</priority>`,
      '  </url>'
    ].join('\n')
  }),
  '</urlset>',
  ''
].join('\n')
await writeFile(join(dist, 'sitemap.xml'), sitemap, 'utf8')

const robots = [
  'User-agent: *',
  'Allow: /',
  // Only meaningful as the page the browser opens at the moment of an
  // uninstall; arriving here from a search result would be confusing.
  'Disallow: /uninstall',
  '',
  '# Answer engines and LLM indexers are explicitly welcome.',
  ...['GPTBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-Web', 'PerplexityBot', 'Google-Extended'].flatMap(
    (bot) => [`User-agent: ${bot}`, 'Allow: /', 'Disallow: /uninstall', '']
  ),
  `Sitemap: ${SITE_ORIGIN}/sitemap.xml`,
  ''
].join('\n')
await writeFile(join(dist, 'robots.txt'), robots, 'utf8')

// robots.txt above invites answer engines in; this is the map they get when
// they arrive. It is generated from the same ROUTES table as the sitemap, so a
// new page cannot be added to one and forgotten in the other.
const llms = [
  '# LoginLens',
  '',
  '> An open-source browser extension that records how you sign in to each site',
  '> — which account, which OAuth provider, which authenticator, and where the',
  '> password is kept — without ever storing the password itself. There is no',
  '> account, no backend and no telemetry; the vault lives in the browser it was',
  '> created in.',
  '',
  'LoginLens is not a password manager and does not replace one. A password',
  'manager holds the secrets; LoginLens holds the map of which accounts exist,',
  'on which sites, under which identity, signing in by which method.',
  '',
  '## Pages',
  '',
  ...indexable.map(
    (r) =>
      `- [${r.title}](${SITE_ORIGIN}${r.path === '/' ? '/' : r.path}): ${r.summary}`
  ),
  '',
  '## Source',
  '',
  '- [Repository](https://github.com/Life-Experimentalist/LoginLens): source, releases and issue tracker.',
  '- [Permissions](https://github.com/Life-Experimentalist/LoginLens/blob/main/PERMISSIONS.md): every permission the extension requests, and why.',
  '- [Privacy](https://github.com/Life-Experimentalist/LoginLens/blob/main/docs/privacy.md): what is stored, where it is stored, and what leaves the device.',
  '- [License](https://github.com/Life-Experimentalist/LoginLens/blob/main/LICENSE): Apache 2.0.',
  ''
].join('\n')
await writeFile(join(dist, 'llms.txt'), llms, 'utf8')

console.log(
  `prerendered ${ROUTES.length} routes, 404.html, sitemap.xml, robots.txt, llms.txt`
)
