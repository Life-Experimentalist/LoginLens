import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dispatchMessage, peekStore } from '../helpers/chrome-mock'

/**
 * The service worker registers its listeners at import time, and the test
 * harness clears every listener between tests. So each test re-imports it with
 * a fresh module registry — which also re-runs the storage sanitizer, letting
 * us plant a vault first and assert on what survives.
 */
async function loadServiceWorker() {
  vi.resetModules()
  await import('~/background')
  // The sanitizer is a floating async IIFE; give it its turns.
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
}

/** Writes straight into the backing map, the way a real profile on disk is. */
function plantRaw(key: string, raw: string) {
  peekStore('local').set(key, raw)
}

function readRaw(key: string) {
  return peekStore('local').get(key)
}

function sessionState(tabId: number) {
  return peekStore('session').get(`ll_tab_${tabId}`)
}

const VAULT = [
  {
    domain: 'example.com',
    accounts: [
      {
        id: 'a1',
        label: 'Personal',
        identities: ['me@example.com'],
        login_method: { type: 'password' },
        updated_at: 1
      }
    ]
  }
]

describe('storage sanitizer', () => {
  it('repairs a key whose entire value is the corruption sentinel', async () => {
    plantRaw('saved_accounts', '[object Object]')
    await loadServiceWorker()

    // Repaired to an empty array rather than removed: the views iterate this
    // key, and a missing one and an empty one have to behave the same.
    expect(JSON.parse(readRaw('saved_accounts'))).toEqual([])
  })

  it('tolerates the extra quotes a stringifying storage layer adds', async () => {
    plantRaw('oauth_registry', '"[object Object]"')
    await loadServiceWorker()

    expect(JSON.parse(readRaw('oauth_registry'))).toEqual([])
  })

  it('removes a corrupted key that is not one of the known arrays', async () => {
    plantRaw('some_scalar_setting', '[object Object]')
    await loadServiceWorker()

    expect(peekStore('local').has('some_scalar_setting')).toBe(false)
  })

  it('does not wipe a vault that merely contains the sentinel text', async () => {
    // The whole key is stored as one JSON string, so a substring test here
    // matches any note a user is perfectly entitled to type — and the repair
    // it triggers would destroy every account they have.
    const withNote = [
      {
        ...VAULT[0],
        accounts: [
          {
            ...VAULT[0].accounts[0],
            notes: 'their support page just renders [object Object]'
          }
        ]
      }
    ]
    plantRaw('saved_accounts', JSON.stringify(withNote))
    await loadServiceWorker()

    expect(JSON.parse(readRaw('saved_accounts'))).toEqual(withNote)
  })

  it('leaves a healthy vault byte-identical', async () => {
    const raw = JSON.stringify(VAULT)
    plantRaw('saved_accounts', raw)
    await loadServiceWorker()

    expect(readRaw('saved_accounts')).toBe(raw)
  })
})

