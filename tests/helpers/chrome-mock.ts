/**
 * In-memory stand-in for the parts of the `chrome.*` API LoginLens uses.
 *
 * It is deliberately faithful about the things that have bitten us in real
 * browsers rather than being a bag of `vi.fn()`s:
 *
 *  - `storage.sync` enforces the real quotas (8KB per item, 100KB total,
 *    512 items) and rejects with the same shape of error Chrome does, so the
 *    chunking in `core/utils/cloud-sync.ts` is tested against the constraint it
 *    exists to satisfy.
 *  - `onChanged` fires with a proper `{oldValue, newValue}` diff, because the
 *    storage layer's cache invalidation depends on it.
 *  - Every area is a *separate* store. Code that writes to `local` and reads
 *    from `sync` should fail here exactly like it would in a browser.
 */

export const SYNC_QUOTA_BYTES = 102_400
export const SYNC_QUOTA_BYTES_PER_ITEM = 8_192
export const SYNC_MAX_ITEMS = 512

type Store = Map<string, any>
type ChangeListener = (
  changes: Record<string, { oldValue?: any; newValue?: any }>,
  areaName: string
) => void

interface AreaOptions {
  quotaBytes?: number
  quotaBytesPerItem?: number
  maxItems?: number
}

const stores: Record<string, Store> = {
  local: new Map(),
  sync: new Map(),
  session: new Map(),
  managed: new Map()
}

const globalListeners: ChangeListener[] = []

function byteLength(key: string, value: any): number {
  return new TextEncoder().encode(key + JSON.stringify(value ?? null)).length
}

function usedBytes(store: Store): number {
  let total = 0
  for (const [k, v] of store) total += byteLength(k, v)
  return total
}

function makeArea(name: string, opts: AreaOptions = {}) {
  const store = stores[name]
  const areaListeners: ChangeListener[] = []

  function emit(changes: Record<string, { oldValue?: any; newValue?: any }>) {
    if (Object.keys(changes).length === 0) return
    for (const fn of areaListeners) fn(changes, name)
    for (const fn of globalListeners) fn(changes, name)
  }

  return {
    async get(keys?: string | string[] | Record<string, any> | null) {
      if (keys === null || keys === undefined) {
        return Object.fromEntries(store)
      }
      if (typeof keys === 'string') {
        return store.has(keys) ? { [keys]: store.get(keys) } : {}
      }
      if (Array.isArray(keys)) {
        const out: Record<string, any> = {}
        for (const k of keys) if (store.has(k)) out[k] = store.get(k)
        return out
      }
      // Object form supplies defaults for missing keys.
      const out: Record<string, any> = {}
      for (const [k, fallback] of Object.entries(keys)) {
        out[k] = store.has(k) ? store.get(k) : fallback
      }
      return out
    },

    async set(items: Record<string, any>) {
      for (const [k, v] of Object.entries(items)) {
        if (opts.quotaBytesPerItem && byteLength(k, v) > opts.quotaBytesPerItem) {
          throw new Error(
            `QUOTA_BYTES_PER_ITEM quota exceeded while setting "${k}".`
          )
        }
      }

      const projected = new Map(store)
      for (const [k, v] of Object.entries(items)) projected.set(k, v)

      if (opts.maxItems && projected.size > opts.maxItems) {
        throw new Error('MAX_ITEMS quota exceeded.')
      }
      if (opts.quotaBytes && usedBytes(projected) > opts.quotaBytes) {
        throw new Error('QUOTA_BYTES quota exceeded.')
      }

      const changes: Record<string, { oldValue?: any; newValue?: any }> = {}
      for (const [k, v] of Object.entries(items)) {
        const oldValue = store.get(k)
        if (JSON.stringify(oldValue) === JSON.stringify(v)) continue
        store.set(k, v)
        changes[k] = { oldValue, newValue: v }
      }
      emit(changes)
    },

    async remove(keys: string | string[]) {
      const list = Array.isArray(keys) ? keys : [keys]
      const changes: Record<string, { oldValue?: any; newValue?: any }> = {}
      for (const k of list) {
        if (!store.has(k)) continue
        changes[k] = { oldValue: store.get(k), newValue: undefined }
        store.delete(k)
      }
      emit(changes)
    },

    async clear() {
      const changes: Record<string, { oldValue?: any; newValue?: any }> = {}
      for (const [k, v] of store) changes[k] = { oldValue: v, newValue: undefined }
      store.clear()
      emit(changes)
    },

    async getBytesInUse(keys?: string | string[] | null) {
      if (keys === null || keys === undefined) return usedBytes(store)
      const list = Array.isArray(keys) ? keys : [keys]
      return list.reduce(
        (sum, k) => (store.has(k) ? sum + byteLength(k, store.get(k)) : sum),
        0
      )
    },

    onChanged: {
      addListener(fn: ChangeListener) {
        areaListeners.push(fn)
      },
      removeListener(fn: ChangeListener) {
        const i = areaListeners.indexOf(fn)
        if (i >= 0) areaListeners.splice(i, 1)
      },
      hasListener(fn: ChangeListener) {
        return areaListeners.includes(fn)
      },
      _clear() {
        areaListeners.length = 0
      }
    },

    QUOTA_BYTES: opts.quotaBytes,
    QUOTA_BYTES_PER_ITEM: opts.quotaBytesPerItem,
    MAX_ITEMS: opts.maxItems
  }
}

