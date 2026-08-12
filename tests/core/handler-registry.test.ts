import { beforeEach, describe, expect, it, vi } from 'vitest'

import { HandlerRegistry, type ScraperHandler } from '~/core/scrapers/HandlerRegistry'

// Handlers run inside a content script injected into every http/https page, and
// they read identities out of page-controlled DOM before writing them into the
// vault. Which pages a handler runs on is therefore a trust boundary, not a
// convenience — these tests exist to keep it one.

function makeHandler(domains: string[]) {
  const execute = vi.fn(async () => {})
  const handler: ScraperHandler = { name: 'test-handler', domains, execute }
  return { handler, execute }
}

/** The registry is a module singleton, so each test starts from a clean list. */
function resetRegistry() {
  ;(HandlerRegistry as any).handlers = []
}

beforeEach(() => {
  resetRegistry()
})

describe('which pages a handler runs on', () => {
  it('runs on the exact domain', async () => {
    const { handler, execute } = makeHandler(['myaccount.google.com'])
    HandlerRegistry.register(handler)

    await HandlerRegistry.runMatchingHandlers(
      'https://myaccount.google.com/linkedapps'
    )

    expect(execute).toHaveBeenCalledOnce()
  })

  it('runs on a real subdomain', async () => {
    const { handler, execute } = makeHandler(['google.com'])
    HandlerRegistry.register(handler)

    await HandlerRegistry.runMatchingHandlers('https://myaccount.google.com/')

    expect(execute).toHaveBeenCalledOnce()
  })

  it('does NOT run on a lookalike that merely ends with the domain as a label', async () => {
    // `myaccount.google.com.example.net` is an ordinary domain anybody can
    // register. A substring test would hand it a handler written to trust
    // Google's own account page.
    const { handler, execute } = makeHandler(['myaccount.google.com'])
    HandlerRegistry.register(handler)

    await HandlerRegistry.runMatchingHandlers(
      'https://myaccount.google.com.example.net/linkedapps'
    )

    expect(execute).not.toHaveBeenCalled()
  })

  it('does NOT run on a domain that merely contains the target', async () => {
    const { handler, execute } = makeHandler(['google.com'])
    HandlerRegistry.register(handler)

    await HandlerRegistry.runMatchingHandlers('https://notgoogle.com/')

    expect(execute).not.toHaveBeenCalled()
  })

  it('does NOT run when the domain appears only in the path or query', async () => {
    const { handler, execute } = makeHandler(['myaccount.google.com'])
    HandlerRegistry.register(handler)

    await HandlerRegistry.runMatchingHandlers(
      'https://example.net/myaccount.google.com?x=myaccount.google.com'
    )

    expect(execute).not.toHaveBeenCalled()
  })

  it('does NOT run when the domain appears only in the userinfo', async () => {
    // `https://myaccount.google.com@evil.example/` is served by evil.example.
    const { handler, execute } = makeHandler(['myaccount.google.com'])
    HandlerRegistry.register(handler)

    await HandlerRegistry.runMatchingHandlers(
      'https://myaccount.google.com@evil.example/'
    )

    expect(execute).not.toHaveBeenCalled()
  })

  it('ignores case and a trailing root dot', async () => {
    const { handler, execute } = makeHandler(['myaccount.google.com'])
    HandlerRegistry.register(handler)

    await HandlerRegistry.runMatchingHandlers('https://MyAccount.Google.Com./')

    expect(execute).toHaveBeenCalledOnce()
  })
})

describe('robustness', () => {
  it('does not throw on a URL it cannot parse', async () => {
    const { handler, execute } = makeHandler(['google.com'])
    HandlerRegistry.register(handler)

    await expect(
      HandlerRegistry.runMatchingHandlers('not a url')
    ).resolves.toBeUndefined()
    expect(execute).not.toHaveBeenCalled()
  })

  it('lets the remaining handlers run when one throws', async () => {
    const failing: ScraperHandler = {
      name: 'failing',
      domains: ['example.com'],
      execute: vi.fn(async () => {
        throw new Error('handler blew up')
      })
    }
    const { handler: healthy, execute } = makeHandler(['example.com'])
    HandlerRegistry.register(failing)
    HandlerRegistry.register(healthy)

    await HandlerRegistry.runMatchingHandlers('https://example.com/')

    expect(execute).toHaveBeenCalledOnce()
  })

  it('runs nothing when no handler matches', async () => {
    const { handler, execute } = makeHandler(['example.com'])
    HandlerRegistry.register(handler)

    await HandlerRegistry.runMatchingHandlers('https://unrelated.test/')

    expect(execute).not.toHaveBeenCalled()
  })
})
