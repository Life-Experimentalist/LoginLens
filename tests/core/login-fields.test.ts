// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  findLoginField,
  findProviderButton,
  isLoginField,
  orderAccounts,
  setNativeValue
} from '~/core/utils/login-fields'

const input = (attrs: Record<string, string>) => {
  const el = document.createElement('input')
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  document.body.appendChild(el)
  return el
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('isLoginField', () => {
  it('accepts a password field', () => {
    expect(isLoginField(input({ type: 'password' }))).toBe(true)
  })

  it('accepts a field the site marks autocomplete=username', () => {
    expect(isLoginField(input({ type: 'text', name: 'q7', autocomplete: 'username' }))).toBe(true)
  })

  it('accepts identifier and uname style names', () => {
    expect(isLoginField(input({ type: 'text', name: 'identifier' }))).toBe(true)
  })

  it('ignores a newsletter box', () => {
    expect(isLoginField(input({ type: 'text', name: 'newsletter' }))).toBe(false)
  })

  it('ignores a tel field unless it is marked as the username', () => {
    expect(isLoginField(input({ type: 'tel', name: 'phone' }))).toBe(false)
  })

  it('ignores hidden, display:none and disabled inputs', () => {
    expect(isLoginField(input({ type: 'password', hidden: '' }))).toBe(false)
    expect(isLoginField(input({ type: 'password', style: 'display:none' }))).toBe(false)
    expect(isLoginField(input({ type: 'password', disabled: '' }))).toBe(false)
    expect(isLoginField(input({ type: 'hidden', name: 'user' }))).toBe(false)
  })
})

describe('findLoginField', () => {
  it('skips a hidden honeypot and returns the real field', () => {
    input({ type: 'text', name: 'email', style: 'display:none' })
    const real = input({ type: 'email', name: 'email' })
    expect(findLoginField(document)).toBe(real)
  })
})

describe('setNativeValue', () => {
  it('updates the value and fires input and change', () => {
    const el = input({ type: 'text' })
    const onInput = vi.fn()
    const onChange = vi.fn()
    el.addEventListener('input', onInput)
    el.addEventListener('change', onChange)
    setNativeValue(el, 'me@example.com')
    expect(el.value).toBe('me@example.com')
    expect(onInput).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledOnce()
  })

  it('still notifies a framework that shadows the value property on the instance', () => {
    const el = input({ type: 'text' })
    // React installs an instance-level value tracker like this one.
    let tracked = ''
    Object.defineProperty(el, 'value', {
      configurable: true,
      get: () => tracked,
      set: (v: string) => {
        tracked = v
      }
    })
    const seen: string[] = []
    el.addEventListener('input', () => seen.push(Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.get!.call(el)))
    setNativeValue(el, 'abc')
    // The real DOM value changed even though the instance tracker did not.
    expect(seen).toEqual(['abc'])
    expect(tracked).toBe('')
  })
})

describe('orderAccounts', () => {
  const acc = (id: string, extra: object = {}) =>
    ({ id, identities: [id], login_method: { type: 'password' }, updated_at: 0, ...extra }) as any

  it('puts pinned first, then auto-pinned, then newest', () => {
    const out = orderAccounts([
      acc('old', { updated_at: 1 }),
      acc('new', { updated_at: 9 }),
      acc('auto', { auto_pinned: true }),
      acc('pin', { pinned: true })
    ])
    expect(out.map((a) => a.id)).toEqual(['pin', 'auto', 'new', 'old'])
  })

  it('does not mutate its input', () => {
    const list = [acc('a', { updated_at: 1 }), acc('b', { updated_at: 2 })]
    orderAccounts(list)
    expect(list.map((a) => a.id)).toEqual(['a', 'b'])
  })
})

describe('findProviderButton', () => {
  it('finds a Continue with Google button', () => {
    document.body.innerHTML =
      '<button>Sign in</button><button id="g">Continue with Google</button>'
    expect(findProviderButton(document, 'google.com')?.id).toBe('g')
  })

  it('matches on aria-label and is case-insensitive', () => {
    document.body.innerHTML = '<a role="button" aria-label="Log in with GITHUB" id="gh"></a>'
    expect(findProviderButton(document, 'github.com')?.id).toBe('gh')
  })

  it('returns null when the page offers no such button', () => {
    document.body.innerHTML = '<button>Sign in</button>'
    expect(findProviderButton(document, 'google.com')).toBeNull()
  })
})