export interface ChromeMock {
  runtime: {
    id: string
    lastError: undefined
    getManifest: () => { version: string; name: string; manifest_version: number }
    getURL: (p: string) => string
    setUninstallURL: (url: string) => Promise<void>
    sendMessage: (...args: any[]) => Promise<any>
    onMessage: {
      addListener: (fn: any) => void
      removeListener: (fn: any) => void
      _listeners: any[]
    }
    onInstalled: { addListener: (fn: any) => void; _listeners: any[] }
    onStartup: { addListener: (fn: any) => void; _listeners: any[] }
  }
  storage: Record<string, any>
  alarms: any
  tabs: any
}

export function installChromeMock() {
  const messageListeners: any[] = []
  const installedListeners: any[] = []
  const startupListeners: any[] = []
  const alarmListeners: any[] = []
  const alarms = new Map<string, { name: string; periodInMinutes?: number }>()
  const tabUpdatedListeners: any[] = []
  const tabRemovedListeners: any[] = []
  const actionClickedListeners: any[] = []
  const openedTabs: { id: number; url?: string; openerTabId?: number }[] = []
  let nextTabId = 1

  const mock = {
    runtime: {
      id: 'loginlens-test-extension-id',
      lastError: undefined as any,
      getManifest: () => ({
        version: '1.0.0',
        name: 'LoginLens',
        manifest_version: 3
      }),
      getURL: (p: string) =>
        `chrome-extension://loginlens-test-extension-id/${p.replace(/^\//, '')}`,
      setUninstallURL: async (_url: string) => undefined,
      sendMessage: async (message: any) => {
        for (const fn of messageListeners) {
          const result = await new Promise((resolve) => {
            const kept = fn(message, { id: 'loginlens-test-extension-id' }, resolve)
            if (!kept) resolve(undefined)
          })
          if (result !== undefined) return result
        }
        return undefined
      },
      onMessage: {
        addListener: (fn: any) => messageListeners.push(fn),
        removeListener: (fn: any) => {
          const i = messageListeners.indexOf(fn)
          if (i >= 0) messageListeners.splice(i, 1)
        },
        _listeners: messageListeners
      },
      onInstalled: {
        addListener: (fn: any) => installedListeners.push(fn),
        _listeners: installedListeners
      },
      onStartup: {
        addListener: (fn: any) => startupListeners.push(fn),
        _listeners: startupListeners
      }
    },

    storage: {
      local: makeArea('local'),
      sync: makeArea('sync', {
        quotaBytes: SYNC_QUOTA_BYTES,
        quotaBytesPerItem: SYNC_QUOTA_BYTES_PER_ITEM,
        maxItems: SYNC_MAX_ITEMS
      }),
      session: makeArea('session'),
      managed: makeArea('managed'),
      onChanged: {
        addListener: (fn: ChangeListener) => globalListeners.push(fn),
        removeListener: (fn: ChangeListener) => {
          const i = globalListeners.indexOf(fn)
          if (i >= 0) globalListeners.splice(i, 1)
        }
      }
    },

    alarms: {
      async create(name: string, info: { periodInMinutes?: number }) {
        alarms.set(name, { name, ...info })
      },
      async get(name: string) {
        return alarms.get(name)
      },
      async getAll() {
        return [...alarms.values()]
      },
      async clear(name: string) {
        return alarms.delete(name)
      },
      onAlarm: {
        addListener: (fn: any) => alarmListeners.push(fn),
        _listeners: alarmListeners
      },
      _fire(name: string) {
        for (const fn of alarmListeners) fn({ name })
      }
    },

    action: {
      onClicked: {
        addListener: (fn: any) => actionClickedListeners.push(fn),
        _listeners: actionClickedListeners
      }
    },

    tabs: {
      async query() {
        return []
      },
      async create(props: { url?: string } = {}) {
        const tab = { id: nextTabId++, ...props }
        openedTabs.push(tab)
        return tab
      },
      async get(tabId: number) {
        const found = openedTabs.find((t) => t.id === tabId)
        if (found) return found
        return { id: tabId }
      },
      async sendMessage() {
        return undefined
      },
      onUpdated: {
        addListener: (fn: any) => tabUpdatedListeners.push(fn),
        _listeners: tabUpdatedListeners
      },
      onRemoved: {
        addListener: (fn: any) => tabRemovedListeners.push(fn),
        _listeners: tabRemovedListeners
      },
      /** Drives the navigation tracker the way the browser would. */
      async _navigate(tabId: number, url: string) {
        for (const fn of tabUpdatedListeners) await fn(tabId, { url }, { id: tabId })
      },
      async _close(tabId: number) {
        for (const fn of tabRemovedListeners) await fn(tabId)
      },
      /** Registers a tab as having been opened by another, for popup flows. */
      _seed(tab: { id: number; url?: string; openerTabId?: number }) {
        openedTabs.push(tab)
      },
      _opened: openedTabs
    }
  }

  ;(globalThis as any).chrome = mock
  ;(globalThis as any).browser = mock
  return mock
}

