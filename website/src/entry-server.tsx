import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { AppShell } from './App'

// Re-exported so the prerender script has one import for both the renderer and
// the route table, and cannot drift from the routes the app actually declares.
export { ROUTES, SITE_ORIGIN, type RouteMeta } from './routes'

/**
 * Build-time entry. `scripts/prerender.mjs` imports this once per route and
 * writes the result into the HTML template, so a crawler — and anyone on a slow
 * connection — gets the full page before a single byte of JavaScript executes.
 *
 * There is no server at runtime: the output is plain static files.
 */
export function render(url: string): string {
  return renderToString(
    <StrictMode>
      <StaticRouter location={url}>
        <AppShell />
      </StaticRouter>
    </StrictMode>
  )
}
