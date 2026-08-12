import type { PlasmoCSConfig } from 'plasmo'
import { getExtensionVersion } from '../core/utils/runtime'

export const config: PlasmoCSConfig = {
  matches: [
    'https://loginlens.vkrishna04.me/*',
    'https://*.vkrishna04.me/*',
    'http://localhost:*/*',
    'http://127.0.0.1:*/*'
  ],
  all_frames: false
}

// Read from the manifest rather than a literal — a hardcoded version here goes
// stale the moment package.json is bumped, and the landing page uses it to tell
// the user whether they need to update.
const VERSION = getExtensionVersion()

// 1. Inject DOM attribute on <html>
document.documentElement.setAttribute('data-loginlens-installed', 'true')
document.documentElement.setAttribute('data-loginlens-version', VERSION)

// 2. Dispatch custom event so the webpage JS can detect active extension instantly
function notifyWebpage() {
  window.dispatchEvent(
    new CustomEvent('LOGINLENS_EXTENSION_DETECTED', {
      detail: {
        installed: true,
        version: VERSION,
        timestamp: Date.now()
      }
    })
  )
}

notifyWebpage()

// Periodically re-emit event on request from the webpage
window.addEventListener('LOGINLENS_PING_REQUEST', () => {
  notifyWebpage()
})
