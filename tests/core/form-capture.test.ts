// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { describeSubmittedLogin } from '~/core/utils/form-capture'

const form = (html: string) => {
  document.body.innerHTML = `<form>${html}</form>`
  return document.querySelector('form') as HTMLFormElement
}
const fill = (sel: string, v: string) => ((document.querySelector(sel) as HTMLInputElement).value = v)

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('describeSubmittedLogin', () => {
  it('returns the username of a sign-in and not the password', () => {
    const f = form('<input name="email"><input type="password">')
    fill('[name=email]', ' me@x.com ')
    fill('[type=password]', 'hunter2')
    const out = describeSubmittedLogin(f)
    expect(out).toEqual({ username: 'me@x.com', signup: false })
    expect(JSON.stringify(out)).not.toContain('hunter2')
  })

  it('treats two password boxes as a sign-up', () => {
    const f = form('<input name="user"><input type="password"><input type="password">')
    fill('[name=user]', 'bob')
    document.querySelectorAll<HTMLInputElement>('[type=password]').forEach((p) => (p.value = 'x'))
    expect(describeSubmittedLogin(f)?.signup).toBe(true)
  })

  it('treats autocomplete=new-password as a sign-up', () => {
    const f = form('<input name="user"><input type="password" autocomplete="new-password">')
    fill('[name=user]', 'bob')
    fill('[type=password]', 'x')
    expect(describeSubmittedLogin(f)?.signup).toBe(true)
  })

  it('ignores a form with no password box, an empty one, or no username', () => {
    expect(describeSubmittedLogin(form('<input name="email" value="a@b.c">'))).toBeNull()
    const empty = form('<input name="email"><input type="password">')
    fill('[name=email]', 'a@b.c')
    expect(describeSubmittedLogin(empty)).toBeNull()
    const none = form('<input type="password">')
    fill('[type=password]', 'x')
    expect(describeSubmittedLogin(none)).toBeNull()
  })

  it('rejects an absurdly long username', () => {
    const f = form('<input name="email"><input type="password">')
    fill('[name=email]', 'a'.repeat(300))
    fill('[type=password]', 'x')
    expect(describeSubmittedLogin(f)).toBeNull()
  })
})
