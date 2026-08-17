/**
 * The routes that get prerendered, and the `<head>` each one ships with.
 *
 * A single-page app serves one `index.html` with one title and one description
 * for every URL, so `/docs` and `/uninstall` were indexed — when they were
 * indexed at all — under the homepage's copy. Each entry here becomes its own
 * static HTML file with its own metadata.
 */

export const SITE_ORIGIN = 'https://loginlens.vkrishna04.me'

export interface RouteMeta {
  /** Router path, and the directory the file is written to. */
  path: string
  title: string
  description: string
  /** Left out of sitemap.xml when false — see `/uninstall`. */
  indexable: boolean
  /** Relative weight for sitemap.xml. */
  priority: string
}

export const ROUTES: RouteMeta[] = [
  {
    path: '/',
    title: 'LoginLens — Your Identity Vault. No Backend.',
    description:
      'LoginLens is an open-source browser extension that maps every account you have, tracks which ones sign in through Google, GitHub or Apple, and flags reused passwords. Your vault stays on your machine — no account, no backend, no telemetry.',
    indexable: true,
    priority: '1.0'
  },
  {
    path: '/docs',
    title: 'Documentation — LoginLens',
    description:
      'How LoginLens works: what it stores and where, the permissions it asks for and why, OAuth recording, CSV import, encrypted backups, and cross-browser installation.',
    indexable: true,
    priority: '0.8'
  },
  {
    path: '/decrypt',
    title: 'In-Browser Backup Decryptor — LoginLens',
    description:
      'Open an encrypted .LLBAK LoginLens backup with your passphrase. Decryption runs entirely in this page — there is no backend, and nothing is uploaded. Load the page, disconnect from the network, decrypt, download the JSON, then close the tab.',
    indexable: true,
    priority: '0.6'
  },
  {
    path: '/uninstall',
    title: "You've removed LoginLens",
    description:
      'LoginLens has been removed and everything it stored on this device went with it. If you had enabled encrypted browser sync, here is how to delete that copy from your other devices too.',
    // Nobody should arrive here from a search result — it is only meaningful
    // as the page the browser opens at the moment of an uninstall.
    indexable: false,
    priority: '0.1'
  }
]
