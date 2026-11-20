import type { IdentityProfile } from '../storage/schema'
import { normalizeOAuthProvider } from './domain'

/**
 * Login form helpers for the on-page dock. They take a Document or Element, so
 * they run under jsdom in tests and carry no extension API.
 */

const isRendered = (el: HTMLElement): boolean => {
  if (el.hidden) return false
  const style = el.ownerDocument.defaultView?.getComputedStyle(el)
  if (style && (style.display === 'none' || style.visibility === 'hidden')) {
    return false
  }
  return true
}

/**
 * The one place that decides whether an input is part of a login.
 *
 * `autocomplete` comes first because it is the site saying, in so many words,
 * what the field is for. Guessing from `name` and `id` alone missed every
 * field called `identifier` or `uname`, and matched hidden honeypot inputs.
 */
export const isLoginField = (input: HTMLInputElement): boolean => {
  const type = input.type.toLowerCase()
  if (type === 'hidden' || input.disabled || !isRendered(input)) return false
  if (type === 'password') return true
  if (type !== 'text' && type !== 'email' && type !== 'tel') return false

  const hint = (input.getAttribute('autocomplete') || '').toLowerCase()
  if (hint.split(/\s+/).includes('username')) return true
  if (type === 'tel') return false

  const name = input.name.toLowerCase()
  const id = input.id.toLowerCase()
  return ['user', 'email', 'login', 'identifier', 'account'].some(
    (word) => name.includes(word) || id.includes(word)
  )
}

export const findLoginField = (root: Document | Element): HTMLInputElement | null => {
  const inputs = Array.from(root.querySelectorAll('input')) as HTMLInputElement[]
  return inputs.find(isLoginField) ?? null
}

/**
 * Sets a value the way a keystroke would. Assigning `input.value` directly
 * does not reach a React-controlled input: React tracks the last value it
 * wrote and drops an input event whose value looks unchanged, so the box
 * showed the username and the form state stayed empty. The prototype setter
 * bypasses that tracking.
 */
export const setNativeValue = (input: HTMLInputElement, value: string): void => {
  const proto = Object.getPrototypeOf(input)
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  if (setter) setter.call(input, value)
  else input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

/**
 * Where the dock lists accounts: manual pin, then auto pin, then the one
 * touched most recently. The vault's storage order is insertion order, which
 * put the account used daily below one imported two years ago.
 */
export const orderAccounts = (accounts: IdentityProfile[]): IdentityProfile[] =>
  [...accounts].sort(
    (a, b) =>
      Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
      Number(Boolean(b.auto_pinned)) - Number(Boolean(a.auto_pinned)) ||
      (b.updated_at ?? 0) - (a.updated_at ?? 0)
  )

/**
 * Finds the "Continue with Google" style control for an OAuth login. The dock
 * highlights it rather than clicking it: signing in is the user's act, and the
 * question LoginLens answers is only "which one did I use here".
 */
export const findProviderButton = (
  root: Document | Element,
  provider: string
): HTMLElement | null => {
  const key = normalizeOAuthProvider(provider).split('.')[0]
  if (!key) return null
  const candidates = Array.from(
    root.querySelectorAll('button, a, [role="button"], input[type="submit"]')
  ) as HTMLElement[]
  return (
    candidates.find((el) => {
      if (!isRendered(el)) return false
      const text = [
        el.textContent,
        el.getAttribute('aria-label'),
        el.getAttribute('title'),
        el.getAttribute('data-provider'),
        el.id,
        typeof el.className === 'string' ? el.className : ''
      ]
        .join(' ')
        .toLowerCase()
      return text.includes(key)
    }) ?? null
  )
}
