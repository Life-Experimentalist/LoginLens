import { nativeStorage } from './native'
import type { DomainEntry, GlobalOAuthAccount, GlobalMFAAuthenticator } from './schema'

export interface VaultSnapshot {
  id: string
  type: 'manual' | 'auto' | 'scheduled'
  label: string
  timestamp: number
  accountCount: number
  domainCount: number
  checksum: string // Simple hash to detect vault changes between snapshots
  data: {
    savedAccounts: DomainEntry[]
    oauthRegistry: GlobalOAuthAccount[]
    // Optional because snapshots taken before the MFA registry existed do not
    // carry one. Every snapshot written now does.
    mfaRegistry?: GlobalMFAAuthenticator[]
  }
}

const MANUAL_LIMIT = 5
const AUTO_LIMIT = 7
// Scheduled snapshots are written at most once a week, but "at most weekly"
// is not a bound — without a cap the list grows for as long as the extension
// is installed, and every entry holds a full copy of the vault in
// chrome.storage.local. A year of them is a year of vault copies.
const SCHEDULED_LIMIT = 8
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function generateChecksum(data: any): string {
  const str = JSON.stringify(data)
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash |= 0
  }
  return hash.toString(36)
}

export async function getSnapshots(): Promise<VaultSnapshot[]> {
  const raw = await nativeStorage.get<VaultSnapshot[]>('vault_snapshots')
  return Array.isArray(raw) ? raw : []
}

export async function saveSnapshots(snapshots: VaultSnapshot[]): Promise<void> {
  await nativeStorage.set('vault_snapshots', snapshots)
}

/**
 * Creates a new snapshot with strict limit enforcement:
 * - Manual: max 5 (FIFO)
 * - Auto: max 7 (FIFO)
 * - Scheduled: 1 per week (only if data changed)
 */
export async function createSnapshot(
  type: 'manual' | 'auto' | 'scheduled',
  label?: string
): Promise<VaultSnapshot | null> {
  const rawSaved = await nativeStorage.get<DomainEntry[]>('saved_accounts')
  const rawOauth = await nativeStorage.get<GlobalOAuthAccount[]>('oauth_registry')
  const rawMfa = await nativeStorage.get<GlobalMFAAuthenticator[]>('mfa_registry')

  const savedAccounts = Array.isArray(rawSaved) ? rawSaved : []
  const oauthRegistry = Array.isArray(rawOauth) ? rawOauth : []
  const mfaRegistry = Array.isArray(rawMfa) ? rawMfa : []

  // The checksum decides whether a scheduled snapshot is worth taking, so it
  // has to cover everything the snapshot stores. Leaving mfaRegistry out of it
  // means a week where the user only touched their authenticators reads as
  // "nothing changed" and gets no restore point.
  const currentChecksum = generateChecksum({
    savedAccounts,
    oauthRegistry,
    mfaRegistry
  })
  const allSnapshots = await getSnapshots()

  // For scheduled snapshot, check if 7 days passed AND data changed since last scheduled
  if (type === 'scheduled') {
    const scheduled = allSnapshots
      .filter((s) => s.type === 'scheduled')
      .sort((a, b) => b.timestamp - a.timestamp)

    if (scheduled.length > 0) {
      const last = scheduled[0]
      const isWeekElapsed = Date.now() - last.timestamp >= WEEK_MS
      const hasChanged = last.checksum !== currentChecksum

      if (!isWeekElapsed || !hasChanged) {
        return null // Skip creation
      }
    }
  }

  const totalAccounts = savedAccounts.reduce(
    (acc, d) => acc + (d.accounts?.length || 0),
    0
  )

  const newSnapshot: VaultSnapshot = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
    type,
    label: label || (type === 'manual' ? 'Manual Backup' : type === 'auto' ? 'Auto Change Restore Point' : 'Weekly Scheduled Backup'),
    timestamp: Date.now(),
    accountCount: totalAccounts,
    domainCount: savedAccounts.length,
    checksum: currentChecksum,
    data: {
      savedAccounts,
      oauthRegistry,
      mfaRegistry
    }
  }

  // Enforce limits per tier
  const manual = allSnapshots.filter((s) => s.type === 'manual')
  const auto = allSnapshots.filter((s) => s.type === 'auto')
  const scheduled = allSnapshots.filter((s) => s.type === 'scheduled')

  if (type === 'manual') {
    manual.unshift(newSnapshot)
    if (manual.length > MANUAL_LIMIT) manual.pop()
  } else if (type === 'auto') {
    auto.unshift(newSnapshot)
    if (auto.length > AUTO_LIMIT) auto.pop()
  } else if (type === 'scheduled') {
    scheduled.unshift(newSnapshot)
    if (scheduled.length > SCHEDULED_LIMIT) scheduled.pop()
  }

  const updatedSnapshots = [...manual, ...auto, ...scheduled].sort(
    (a, b) => b.timestamp - a.timestamp
  )

  await saveSnapshots(updatedSnapshots)
  return newSnapshot
}

export async function deleteSnapshot(id: string): Promise<void> {
  const snapshots = await getSnapshots()
  const filtered = snapshots.filter((s) => s.id !== id)
  await saveSnapshots(filtered)
}

/**
 * Restores a snapshot over the live vault.
 *
 * A restore replaces rather than merges — the point of a restore point is to
 * get back exactly the state that was captured. The `Array.isArray` guards are
 * there so a hand-edited or truncated snapshot cannot write a non-array into a
 * key the whole UI iterates over; a key that fails the guard is left alone
 * rather than wiped.
 *
 * All or nothing. The vault spans three keys and storage only writes one at a
 * time, so a failure partway through would leave accounts from the snapshot
 * beside an OAuth registry from the present — a state neither the user nor any
 * later restore can reason about. On failure the previous values go back and
 * the error is rethrown, so the caller can say the restore did not happen.
 */
export async function restoreSnapshot(snapshot: VaultSnapshot): Promise<void> {
  const plan: [string, unknown[]][] = []
  if (Array.isArray(snapshot.data?.savedAccounts)) {
    plan.push(['saved_accounts', snapshot.data.savedAccounts])
  }
  if (Array.isArray(snapshot.data?.oauthRegistry)) {
    plan.push(['oauth_registry', snapshot.data.oauthRegistry])
  }
  // Snapshots written before the MFA registry existed have no mfaRegistry at
  // all. Restoring one must not blank out the authenticators the user has now,
  // so an absent key is skipped rather than treated as an empty list.
  if (Array.isArray(snapshot.data?.mfaRegistry)) {
    plan.push(['mfa_registry', snapshot.data.mfaRegistry])
  }

  const previous = new Map<string, unknown>()
  for (const [key] of plan) {
    previous.set(key, await nativeStorage.get<unknown>(key))
  }

  const written: string[] = []
  try {
    for (const [key, value] of plan) {
      await nativeStorage.set(key, value)
      written.push(key)
    }
  } catch (err) {
    for (const key of written) {
      try {
        await nativeStorage.set(key, previous.get(key) ?? [])
      } catch {
        // Nothing better is available here — the rethrow below is what tells
        // the user the vault is not in the state they asked for.
      }
    }
    throw err
  }
}
