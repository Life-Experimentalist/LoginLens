import { describe, expect, it } from 'vitest'
import {
  dateInputToExpiry,
  expiryToDateInput,
  formatExpiryLabel,
  getApiKeyExpiry
} from '~/core/utils/api-key-expiry'

const NOW = new Date(2026, 8, 9, 12, 0, 0).getTime()
const DAY = 86_400_000

describe('getApiKeyExpiry', () => {
  it('reports no expiry when the field is absent', () => {
    expect(getApiKeyExpiry({}, NOW).state).toBe('none')
  })

  it('reports no expiry when the field is null', () => {
    expect(getApiKeyExpiry({ api_key_expiry: null }, NOW).state).toBe('none')
  })

  it('treats a corrupt value as no expiry rather than as expired', () => {
    expect(
      getApiKeyExpiry({ api_key_expiry: NaN as unknown as number }, NOW).state
    ).toBe('none')
  })

  it('flags a past date as expired', () => {
    expect(getApiKeyExpiry({ api_key_expiry: NOW - DAY }, NOW).state).toBe(
      'expired'
    )
  })

  it('flags a date inside the warning window as soon', () => {
    expect(getApiKeyExpiry({ api_key_expiry: NOW + 5 * DAY }, NOW).state).toBe(
      'soon'
    )
  })

  it('flags a distant date as valid', () => {
    expect(
      getApiKeyExpiry({ api_key_expiry: NOW + 200 * DAY }, NOW).state
    ).toBe('valid')
  })
})

describe('date input round trip', () => {
  it('keeps the local calendar day', () => {
    const at = dateInputToExpiry('2026-03-12')
    expect(expiryToDateInput(at)).toBe('2026-03-12')
  })

  it('stores the end of the chosen day, so that day is still valid', () => {
    const at = dateInputToExpiry('2026-03-12')!
    const middayOn12th = new Date(2026, 2, 12, 12, 0, 0).getTime()
    expect(getApiKeyExpiry({ api_key_expiry: at }, middayOn12th).state).not.toBe(
      'expired'
    )
    const the13th = new Date(2026, 2, 13, 0, 1, 0).getTime()
    expect(getApiKeyExpiry({ api_key_expiry: at }, the13th).state).toBe('expired')
  })

  it('reads an empty input as no expiry', () => {
    expect(dateInputToExpiry('')).toBeNull()
    expect(expiryToDateInput(null)).toBe('')
    expect(expiryToDateInput(undefined)).toBe('')
  })

  it('rejects a malformed date string', () => {
    expect(dateInputToExpiry('12/03/2026')).toBeNull()
  })
})

describe('formatExpiryLabel', () => {
  it('says so plainly when there is no expiry', () => {
    expect(formatExpiryLabel(getApiKeyExpiry({}, NOW))).toBe('No expiry')
  })

  it('leads with Expired for a past key', () => {
    expect(
      formatExpiryLabel(getApiKeyExpiry({ api_key_expiry: NOW - DAY }, NOW))
    ).toMatch(/^Expired /)
  })
})
