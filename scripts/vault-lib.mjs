/**
 * Shared bits for `vault-backup.mjs` and `vault-restore.mjs`.
 *
 * These two scripts exist because of what happened on 2026-09-10: the loaded
 * unpacked folder was deleted, Edge parked the extension as a dead entry, and
 * the only apparent way out was Remove, which is the one action that
 * permanently deletes an extension's storage. The vault was recovered only
 * because a raw copy of the LevelDB store happened to have been taken half an
 * hour earlier.
 *
 * The thing that makes recovery work across a *different* extension ID is that
 * the store does not contain the ID. Verified on the 2026-09-10 backup: zero
 * occurrences of the ID and zero of `chrome-extension` across every `.ldb`,
 * `.log`, `MANIFEST-000001` and `CURRENT`. The ID is only the folder name, so
 * copying the folder under a new name is a complete migration.
 *
 * Scope: this guards against an ID change or an uninstall. It does not guard
 * against losing the disk, and it is not a substitute for the encrypted
 * `.LLBAK` export (`src/core/utils/export.ts:232`), which is the off-machine
 * answer and can be opened at https://loginlens.vkrishna04.me/decrypt.
 *
 * Nothing here reads, parses or prints the contents of the store. Files are
 * copied as bytes and only their names, sizes and mtimes are ever displayed.
 *
 * A backup is a plaintext copy. `chrome.storage.local` is not encrypted at
 * rest, so the store holds what the vault holds, including the cloud-sync
 * passphrase when cloud sync is on (`src/core/utils/cloud-sync.ts:24-27`).
 * The backup root inherits the user profile's permissions, which is a narrower
 * set than the browser profile itself grants, but neither stops a program
 * running as this user from reading either copy. That was already true of the
 * browser's own store; what a backup adds is a second copy at a predictable
 * path that outlives an uninstall. The encrypted `.LLBAK` export is the answer
 * when that matters.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Where backups go. Outside the repo, so a clean checkout cannot take them. */
export const BACKUP_ROOT = join(homedir(), 'LoginLens-vault-backups')

/** Chromium browsers whose profiles are worth looking in, newest guess first. */
const BROWSERS = [
  { name: 'Edge', process: 'msedge.exe', userData: join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'Edge', 'User Data') },
  { name: 'Chrome', process: 'chrome.exe', userData: join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'User Data') },
  { name: 'Brave', process: 'brave.exe', userData: join(process.env.LOCALAPPDATA ?? '', 'BraveSoftware', 'Brave-Browser', 'User Data') }
]

/** True when the browser holds the store open, so a copy is a hot snapshot. */
export function isRunning(processName) {
  try {
    const out = execFileSync('tasklist', ['/FI', `IMAGENAME eq ${processName}`, '/NH'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
    return out.includes(processName)
  } catch {
    return false
  }
}

function profileDirs(userData) {
  if (!existsSync(userData)) return []
  return readdirSync(userData, { withFileTypes: true })
    .filter((d) => d.isDirectory() && (d.name === 'Default' || /^Profile \d+$/.test(d.name)))
    .map((d) => d.name)
}

/**
 * Every LoginLens registration this machine knows about.
 *
 * A registration is matched on the unpacked `path` rather than on the manifest
 * name, because the entry that mattered most on 2026-09-10 was a stub with no
 * manifest at all. Path is the field that survived.
 */
export function findInstalls({ repoRoot } = {}) {
  const found = []

  for (const browser of BROWSERS) {
    for (const profile of profileDirs(browser.userData)) {
      const prefsPath = join(browser.userData, profile, 'Secure Preferences')
      if (!existsSync(prefsPath)) continue

      let settings
      try {
        settings = JSON.parse(readFileSync(prefsPath, 'utf8'))?.extensions?.settings
      } catch {
        continue
      }
      if (!settings) continue

      for (const [id, entry] of Object.entries(settings)) {
        const path = entry?.path ?? ''
        const name = entry?.manifest?.name ?? ''
        const isOurs = /loginlens/i.test(path) || /loginlens/i.test(name) ||
          (repoRoot && path.toLowerCase().startsWith(repoRoot.toLowerCase()))
        if (!isOurs) continue

        found.push({
          id,
          browser: browser.name,
          process: browser.process,
          profile,
          userData: browser.userData,
          unpackedPath: path,
          name: name || '(no manifest, stub entry)',
          localStore: join(browser.userData, profile, 'Local Extension Settings', id),
          syncStore: join(browser.userData, profile, 'Sync Extension Settings', id)
        })
      }
    }
  }

  return found
}

/** Names, sizes and mtimes only. Never contents. */
export function listing(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f !== 'LOCK') // held open by the browser, and LevelDB recreates it
    .sort()
    .map((f) => {
      const s = statSync(join(dir, f))
      return { name: f, size: s.size, mtime: s.mtimeMs }
    })
}

export function sameListing(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function totalBytes(files) {
  return files.reduce((n, f) => n + f.size, 0)
}

export function human(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * LevelDB opens by reading `CURRENT` to learn which `MANIFEST-*` is live. A
 * copy whose `CURRENT` names a manifest that is not in the copy will not open,
 * which is the failure mode a mid-compaction snapshot produces.
 */
export function checkStore(dir) {
  const currentPath = join(dir, 'CURRENT')
  if (!existsSync(currentPath)) return { ok: false, why: 'no CURRENT file' }

  const current = readFileSync(currentPath, 'utf8').trim()
  if (!current) return { ok: false, why: 'CURRENT is empty' }
  if (!existsSync(join(dir, current))) {
    return { ok: false, why: `CURRENT names ${current}, which is not in the copy` }
  }

  const manifestSize = statSync(join(dir, current)).size
  if (manifestSize === 0) return { ok: false, why: `${current} is empty` }

  return { ok: true, manifest: current }
}
