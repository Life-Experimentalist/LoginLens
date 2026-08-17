// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useWeakFingerprints } from '~/core/hooks/useWeakFingerprints'
import * as fingerprint from '~/core/utils/password-fingerprint'
import {
  fingerprintPassword,
  resetFingerprintCache
} from '~/core/utils/password-fingerprint'

// The contract that matters: a view rendering "weak password" badges must never
// see a rejected promise or a set from a previous install's key, and it must
// render something on the very first pass rather than suspending.

beforeEach(() => {
  resetFingerprintCache()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useWeakFingerprints', () => {
  it('starts empty so the first render is not blocked', () => {
    const { result } = renderHook(() => useWeakFingerprints())

    expect(result.current.size).toBe(0)
  })

  it('resolves to the real set', async () => {
    const { result } = renderHook(() => useWeakFingerprints())

    await waitFor(() => expect(result.current.size).toBeGreaterThan(0))
    expect(result.current.size).toBe(fingerprint.WEAK_PASSWORD_COUNT)
  })

  it('produces fingerprints that match this install key', async () => {
    // A set computed under a different key would silently match nothing, which
    // looks identical to "the user has no weak passwords".
    const { result } = renderHook(() => useWeakFingerprints())

    await waitFor(() => expect(result.current.size).toBeGreaterThan(0))

    expect(result.current.has(await fingerprintPassword('password'))).toBe(true)
    expect(result.current.has(await fingerprintPassword('123456'))).toBe(true)
    expect(
      result.current.has(await fingerprintPassword('correct horse battery staple'))
    ).toBe(false)
  })

  it('degrades to an empty set when the HMAC fails', async () => {
    // Better to under-report weak passwords than to take down the whole
    // security summary with an unhandled rejection.
    vi.spyOn(fingerprint, 'getWeakFingerprints').mockRejectedValue(
      new Error('crypto unavailable')
    )

    const { result } = renderHook(() => useWeakFingerprints())

    await waitFor(() => expect(result.current.size).toBe(0))
  })

  it('does not set state after the view unmounts', async () => {
    // The cleanup flag exists to stop React's "update on an unmounted
    // component" warning when a view is closed mid-computation.
    const errors: unknown[] = []
    vi.spyOn(console, 'error').mockImplementation((...args) => errors.push(args))

    const { unmount } = renderHook(() => useWeakFingerprints())
    unmount()

    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(errors).toHaveLength(0)
  })
})
