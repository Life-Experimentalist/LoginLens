import { useEffect, useState } from 'react'
import { getWeakFingerprints } from '../utils/password-fingerprint'

const EMPTY: ReadonlySet<string> = new Set()

/**
 * The set of fingerprints matching known-weak passwords, under this install's
 * fingerprint key.
 *
 * `analyzePasswordHashes` takes this set as an argument rather than importing
 * it, because computing it is async (HMAC over the weak-password list) and the
 * analysis itself has to stay synchronous for `useMemo`. Views that render
 * "weak password" badges must pass this in — with the default empty set the
 * analysis still finds reuse, but every weak-password check silently answers
 * "no".
 *
 * Returns an empty set on the first render and the real set once resolved.
 */
export function useWeakFingerprints(): ReadonlySet<string> {
  const [weak, setWeak] = useState<ReadonlySet<string>>(EMPTY)

  useEffect(() => {
    let cancelled = false
    getWeakFingerprints()
      .then((set) => {
        if (!cancelled) setWeak(set)
      })
      .catch(() => {
        // A failed HMAC here should degrade to "no weak passwords detected",
        // never break the view that is rendering the security summary.
      })
    return () => {
      cancelled = true
    }
  }, [])

  return weak
}
