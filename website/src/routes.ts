/**
 * The routes that get prerendered, and the `<head>` each one ships with.
 *
 * A single-page app serves one `index.html` with one title and one description
 * for every URL, so `/docs` and `/uninstall` were indexed — when they were
 * indexed at all — under the homepage's copy. Each entry here becomes its own
 * static HTML file with its own metadata, its own structured data, its own
 * sitemap entry and its own line in `llms.txt`.
 *
 * Nothing here reaches the browser bundle: `entry-server.tsx` is the only
 * importer, and it runs at build time.
 */

export const SITE_ORIGIN = 'https://loginlens.vkrishna04.me'

const REPO_URL = 'https://github.com/Life-Experimentalist/LoginLens'

/** Referenced by `@id` from every other node, so it is described once. */
const PUBLISHER_ID = `${SITE_ORIGIN}/#publisher`
const WEBSITE_ID = `${SITE_ORIGIN}/#website`
const APP_ID = `${SITE_ORIGIN}/#app`

export interface RouteMeta {
  /** Router path, and the directory the file is written to. */
  path: string
  title: string
  description: string
  /** Left out of sitemap.xml when false — see `/uninstall`. */
  indexable: boolean
  /** Relative weight for sitemap.xml. */
  priority: string
  /**
   * Source files this page is rendered from, relative to `website/`. Their
   * newest commit date becomes the page's `<lastmod>`, so the sitemap reports
   * when the *content* last changed rather than when the site was last built —
   * a build-time stamp says "everything changed" on every deploy, which is the
   * fastest way to have a crawler stop believing the field.
   */
  sources: string[]
  /** One line per page in `llms.txt`, for answer engines reading the site. */
  summary: string
  /**
   * JSON-LD written into this page's `<head>`. Only the homepage describes the
   * extension itself; a `/docs` page claiming to *be* the SoftwareApplication
   * — at a `url` that is not its own canonical — is a claim search engines are
   * right to distrust.
   */
  structuredData: object[]
}

export const ROUTES: RouteMeta[] = [
  {
    path: '/',
    title: 'LoginLens — Your Identity Vault. No Backend.',
    description:
      'LoginLens is an open-source browser extension that maps every account you have, tracks which ones sign in through Google, GitHub or Apple, and flags reused passwords. Your vault stays on your machine — no account, no backend, no telemetry.',
    indexable: true,
    priority: '1.0',
    sources: ['src/pages/LandingPage.tsx', 'src/components/ExtensionDetector.tsx'],
    summary:
      'What LoginLens is, what it records, how it installs on each browser, and the questions people ask before installing it.',
    structuredData: [
      {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'Organization',
            '@id': PUBLISHER_ID,
            name: 'Life Experimentalist',
            url: 'https://github.com/Life-Experimentalist'
          },
          {
            '@type': 'WebSite',
            '@id': WEBSITE_ID,
            name: 'LoginLens',
            url: `${SITE_ORIGIN}/`,
            inLanguage: 'en',
            publisher: { '@id': PUBLISHER_ID }
          },
          {
            '@type': 'SoftwareApplication',
            '@id': APP_ID,
            name: 'LoginLens',
            operatingSystem: 'Chrome, Edge, Firefox, Brave, Opera',
            applicationCategory: 'SecurityApplication',
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            description:
              'Open-source browser extension that maps which account, which OAuth provider and which authenticator you use on every site. No account, no backend, no telemetry — it never stores a password.',
            url: `${SITE_ORIGIN}/`,
            softwareVersion: '1.0.0',
            isAccessibleForFree: true,
            codeRepository: REPO_URL,
            sameAs: [REPO_URL],
            author: { '@id': PUBLISHER_ID },
            publisher: { '@id': PUBLISHER_ID },
            license: `${REPO_URL}/blob/main/LICENSE`,
            featureList: [
              'Records which account and which sign-in method you used on each site',
              'Groups a site with its parent, sibling and linked domains',
              'Notes where each password is kept without storing the password',
              'Tracks which authenticator or passkey guards each account',
              'Flags reused passwords by comparing keyed fingerprints',
              'Encrypted local backup and an in-browser decryptor'
            ],
            isPartOf: { '@id': WEBSITE_ID }
          }
        ]
      }
    ]
  },
  {
    path: '/docs',
    title: 'Documentation — LoginLens',
    description:
      'How LoginLens works: what it stores and where, the permissions it asks for and why, OAuth recording, CSV import, encrypted backups, and cross-browser installation.',
    indexable: true,
    priority: '0.8',
    sources: ['src/pages/DocsPage.tsx'],
    summary:
      'Technical reference: the zero-server architecture, the storage model, every permission and its reason, OAuth capture, CSV import, and the backup format.',
    structuredData: [
      {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        '@id': `${SITE_ORIGIN}/docs#article`,
        headline: 'LoginLens Documentation',
        description:
          'How LoginLens works: what it stores and where, the permissions it asks for and why, OAuth recording, CSV import, encrypted backups, and cross-browser installation.',
        url: `${SITE_ORIGIN}/docs`,
        inLanguage: 'en',
        isPartOf: { '@id': WEBSITE_ID },
        about: { '@id': APP_ID },
        author: { '@id': PUBLISHER_ID },
        publisher: { '@id': PUBLISHER_ID },
        license: `${REPO_URL}/blob/main/LICENSE`
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'LoginLens',
            item: `${SITE_ORIGIN}/`
          },
          { '@type': 'ListItem', position: 2, name: 'Documentation' }
        ]
      }
    ]
  },
  {
    path: '/decrypt',
    title: 'In-Browser Backup Decryptor — LoginLens',
    description:
      'Open an encrypted .LLBAK LoginLens backup with your passphrase. Decryption runs entirely in this page — there is no backend, and nothing is uploaded. Load the page, disconnect from the network, decrypt, download the JSON, then close the tab.',
    indexable: true,
    priority: '0.6',
    sources: ['src/pages/DecryptPage.tsx', 'src/utils/crypto.ts'],
    summary:
      'A tool page that opens an encrypted .LLBAK backup with its passphrase. It runs in the page and works with the network disconnected — nothing is uploaded.',
    structuredData: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        '@id': `${SITE_ORIGIN}/decrypt#tool`,
        name: 'LoginLens Backup Decryptor',
        url: `${SITE_ORIGIN}/decrypt`,
        applicationCategory: 'SecurityApplication',
        browserRequirements:
          'Requires a browser with JavaScript and the Web Crypto API',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        isAccessibleForFree: true,
        inLanguage: 'en',
        description:
          'Opens an encrypted .LLBAK LoginLens backup with your passphrase. Decryption runs entirely in the page; the file is never uploaded.',
        isPartOf: { '@id': WEBSITE_ID },
        about: { '@id': APP_ID },
        publisher: { '@id': PUBLISHER_ID }
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'LoginLens',
            item: `${SITE_ORIGIN}/`
          },
          { '@type': 'ListItem', position: 2, name: 'Backup Decryptor' }
        ]
      }
    ]
  },
  {
    path: '/uninstall',
    title: "You've removed LoginLens",
    description:
      'LoginLens has been removed and everything it stored on this device went with it. If you had enabled encrypted browser sync, here is how to delete that copy from your other devices too.',
    // Nobody should arrive here from a search result — it is only meaningful
    // as the page the browser opens at the moment of an uninstall.
    indexable: false,
    priority: '0.1',
    sources: ['src/pages/UninstallPage.tsx'],
    summary: '',
    // A page told not to be indexed has nothing to gain from structured data,
    // and every reason not to advertise itself.
    structuredData: []
  }
]
