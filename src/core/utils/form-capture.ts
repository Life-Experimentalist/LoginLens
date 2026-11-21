import { isLoginField } from './login-fields'

/**
 * Reads a submitted sign-in or sign-up form for the one thing LoginLens keeps
 * from it: the username. The password box is only ever asked whether it is
 * filled in, and its value is never read into a variable, a message or
 * storage.
 */

export interface SubmittedLogin {
  username: string
  /** True for a registration form, false for a plain sign-in. */
  signup: boolean
}

const MAX_USERNAME = 254

const visiblePasswords = (form: ParentNode): HTMLInputElement[] =>
  (Array.from(form.querySelectorAll('input[type="password"]')) as HTMLInputElement[]).filter(
    (el) => isLoginField(el)
  )

export function describeSubmittedLogin(form: HTMLFormElement): SubmittedLogin | null {
  const passwords = visiblePasswords(form)
  if (passwords.length === 0) return null
  // Nothing typed into any password box: a "show password" toggle or a
  // validation bounce, not a sign-in worth remembering.
  if (!passwords.some((p) => p.value.length > 0)) return null

  const inputs = Array.from(form.querySelectorAll('input')) as HTMLInputElement[]
  const field = inputs.find(
    (el) => el.type.toLowerCase() !== 'password' && isLoginField(el) && el.value.trim() !== ''
  )
  if (!field) return null

  const username = field.value.trim()
  if (username.length === 0 || username.length > MAX_USERNAME) return null

  const signup =
    passwords.length >= 2 ||
    passwords.some((p) =>
      (p.getAttribute('autocomplete') || '').toLowerCase().split(/\s+/).includes('new-password')
    )

  return { username, signup }
}
