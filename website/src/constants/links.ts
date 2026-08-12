/**
 * Every off-site URL the website links to.
 *
 * These were previously written out at each call site, and three of them ended
 * up under a repository owner that does not exist — links that looked right in
 * review and 404'd for every visitor who clicked them. Mirrors
 * `src/core/constants/links.ts` in the extension.
 */

export const REPO_URL = 'https://github.com/Life-Experimentalist/LoginLens'
export const RELEASES_URL = `${REPO_URL}/releases`
export const LATEST_RELEASE_URL = `${RELEASES_URL}/latest`
export const ISSUES_URL = `${REPO_URL}/issues`
export const NEW_ISSUE_URL = `${REPO_URL}/issues/new/choose`
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`
export const SECURITY_URL = `${REPO_URL}/blob/main/SECURITY.md`
export const PRIVACY_URL = `${REPO_URL}/blob/main/docs/privacy.md`
export const PERMISSIONS_URL = `${REPO_URL}/blob/main/PERMISSIONS.md`

export const SITE_URL = 'https://loginlens.vkrishna04.me'

/**
 * Spread onto every external anchor. `noreferrer` already implies `noopener`
 * in current browsers, but stating both keeps the intent explicit and covers
 * anything older.
 */
export const EXTERNAL_LINK_PROPS = {
  target: '_blank',
  rel: 'noopener noreferrer'
} as const