/** Wipes every storage area and listener between tests. */
export function resetChromeMock() {
  for (const store of Object.values(stores)) store.clear()
  globalListeners.length = 0
  const chrome = (globalThis as any).chrome
  if (!chrome) return
  for (const area of ['local', 'sync', 'session', 'managed']) {
    chrome.storage[area]?.onChanged?._clear?.()
  }
  chrome.runtime.onMessage._listeners.length = 0
  chrome.runtime.onInstalled._listeners.length = 0
  chrome.runtime.onStartup._listeners.length = 0
  chrome.alarms.onAlarm._listeners.length = 0
  chrome.tabs.onUpdated._listeners.length = 0
  chrome.tabs.onRemoved._listeners.length = 0
  chrome.tabs._opened.length = 0
  chrome.action.onClicked._listeners.length = 0
}

/**
 * Delivers a message to the registered `onMessage` listeners the way the
 * browser does, including the `sender` — which is the difference between a
 * content script and an extension page, and therefore a trust boundary.
 *
 * Resolves with whatever the listener passes to `sendResponse`, or `undefined`
 * if it declines the async channel by returning something other than `true`.
 */
export function dispatchMessage(message: any, sender: any = {}): Promise<any> {
  const chrome = (globalThis as any).chrome
  const listeners = [...chrome.runtime.onMessage._listeners]
  const withId = { id: chrome.runtime.id, ...sender }

  return new Promise((resolve) => {
    let settled = false
    const respond = (value?: any) => {
      if (settled) return
      settled = true
      resolve(value)
    }

    let anyAsync = false
    for (const fn of listeners) {
      if (fn(message, withId, respond) === true) anyAsync = true
    }
    // A listener that keeps the channel open answers on its own schedule; one
    // that does not has already had its only chance to respond.
    if (!anyAsync) respond(undefined)
  })
}

/** Direct access for assertions — bypasses the async API. */
export function peekStore(area: 'local' | 'sync' | 'session' = 'local') {
  return stores[area]
}
