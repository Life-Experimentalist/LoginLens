import type { PlasmoCSConfig } from 'plasmo'
import { describeSubmittedLogin } from '../core/utils/form-capture'
import { safeSendMessage } from '../core/utils/runtime'

export const config: PlasmoCSConfig = {
  matches: ['http://*/*', 'https://*/*'],
  all_frames: false
}

/**
 * Notices a sign-in or sign-up form being submitted and tells the background
 * which username was used. The password is never read: describeSubmittedLogin
 * only checks that its box is not empty. The background decides whether
 * capture is switched on and which site it was, from the tab's own URL.
 */
document.addEventListener(
  'submit',
  (event) => {
    const form = event.target
    if (!(form instanceof HTMLFormElement)) return
    try {
      const found = describeSubmittedLogin(form)
      if (found) safeSendMessage({ type: 'CAPTURE_LOGIN', ...found })
    } catch {
      // A page's odd markup must never break its own form submission.
    }
  },
  true
)
