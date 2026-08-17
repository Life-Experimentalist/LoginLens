import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getBrowserName } from '~/core/utils/browser'
import {
  getExtensionVersion,
  isExtensionContextValid,
  safeSendMessage
} from '~/core/utils/runtime'

// These helpers exist because content scripts outlive the extension that
// injected them. After a reload or an update the old script is still on the
// page with a dead `chrome` handle, and every call it makes throws
// "Extension context invalidated". Nothing here may propagate that to the page.

const chromeMock = () => (globalThis as any).chrome

describe('getExtensionVersion', () => {
  it('reads the version from the manifest', () => {
    expect(getExtensionVersion()).toBe('1.0.0')
  })

  it('falls back to 0.0.0 rather than throwing on a dead context', () => {
    // A hardcoded literal would be worse than wrong here: it would stamp a
    // plausible-looking version into an exported backup.
    vi.spyOn(chromeMock().runtime, 'getManifest').mockImplementation(() => {
      throw new Error('Extension context invalidated.')
    })

    expect(getExtensionVersion()).toBe('0.0.0')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })
})

describe('isExtensionContextValid', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('is true while the extension is alive', () => {
    expect(isExtensionContextValid()).toBe(true)
  })

  it('is false once the runtime id is gone', () => {
    // Chrome clears `runtime.id` on the orphaned context, which is the only
    // synchronous signal a content script gets.
    const original = chromeMock().runtime.id
    chromeMock().runtime.id = undefined
    try {
      expect(isExtensionContextValid()).toBe(false)
    } finally {
      chromeMock().runtime.id = original
    }
  })

  it('is false when reading the runtime throws', () => {
    const original = Object.getOwnPropertyDescriptor(chromeMock(), 'runtime')
    Object.defineProperty(chromeMock(), 'runtime', {
      configurable: true,
      get() {
        throw new Error('Extension context invalidated.')
      }
    })
    try {
      expect(isExtensionContextValid()).toBe(false)
    } finally {
      if (original) Object.defineProperty(chromeMock(), 'runtime', original)
    }
  })
})

describe('safeSendMessage', () => {
  let sendMessage: ReturnType<typeof vi.fn>

  beforeEach(() => {
    sendMessage = vi.fn()
    chromeMock().runtime.sendMessage = sendMessage
    chromeMock().runtime.lastError = undefined
  })

  it('delivers the response to the callback', () => {
    sendMessage.mockImplementation((_msg: any, cb: any) => cb({ ok: true }))
    const onResponse = vi.fn()

    safeSendMessage({ type: 'PING' }, onResponse)

    expect(sendMessage).toHaveBeenCalledWith({ type: 'PING' }, expect.any(Function))
    expect(onResponse).toHaveBeenCalledWith({ ok: true })
  })

  it('reports null instead of sending when the context is dead', () => {
    const original = chromeMock().runtime.id
    chromeMock().runtime.id = undefined
    const onResponse = vi.fn()

    try {
      safeSendMessage({ type: 'PING' }, onResponse)
    } finally {
      chromeMock().runtime.id = original
    }

    expect(sendMessage).not.toHaveBeenCalled()
    expect(onResponse).toHaveBeenCalledWith(null)
  })

  it('reports null when the service worker is asleep and sets lastError', () => {
    // "Could not establish connection. Receiving end does not exist." — the
    // normal case for an MV3 worker that has been evicted, not an error the
    // user should ever see.
    sendMessage.mockImplementation((_msg: any, cb: any) => {
      chromeMock().runtime.lastError = { message: 'Receiving end does not exist.' }
      cb(undefined)
      chromeMock().runtime.lastError = undefined
    })
    const onResponse = vi.fn()

    safeSendMessage({ type: 'PING' }, onResponse)

    expect(onResponse).toHaveBeenCalledWith(null)
  })

  it('reports null when sendMessage itself throws', () => {
    sendMessage.mockImplementation(() => {
      throw new Error('Extension context invalidated.')
    })
    const onResponse = vi.fn()

    expect(() => safeSendMessage({ type: 'PING' }, onResponse)).not.toThrow()
    expect(onResponse).toHaveBeenCalledWith(null)
  })

  it('does not throw when no callback is supplied', () => {
    sendMessage.mockImplementation(() => {
      throw new Error('Extension context invalidated.')
    })

    expect(() => safeSendMessage({ type: 'PING' })).not.toThrow()
  })
})

describe('getBrowserName', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator')

  function withUserAgent(userAgent: string | null) {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: userAgent === null ? undefined : { userAgent }
    })
  }

  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'navigator', original)
    else delete (globalThis as any).navigator
  })

  // Every Chromium fork claims to be Chrome, and Chrome claims to be Safari.
  // The checks are ordered most-specific-first, so these cases are really
  // testing that ordering.
  it('reads Edge before Chrome', () => {
    withUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'
    )

    expect(getBrowserName()).toBe('Edge')
  })

  it('reads Opera before Chrome', () => {
    withUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 OPR/117.0.0.0'
    )

    expect(getBrowserName()).toBe('Opera')
  })

  it('reads Chrome before Safari', () => {
    withUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    )

    expect(getBrowserName()).toBe('Chrome')
  })

  it('reads real Safari as Safari', () => {
    withUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15'
    )

    expect(getBrowserName()).toBe('Safari')
  })

  it('reads Firefox', () => {
    withUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0')

    expect(getBrowserName()).toBe('Firefox')
  })

  it('falls back to a neutral label for an unknown browser', () => {
    // This string is user-visible ("Remove from Your Browser"), so the fallback
    // has to read as a sentence rather than as a missing value.
    withUserAgent('Mozilla/5.0 (compatible; SomeNewBrowser/1.0)')

    expect(getBrowserName()).toBe('Your Browser')
  })

  it('falls back when there is no navigator at all', () => {
    withUserAgent(null)

    expect(getBrowserName()).toBe('Your Browser')
  })
})
