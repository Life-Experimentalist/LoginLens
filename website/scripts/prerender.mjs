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

  return html.replace(
    '<div id="root"></div>',
    `<div id="root">${appHtml}</div>`
  )
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
    indexable: false
  },
  render('/404-not-a-real-route')
)
await writeFile(join(dist, '404.html'), notFound, 'utf8')

const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...ROUTES.filter((r) => r.indexable).map((r) =>
    [
      '  <url>',
      `    <loc>${SITE_ORIGIN}${r.path === '/' ? '/' : r.path}</loc>`,
      `    <priority>${r.priority}</priority>`,
      '  </url>'
    ].join('\n')
  ),
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

console.log(`prerendered ${ROUTES.length} routes, 404.html, sitemap.xml, robots.txt`)
