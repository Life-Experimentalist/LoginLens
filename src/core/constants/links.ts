/**
 * Every outbound URL the extension renders, in one place.
 *
 * These were previously typed as literals at each call site, which is how the
 * repo ended up with three different casings of the same GitHub path and an
 * exit page that linked to github.com's homepage. Anything user-facing that
 * points off-device belongs here.
 */

export const REPO_URL = 'https://github.com/Life-Experimentalist/LoginLens'
export const RELEASES_URL = `${REPO_URL}/releases`
export const ISSUES_URL = `${REPO_URL}/issues`
export const NEW_ISSUE_URL = `${REPO_URL}/issues/new/choose`
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`
export const SECURITY_URL = `${REPO_URL}/blob/main/SECURITY.md`

export const SITE_URL = 'https://loginlens.vkrishna04.me'
// Path routes, not hash routes: the site prerenders each page to its own
// index.html, so `/#/docs` would land on the home page and route client-side —
// which is the one thing a link handed to a search engine must not do.
export const DOCS_URL = `${SITE_URL}/docs`
export const UNINSTALL_URL = `${SITE_URL}/uninstall`
