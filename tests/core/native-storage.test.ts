import { afterEach, describe, expect, it, vi } from 'vitest'

import { extensionStorage } from '~/core/storage/config'
import { nativeStorage } from '~/core/storage/native'
import { peekStore } from '../helpers/chrome-mock'

// This module is the single door every other module goes through to reach
// chrome.storage, so its contract matters more than its size suggests:
//
//  1. Reads never destroy. A value that cannot be decoded is reported and
//     skipped — recovering it is the user's call, not a read path's.
//  2. Decoding is not greedy. A stored string that happens to look like JSON
//     must not come back as an object, or callers get ".map is not a function"
//     somewhere far away from the actual cause.
//  3. Writes fail loudly. A dropped write means silent data loss.

/**
 * Writes straight into the mock's backing map, bypassing the storage layer.
 *
 * chrome.storage holds the JSON *text* of every value, so this is how a
 * corrupted or legacy-shaped entry actually looks on disk.
 */
function plantRaw(key: string, rawText: string) {
  peekStore('local').set(key, rawText)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('round-tripping', () => {
  it('returns undefined for a key that was never written', async () => {
    expect(await nativeStorage.get('nothing_here')).toBeUndefined()
  })

  it('round-trips the container types the vault is made of', async () => {
    const vault = [{ domain: 'example.com', accounts: [{ id: 'a1' }] }]

    await nativeStorage.set('saved_accounts', vault)

    expect(await nativeStorage.get('saved_accounts')).toEqual(vault)
  })

  it('round-trips scalars without changing their type', async () => {
    await nativeStorage.set('a_string', 'hello')
    await nativeStorage.set('a_number', 42)
    await nativeStorage.set('a_bool', false)

    expect(await nativeStorage.get('a_string')).toBe('hello')
    expect(await nativeStorage.get('a_number')).toBe(42)
    expect(await nativeStorage.get('a_bool')).toBe(false)
  })

  it('round-trips an empty array as an array, not as undefined', async () => {
    // The background worker seeds missing keys with `[]`. If that came back as
    // undefined the seed would run again on every startup.
    await nativeStorage.set('oauth_registry', [])

    expect(await nativeStorage.get('oauth_registry')).toEqual([])
  })

  it('round-trips unicode', async () => {
    await nativeStorage.set('label', { note: 'пароль 🔐 密码' })

    expect(await nativeStorage.get('label')).toEqual({ note: 'пароль 🔐 密码' })
  })

  it('overwrites rather than merging', async () => {
    await nativeStorage.set('k', { a: 1, b: 2 })
    await nativeStorage.set('k', { a: 9 })

    expect(await nativeStorage.get('k')).toEqual({ a: 9 })
  })
})

describe('decoding is not greedy', () => {
  it('leaves a stored string that looks like a number as a string', async () => {
    // A note of "123" is text the user typed. Re-parsing it would hand the
    // caller a number instead, which is the type-confusion this guard exists
    // to prevent.
    plantRaw('note', JSON.stringify('123'))

    const value = await nativeStorage.get('note')

    expect(value).toBe('123')
    expect(typeof value).toBe('string')
  })

  it('leaves a stored string that looks like a boolean as a string', async () => {
    plantRaw('note', JSON.stringify('true'))

    expect(await nativeStorage.get('note')).toBe('true')
  })

  it('does not convert the base64 fingerprint key into anything else', async () => {
    // The only value in the vault stored as a bare string. It must come back
    // byte-identical or every password fingerprint stops matching.
    const key = 'q1B4Yk7+Zx0PmN3rTf9uLdKgVhWjXcEaSbIoQpMyNzA='

    await nativeStorage.set('password_fingerprint_key', key)

    expect(await nativeStorage.get('password_fingerprint_key')).toBe(key)
  })

  it('does decode a double-encoded container', async () => {
    // A string whose contents are a JSON object *is* recovered — this is the
    // one case the container check is for.
    plantRaw('legacy', JSON.stringify('{"a":1}'))

    expect(await nativeStorage.get('legacy')).toEqual({ a: 1 })
  })
})

describe('reads never destroy', () => {
  it('skips the legacy "[object Object]" sentinel', async () => {
    plantRaw('broken', JSON.stringify('[object Object]'))

    expect(await nativeStorage.get('broken')).toBeUndefined()
  })

  it('leaves the sentinel on disk instead of deleting it', async () => {
    plantRaw('broken', JSON.stringify('[object Object]'))

    await nativeStorage.get('broken')

    expect(peekStore('local').has('broken')).toBe(true)
  })

  it('returns undefined for text that is not valid JSON at all', async () => {
    plantRaw('corrupt', 'not json at all')

    expect(await nativeStorage.get('corrupt')).toBeUndefined()
  })

  it('leaves unparseable text on disk', async () => {
    plantRaw('corrupt', 'not json at all')

    await nativeStorage.get('corrupt')

    expect(peekStore('local').get('corrupt')).toBe('not json at all')
  })

  it('returns undefined for a string that looks like a container but is not', async () => {
    plantRaw('half', JSON.stringify('{"a": bad}'))

    expect(await nativeStorage.get('half')).toBeUndefined()
  })

  it('returns undefined instead of throwing when the storage layer fails', async () => {
    vi.spyOn(extensionStorage, 'get').mockRejectedValue(new Error('disk gone'))

    await expect(nativeStorage.get('anything')).resolves.toBeUndefined()
  })

  it('does not let one corrupted key hide a healthy one', async () => {
    plantRaw('corrupt', 'not json at all')
    await nativeStorage.set('healthy', { ok: true })

    expect(await nativeStorage.get('corrupt')).toBeUndefined()
    expect(await nativeStorage.get('healthy')).toEqual({ ok: true })
  })
})

describe('writes fail loudly', () => {
  it('rethrows when the write is rejected', async () => {
    // Swallowing this would report a successful save while the vault on disk
    // stayed at its previous state.
    vi.spyOn(extensionStorage, 'set').mockRejectedValue(
      new Error('QUOTA_BYTES quota exceeded.')
    )

    await expect(nativeStorage.set('saved_accounts', [1])).rejects.toThrow(
      'QUOTA_BYTES'
    )
  })

  it('rethrows when a remove is rejected', async () => {
    vi.spyOn(extensionStorage, 'remove').mockRejectedValue(new Error('nope'))

    await expect(nativeStorage.remove('k')).rejects.toThrow('nope')
  })
})

describe('remove', () => {
  it('makes a later read return undefined', async () => {
    await nativeStorage.set('k', { a: 1 })
    await nativeStorage.remove('k')

    expect(await nativeStorage.get('k')).toBeUndefined()
  })

  it('clears the key from storage rather than blanking it', async () => {
    await nativeStorage.set('k', { a: 1 })
    await nativeStorage.remove('k')

    expect(peekStore('local').has('k')).toBe(false)
  })

  it('is a no-op for a key that was never written', async () => {
    await expect(nativeStorage.remove('never_existed')).resolves.toBeUndefined()
  })
})
