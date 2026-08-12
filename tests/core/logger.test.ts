import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { log, type LogEntry } from '~/core/utils/logger'
import { nativeStorage } from '~/core/storage/native'

/**
 * `log.info()` and friends are fire-and-forget. `flush()` waits for the append
 * chain before draining, so awaiting it is enough to see every entry logged so
 * far — which is the same guarantee the Logs panel relies on.
 */
async function settle() {
  await log.flush()
}

async function storedLogs(): Promise<LogEntry[]> {
  const raw = await nativeStorage.get<LogEntry[]>('app_logs')
  return Array.isArray(raw) ? raw : []
}

beforeEach(async () => {
  await log.clearLogs()
  // The console is not under test and would drown the run.
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('what gets persisted', () => {
  it('keeps warnings and errors with Debug Mode off', async () => {
    // A user hitting a bug should not have to enable a setting and reproduce
    // the failure before there is anything to attach to a report.
    await nativeStorage.set('debug_mode', false)

    log.warn('something looked wrong')
    log.error('something broke')
    await settle()

    expect((await storedLogs()).map((e) => e.level)).toEqual(['WARN', 'ERROR'])
  })

  it('does not keep routine informational entries with Debug Mode off', async () => {
    await nativeStorage.set('debug_mode', false)

    log.info('opened the vault')
    await settle()

    expect(await storedLogs()).toEqual([])
  })

  it('keeps everything with Debug Mode on', async () => {
    await nativeStorage.set('debug_mode', true)

    log.debug('tab context resolved')
    log.info('opened the vault')
    log.warn('careful')
    await settle()

    expect((await storedLogs()).map((e) => e.level)).toEqual([
      'DEBUG',
      'INFO',
      'WARN'
    ])
  })

  it('drops DEBUG entirely with Debug Mode off — not even to the console', async () => {
    await nativeStorage.set('debug_mode', false)

    log.debug('noisy internal detail')
    await settle()

    expect(await storedLogs()).toEqual([])
    expect(console.log).not.toHaveBeenCalled()
  })

  it('records the level, message and timestamp', async () => {
    log.error('boom')
    await settle()

    const [entry] = await storedLogs()
    expect(entry.level).toBe('ERROR')
    expect(entry.message).toBe('boom')
    expect(typeof entry.timestamp).toBe('number')
  })
})

describe('redaction', () => {
  it('masks email addresses in strings', async () => {
    log.error('login failed', { detail: 'no match for me@example.com here' })
    await settle()

    const [entry] = await storedLogs()
    expect(entry.data.detail).toBe('no match for <email> here')
  })

  it('redacts values under keys that name a secret', async () => {
    log.error('save failed', {
      domain: 'github.com',
      username: 'dev@example.com',
      api_key: 'ghp_realtokenvalue',
      password_hash: 'fp_abc',
      count: 3
    })
    await settle()

    const [entry] = await storedLogs()
    expect(entry.data.api_key).toBe('<redacted>')
    expect(entry.data.username).toBe('<redacted>')
    expect(entry.data.password_hash).toBe('<redacted>')
    // Non-sensitive context is what makes a log useful — it stays.
    expect(entry.data.domain).toBe('github.com')
    expect(entry.data.count).toBe(3)
  })

  it('reaches into nested objects', async () => {
    log.error('sync failed', {
      request: { meta: { token: 'abc123' }, retries: 2 }
    })
    await settle()

    const [entry] = await storedLogs()
    expect(entry.data.request.meta.token).toBe('<redacted>')
    expect(entry.data.request.retries).toBe(2)
  })

  it('flattens an Error to name and message', async () => {
    log.error('threw', new Error('QUOTA_BYTES quota exceeded'))
    await settle()

    const [entry] = await storedLogs()
    expect(entry.data).toEqual({
      name: 'Error',
      message: 'QUOTA_BYTES quota exceeded'
    })
  })

  it('truncates long strings so one entry cannot fill the log', async () => {
    log.error('big', { blob: 'x'.repeat(5000) })
    await settle()

    const [entry] = await storedLogs()
    expect(entry.data.blob.length).toBeLessThanOrEqual(201)
  })

  it('bounds arrays and recursion depth', async () => {
    let deep: any = 'bottom'
    for (let i = 0; i < 10; i++) deep = { next: deep }

    log.error('deep', { deep, list: Array.from({ length: 100 }, (_, i) => i) })
    await settle()

    const [entry] = await storedLogs()
    expect(entry.data.list).toHaveLength(20)
    expect(JSON.stringify(entry.data.deep)).toContain('<…>')
  })

  it('leaves the console call unredacted for live debugging', async () => {
    const payload = { api_key: 'ghp_realtokenvalue' }
    log.error('save failed', payload)
    await settle()

    expect(console.error).toHaveBeenCalledWith('[ERROR] save failed', payload)
  })
})

describe('batching', () => {
  it('writes a burst of entries in a single storage write', async () => {
    // Read-modify-write per call meant a burst of twenty log lines did twenty
    // full reads and writes of the log array, on the same storage the rest of
    // the extension is waiting on.
    const setSpy = vi.spyOn(chrome.storage.local, 'set')

    for (let i = 0; i < 20; i++) log.error(`entry ${i}`)
    await settle()

    expect(setSpy).toHaveBeenCalledTimes(1)
    expect(await storedLogs()).toHaveLength(20)
  })

  it('does not lose entries logged while a flush is in progress', async () => {
    log.error('first')
    const flushing = log.flush()
    log.error('second')
    await flushing
    await settle()

    expect((await storedLogs()).map((e) => e.message)).toEqual([
      'first',
      'second'
    ])
  })

  it('preserves order across separate flushes', async () => {
    log.error('one')
    await settle()
    log.error('two')
    await settle()

    expect((await storedLogs()).map((e) => e.message)).toEqual(['one', 'two'])
  })
})

describe('retention', () => {
  it('caps the stored log and drops the oldest entries', async () => {
    for (let i = 0; i < 600; i++) log.error(`entry ${i}`)
    await settle()

    const logs = await storedLogs()
    expect(logs).toHaveLength(500)
    expect(logs[0].message).toBe('entry 100')
    expect(logs[499].message).toBe('entry 599')
  })
})

describe('reading and clearing', () => {
  it('flushes pending entries before returning them', async () => {
    log.error('not yet written')
    // No settle() — getLogs is responsible for not being a step behind.
    expect((await log.getLogs()).map((e) => e.message)).toEqual([
      'not yet written'
    ])
  })

  it('clears buffered entries too, so they cannot reappear', async () => {
    log.error('should not survive')
    await log.clearLogs()
    await settle()

    expect(await storedLogs()).toEqual([])
  })

  it('returns an empty list when storage holds something unexpected', async () => {
    await nativeStorage.set('app_logs', 'corrupted')
    expect(await log.getLogs()).toEqual([])
  })
})

describe('failure handling', () => {
  it('does not throw out of a log call when storage rejects', async () => {
    vi.spyOn(chrome.storage.local, 'set').mockRejectedValue(
      new Error('QUOTA_BYTES quota exceeded')
    )

    log.error('this cannot be written')
    await expect(settle()).resolves.toBeUndefined()
  })
})