describe('message routing', () => {
  beforeEach(async () => {
    await loadServiceWorker()
  })

  it('ignores a message from a sender that is not this extension', async () => {
    await chrome.storage.session.set({
      ll_tab_7: {
        originDomain: 'bank.example',
        currentDomain: 'bank.example',
        isOnOAuthPage: false,
        updatedAt: Date.now()
      }
    })

    const reply = await dispatchMessage(
      { type: 'GET_TAB_CONTEXT' },
      { id: 'some-other-extension', tab: { id: 7 } }
    )

    expect(reply).toBeUndefined()
  })

  it('answers GET_TAB_CONTEXT with the origin domain, not the current URL', async () => {
    await chrome.storage.session.set({
      ll_tab_3: {
        originDomain: 'dash.cloudflare.com',
        currentDomain: 'accounts.google.com',
        isOnOAuthPage: true,
        updatedAt: Date.now()
      }
    })

    const reply = await dispatchMessage({ type: 'GET_TAB_CONTEXT' }, { tab: { id: 3 } })

    expect(reply).toEqual({ effectiveDomain: 'dash.cloudflare.com' })
  })

  it('will not let a content script read another tab’s context', async () => {
    // Honouring message.tabId from a content script would let a script on any
    // page ask what site the user came from in an unrelated tab.
    await chrome.storage.session.set({
      ll_tab_1: {
        originDomain: 'attacker.example',
        currentDomain: 'attacker.example',
        isOnOAuthPage: false,
        updatedAt: Date.now()
      },
      ll_tab_2: {
        originDomain: 'bank.example',
        currentDomain: 'bank.example',
        isOnOAuthPage: false,
        updatedAt: Date.now()
      }
    })

    const reply = await dispatchMessage(
      { type: 'GET_TAB_CONTEXT', tabId: 2 },
      { tab: { id: 1 } }
    )

    expect(reply).toEqual({ effectiveDomain: 'attacker.example' })
  })

  it('lets an extension page ask about a specific tab', async () => {
    // The popup has no sender.tab, and asking about the tab it is rendered over
    // is the entire reason this message exists.
    await chrome.storage.session.set({
      ll_tab_9: {
        originDomain: 'bank.example',
        currentDomain: 'bank.example',
        isOnOAuthPage: false,
        updatedAt: Date.now()
      }
    })

    const reply = await dispatchMessage({ type: 'GET_TAB_CONTEXT', tabId: 9 })

    expect(reply).toEqual({ effectiveDomain: 'bank.example' })
  })

  it('answers null for a tab it has never tracked', async () => {
    const reply = await dispatchMessage({ type: 'GET_TAB_CONTEXT' }, { tab: { id: 404 } })
    expect(reply).toBeNull()
  })

  it('expires tab context that is older than the session TTL', async () => {
    await chrome.storage.session.set({
      ll_tab_5: {
        originDomain: 'bank.example',
        currentDomain: 'bank.example',
        isOnOAuthPage: false,
        updatedAt: Date.now() - 31 * 60 * 1000
      }
    })

    const reply = await dispatchMessage({ type: 'GET_TAB_CONTEXT' }, { tab: { id: 5 } })

    expect(reply).toBeNull()
    expect(sessionState(5)).toBeUndefined()
  })

  it('ignores a malformed message with no type', async () => {
    await expect(dispatchMessage({ nope: true }, { tab: { id: 1 } })).resolves.toBeUndefined()
    await expect(dispatchMessage(null, { tab: { id: 1 } })).resolves.toBeUndefined()
  })
})

describe('SET_OAUTH_IDENTITY', () => {
  beforeEach(async () => {
    await loadServiceWorker()
    await chrome.storage.session.set({
      ll_tab_1: {
        originDomain: 'dash.cloudflare.com',
        currentDomain: 'accounts.google.com',
        isOnOAuthPage: true,
        updatedAt: Date.now()
      }
    })
  })

  async function send(identity: unknown) {
    await dispatchMessage({ type: 'SET_OAUTH_IDENTITY', identity }, { tab: { id: 1 } })
    await new Promise((r) => setTimeout(r, 0))
  }

  it('records an identity scraped on an OAuth page', async () => {
    await send('me@example.com')
    expect(sessionState(1).oauthIdentity).toBe('me@example.com')
  })

  it('rejects an identity too long to be an address', async () => {
    // It is scraped from page-controlled DOM — on Microsoft it is a whole
    // element's textContent — and lands in a key mirrored into
    // chrome.storage.sync, which has an 8KB per-item cap. One oversized value
    // there breaks sync for the entire vault.
    await send('a'.repeat(400) + '@example.com')
    expect(sessionState(1).oauthIdentity).toBeUndefined()
  })

  it('rejects a non-string identity', async () => {
    await send({ toString: () => 'me@example.com' })
    expect(sessionState(1).oauthIdentity).toBeUndefined()
  })

  it('ignores an identity reported for a tab that is not on an OAuth page', async () => {
    await chrome.storage.session.set({
      ll_tab_2: {
        originDomain: 'blog.example',
        currentDomain: 'blog.example',
        isOnOAuthPage: false,
        updatedAt: Date.now()
      }
    })

    await dispatchMessage(
      { type: 'SET_OAUTH_IDENTITY', identity: 'me@example.com' },
      { tab: { id: 2 } }
    )
    await new Promise((r) => setTimeout(r, 0))

    expect(sessionState(2).oauthIdentity).toBeUndefined()
  })

  it('does not hold the response channel open', async () => {
    // Returning `true` without ever calling sendResponse leaves the sender's
    // callback waiting on a port that is never answered.
    const listener = chrome.runtime.onMessage._listeners[0]
    const kept = listener(
      { type: 'SET_OAUTH_IDENTITY', identity: 'me@example.com' },
      { id: chrome.runtime.id, tab: { id: 1 } },
      () => undefined
    )
    expect(kept).toBe(false)
  })
})

