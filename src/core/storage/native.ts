import { extensionStorage } from './config'

/**
 * Returns true only for strings that are structurally JSON objects or arrays.
 *
 * We deliberately do NOT treat bare scalars as JSON. A stored note of "123" or
 * "true" is a string the user typed, and re-parsing it would hand callers a
 * number or a boolean instead — a type-confusion bug that used to surface as
 * ".map is not a function" further downstream.
 */
function looksLikeJsonContainer(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.length < 2) return false
  const first = trimmed[0]
  const last = trimmed[trimmed.length - 1]
  return (first === '{' && last === '}') || (first === '[' && last === ']')
}

/**
 * True only when the stored value IS the sentinel a pre-1.0 bug wrote in place
 * of an object — never when it merely contains it.
 *
 * The distinction is the whole point. Every key is stored as one JSON string,
 * so `raw.includes('[object Object]')` is satisfied by a single note, label or
 * imported CSV field anywhere in the vault that happens to contain that text —
 * and the repair path keyed off it resets the key, which would mean losing
 * every account over a string a user is entirely allowed to type.
 */
export function isCorruptedSentinel(raw: unknown): boolean {
  if (typeof raw !== 'string') return false
  // Tolerates the extra quotes a stringifying storage layer adds around it.
  const trimmed = raw.trim().replace(/^"|"$/g, '')
  return trimmed === '[object Object]' || trimmed.startsWith('[object ')
}

/**
 * Unified storage accessor used by content scripts, the service worker, and
 * the React views so serialization behaves identically everywhere.
 *
 * Reads are non-destructive: a value that cannot be decoded is reported and
 * skipped, never deleted. Recovering a corrupted key is the user's call
 * (Settings → Data Management), not something a read path should decide.
 */
export const nativeStorage = {
  get: async <T>(key: string): Promise<T | undefined> => {
    try {
      const raw = await extensionStorage.get<unknown>(key)
      if (raw === undefined || raw === null) return undefined

      if (typeof raw === 'string') {
        // Legacy sentinel written by a pre-1.0 bug that stringified objects.
        if (isCorruptedSentinel(raw)) {
          console.warn(`[LoginLens] Ignoring corrupted value at '${key}'.`)
          return undefined
        }

        if (looksLikeJsonContainer(raw)) {
          try {
            return JSON.parse(raw) as T
          } catch {
            console.warn(
              `[LoginLens] Value at '${key}' looks like JSON but could not be parsed; leaving it untouched.`
            )
            return undefined
          }
        }

        return raw as unknown as T
      }

      return raw as T
    } catch (err) {
      // Includes SyntaxError thrown by the storage layer's own JSON.parse on a
      // corrupted entry. Report and move on — do not delete the user's data.
      console.warn(`[LoginLens] Could not read '${key}':`, err)
      return undefined
    }
  },

  set: async (key: string, value: unknown): Promise<void> => {
    try {
      await extensionStorage.set(key, value)
    } catch (err) {
      console.error(`[LoginLens] Could not write '${key}':`, err)
      throw err
    }
  },

  remove: async (key: string): Promise<void> => {
    try {
      await extensionStorage.remove(key)
    } catch (err) {
      console.error(`[LoginLens] Could not remove '${key}':`, err)
      throw err
    }
  }
}
