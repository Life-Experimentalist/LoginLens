import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Executable version of the promises in docs/privacy.md.
 *
 * Those promises — "no telemetry", "no network requests with default
 * settings", "remote favicons are opt-in" — are the entire reason someone
 * installs a tool like this. They are also invisible: nothing in the UI looks
 * different when a component quietly starts fetching something, which is
 * exactly how five separate views ended up requesting favicons from Google
 * regardless of the setting that was supposed to govern it.
 *
 * So they get asserted against the source rather than restated in prose.
 */

const SRC = path.resolve(__dirname, '..', 'src')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(entry) && !entry.endsWith('.d.ts') ? [full] : []
  })
}

const FILES = sourceFiles(SRC).map((file) => ({
  /** Repo-relative and forward-slashed, so failures read the same everywhere. */
  name: path.relative(SRC, file).split(path.sep).join('/'),
  text: readFileSync(file, 'utf8')
}))

describe('the source contains no way to phone home', () => {
  // Each pattern is the call itself, not the word — `// no fetch here` and
  // `prefetch` should not trip it.
  const NETWORK_APIS: Array<[string, RegExp]> = [
    ['fetch()', /(^|[^.\w])fetch\s*\(/],
    ['XMLHttpRequest', /new\s+XMLHttpRequest/],
    ['sendBeacon', /\.sendBeacon\s*\(/],
    ['WebSocket', /new\s+WebSocket/],
    ['EventSource', /new\s+EventSource/],
    ['importScripts', /importScripts\s*\(/]
  ]

  for (const [label, pattern] of NETWORK_APIS) {
    it(`never calls ${label}`, () => {
      const offenders = FILES.filter((f) => pattern.test(f.text)).map(
        (f) => f.name
      )
      expect(offenders).toEqual([])
    })
  }
})

describe('remote favicons stay opt-in', () => {
  // The favicon endpoint takes the domain in its query string, so a request to
  // it tells Google which sites the user keeps accounts for. Exactly one
  // component may reach it, because exactly one component reads the setting.
  const ALLOWED = 'components/ui/FaviconImage.tsx'

  // The query string is what makes it a request rather than a mention: the
  // settings page names `google.com/s2/favicons` in its explanatory copy, and
  // describing the endpoint is the opposite of calling it.
  const REQUEST = /s2\/favicons\?/

  it('is requested from one component and no other', () => {
    const offenders = FILES.filter(
      (f) => f.name !== ALLOWED && REQUEST.test(f.text)
    ).map((f) => f.name)

    // Anything listed here is fetching favicons without consulting
    // `favicon_source`, which makes docs/privacy.md wrong.
    expect(offenders).toEqual([])
  })

  it('is still reachable from that component, so the toggle does something', () => {
    const favicon = FILES.find((f) => f.name === ALLOWED)
    expect(favicon && REQUEST.test(favicon.text)).toBe(true)
    expect(favicon?.text).toContain('favicon_source')
  })

  it('sends no referrer with the request', () => {
    // Without this the request carries the extension's own origin, which tells
    // Google the lookup came from a password manager rather than from browsing.
    const favicon = FILES.find((f) => f.name === ALLOWED)
    expect(favicon?.text).toContain('referrerPolicy="no-referrer"')
  })
})

describe('no analytics or crash reporting', () => {
  const VENDORS = [
    'google-analytics',
    'googletagmanager',
    'sentry',
    'posthog',
    'mixpanel',
    'segment.com',
    'amplitude',
    'datadog',
    'bugsnag'
  ]

  for (const vendor of VENDORS) {
    it(`does not reference ${vendor}`, () => {
      const offenders = FILES.filter((f) =>
        f.text.toLowerCase().includes(vendor)
      ).map((f) => f.name)
      expect(offenders).toEqual([])
    })
  }
})