describe('navigation tracking', () => {
  beforeEach(async () => {
    await loadServiceWorker()
  })

  it('ignores browser-internal pages', async () => {
    await chrome.tabs._navigate(1, 'chrome://extensions')
    await chrome.tabs._navigate(1, 'chrome-extension://abc/tabs/vault.html')
    await chrome.tabs._navigate(1, 'about:blank')

    expect(sessionState(1)).toBeUndefined()
  })

  it('tracks an ordinary navigation under its own domain', async () => {
    await chrome.tabs._navigate(1, 'https://www.example.com/login')

    expect(sessionState(1)).toMatchObject({
      originDomain: 'example.com',
      currentDomain: 'example.com',
      isOnOAuthPage: false
    })
  })

  it('keeps the port for a localhost dev server', async () => {
    await chrome.tabs._navigate(1, 'http://localhost:3000/login')
    expect(sessionState(1).currentDomain).toBe('localhost:3000')
  })

  it('remembers where the user came from across an OAuth hop', async () => {
    await chrome.tabs._navigate(1, 'https://dash.cloudflare.com/login')
    await chrome.tabs._navigate(
      1,
      'https://accounts.google.com/o/oauth2/v2/auth?client_id=1&redirect_uri=https%3A%2F%2Fdash.cloudflare.com%2Fcb'
    )

    expect(sessionState(1)).toMatchObject({
      originDomain: 'dash.cloudflare.com',
      isOnOAuthPage: true
    })
  })

  it('queues a capture when the flow lands back on the origin', async () => {
    await chrome.tabs._navigate(1, 'https://dash.cloudflare.com/login')
    await chrome.tabs._navigate(
      1,
      'https://accounts.google.com/o/oauth2/v2/auth?client_id=1&redirect_uri=https%3A%2F%2Fdash.cloudflare.com%2Fcb'
    )
    await dispatchMessage(
      { type: 'SET_OAUTH_IDENTITY', identity: 'me@example.com' },
      { tab: { id: 1 } }
    )
    await new Promise((r) => setTimeout(r, 0))
    await chrome.tabs._navigate(1, 'https://dash.cloudflare.com/home')

    const pending = JSON.parse(readRaw('pending_oauth_captures'))
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({
      provider: 'google.com',
      identity: 'me@example.com',
      suggested_domain: 'dash.cloudflare.com'
    })

    const registry = JSON.parse(readRaw('oauth_registry'))
    expect(registry).toHaveLength(1)
    expect(registry[0]).toMatchObject({
      provider: 'google.com',
      identity: 'me@example.com'
    })
  })

  it('records nothing when no identity was ever scraped', async () => {
    // A capture with no identity is a row the user cannot act on, and the
    // approval queue is worthless once it fills with them.
    await chrome.tabs._navigate(1, 'https://dash.cloudflare.com/login')
    await chrome.tabs._navigate(
      1,
      'https://accounts.google.com/o/oauth2/v2/auth?client_id=1&redirect_uri=https%3A%2F%2Fdash.cloudflare.com%2Fcb'
    )
    await chrome.tabs._navigate(1, 'https://dash.cloudflare.com/home')

    expect(readRaw('pending_oauth_captures')).toBeUndefined()
  })

  it('does not record first-party SSO between subdomains of one site', async () => {
    await chrome.tabs._navigate(1, 'https://app.example.com/login')
    await chrome.tabs._navigate(
      1,
      'https://login.example.com/oauth2/authorize?client_id=1&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcb'
    )
    await dispatchMessage(
      { type: 'SET_OAUTH_IDENTITY', identity: 'me@example.com' },
      { tab: { id: 1 } }
    )
    await new Promise((r) => setTimeout(r, 0))
    await chrome.tabs._navigate(1, 'https://app.example.com/home')

    expect(readRaw('pending_oauth_captures')).toBeUndefined()
  })

  it('forgets a tab when it closes', async () => {
    await chrome.tabs._navigate(1, 'https://example.com/login')
    expect(sessionState(1)).toBeDefined()

    await chrome.tabs._close(1)
    expect(sessionState(1)).toBeUndefined()
  })
})
