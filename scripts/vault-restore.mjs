/**
 * Puts a backup taken by `vault-backup.mjs` back into an extension store,
 * including one under a *different* extension ID.
 *
 * That works because the store does not contain the ID anywhere: it is only
 * the folder name. See the header of `vault-lib.mjs`.
 *
 *   node scripts/vault-restore.mjs                  list backups and restore targets
 *   node scripts/vault-restore.mjs --to <id>        restore the newest backup into <id>
 *   node scripts/vault-restore.mjs --from <dir> --to <id>
 *   node scripts/vault-restore.mjs --to <id> --include-sync
 *
 * Refuses to run while the browser is open, refuses to write into an ID the
 * browser has never registered, refuses to write into anything whose manifest
 * is not LoginLens, and never deletes: anything already in the target is moved
 * aside with a timestamped suffix.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BACKUP_ROOT, checkStore, findInstalls, human, isRunning, listing, totalBytes } from './vault-lib.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Read from package.json rather than written here, so it cannot drift from it. */
const HOMEPAGE = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).homepage
const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? null : args[i + 1]
}

const installs = findInstalls({ repoRoot })
const backups = existsSync(BACKUP_ROOT)
  ? readdirSync(BACKUP_ROOT).filter((d) => /^\d{4}-\d{2}-\d{2}T/.test(d)).sort().reverse()
  : []

const targetId = flag('--to')

if (!targetId) {
  console.log(`Backups under ${BACKUP_ROOT}:\n`)
  if (backups.length === 0) console.log('  (none, run `npm run vault:backup` first)')
  for (const b of backups) {
    let info = {}
    try {
      info = JSON.parse(readFileSync(join(BACKUP_ROOT, b, 'backup-info.json'), 'utf8'))
    } catch { /* an old or half-written backup still deserves a line */ }
    const size = human(totalBytes(info.local_files ?? []))
    console.log(`  ${b}`)
    console.log(`    ${info.browser ?? '?'} / ${info.profile ?? '?'}, ${size}, taken ${info.taken_at ?? '?'}`)
  }
  console.log(`\nRestore targets the browser currently knows about:\n`)
  if (installs.length === 0) console.log('  (none, load the extension once, then run this again)')
  for (const i of installs) {
    console.log(`  ${i.id}  ${i.browser} / ${i.profile}  ${i.unpackedPath || '(no path)'}`)
    console.log(`    currently holds ${listing(i.localStore).length} file(s), ${human(totalBytes(listing(i.localStore)))}`)
  }
  console.log(`\nThen: node scripts/vault-restore.mjs --to <id>`)
  process.exit(0)
}

const target = installs.find((i) => i.id === targetId)

// Writing into an ID the browser has not registered produces a folder the
// browser will delete on its next sweep. Loading the extension first is what
// creates the registration, and it costs one click.
if (!target) {
  console.error(`${targetId} is not a LoginLens registration the browser knows about.`)
  console.error('Load the unpacked extension once so the browser creates the entry, close the')
  console.error('browser, then run this again. Registrations found:')
  for (const i of installs) console.error(`  ${i.id}  ${i.browser} / ${i.profile}`)
  process.exit(1)
}

/**
 * Proves the target really is LoginLens before anything is written into it.
 *
 * `findInstalls` matches loosely on purpose: the entry that mattered on
 * 2026-09-10 was a stub with no manifest, and backup discovery has to survive
 * that. Restore cannot afford the same looseness. A `--to` that only has to
 * contain "loginlens" somewhere in its path would accept an unpacked extension
 * loaded from, say, `Downloads\loginlens-theme\`, and this script would copy
 * the entire vault into a stranger's store.
 *
 * A restore target is by definition a live registration, so its folder is on
 * disk and its manifest can be read. `homepage_url` is the field checked
 * because it is the one a folder name cannot forge by accident.
 *
 * Only unpacked entries record an absolute `path`. A store install records it
 * relative to the profile's `Extensions` directory (`<id>\<version>_0`), which
 * would resolve against the current working directory and make this refuse a
 * legitimate install it cannot find a manifest for.
 */
function assertIsLoginLens(t) {
  const base = !t.unpackedPath
    ? ''
    : isAbsolute(t.unpackedPath)
      ? t.unpackedPath
      : join(t.userData, t.profile, 'Extensions', t.unpackedPath)
  const manifestPath = base ? join(base, 'manifest.json') : ''

  if (!manifestPath || !existsSync(manifestPath)) {
    console.error(`Refusing to restore into ${t.id}: there is no manifest.json at`)
    console.error(`  ${base || '(no path registered)'}`)
    console.error('so nothing proves that entry is LoginLens. Load the unpacked extension')
    console.error('again so the folder is back on disk, then run this.')
    process.exit(1)
  }

  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch {
    console.error(`Refusing to restore into ${t.id}: ${manifestPath} will not parse.`)
    process.exit(1)
  }

  if (manifest.homepage_url !== HOMEPAGE || !/loginlens/i.test(manifest.name ?? '')) {
    console.error(`Refusing to restore into ${t.id}. Its manifest is not LoginLens:`)
    console.error(`  name          ${manifest.name ?? '(none)'}`)
    console.error(`  homepage_url  ${manifest.homepage_url ?? '(none)'}`)
    console.error(`  path          ${base}`)
    console.error(`Expected homepage_url ${HOMEPAGE} and a name containing "LoginLens".`)
    console.error('Restoring here would hand the whole vault to another extension.')
    process.exit(1)
  }

  return { manifest, path: base }
}

const { manifest: targetManifest, path: targetPath } = assertIsLoginLens(target)

if (isRunning(target.process)) {
  console.error(`${target.browser} is running. It holds the store open and will overwrite`)
  console.error('whatever is restored underneath it. Close it completely (check Task Manager)')
  console.error('and run this again.')
  process.exit(1)
}

const sourceDir = flag('--from')
  ? resolve(flag('--from'))
  : backups.length
    ? join(BACKUP_ROOT, backups[0])
    : null

if (!sourceDir || !existsSync(sourceDir)) {
  console.error('No backup to restore from. Run `npm run vault:backup` first, or pass --from <dir>.')
  process.exit(1)
}

const sourceLocal = join(sourceDir, 'Local Extension Settings')
const health = checkStore(sourceLocal)
if (!health.ok) {
  console.error(`That backup is not usable: ${health.why}`)
  process.exit(1)
}

const files = listing(sourceLocal)
console.log(`restoring ${files.length} files, ${human(totalBytes(files))}`)
console.log(`  from ${sourceDir}`)
console.log(`  into ${target.browser} / ${target.profile}, id ${target.id}`)
console.log(`       ${targetManifest.name}, ${targetPath}`)

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

/** Moves the existing store aside instead of deleting it, then copies in. */
function restoreInto(src, dst) {
  if (existsSync(dst)) {
    const aside = `${dst}.replaced-${stamp}`
    renameSync(dst, aside)
    console.log(`  moved the existing store aside -> ${aside}`)
  }
  mkdirSync(dst, { recursive: true })
  for (const f of listing(src)) copyFileSync(join(src, f.name), join(dst, f.name))
}

restoreInto(sourceLocal, target.localStore)

// Off by default: Edge's sync engine can read a restored sync store as local
// state that is behind the server and push deletions to the other devices.
const syncSrc = join(sourceDir, 'Sync Extension Settings')
if (args.includes('--include-sync') && existsSync(syncSrc)) {
  restoreInto(syncSrc, target.syncStore)
  console.log('  restored the sync store too')
} else if (existsSync(syncSrc)) {
  console.log('  left the sync store alone (pass --include-sync to restore it as well)')
}

const after = checkStore(target.localStore)
console.log(after.ok ? `\nrestored, manifest ${after.manifest}` : `\nWARNING: restored store looks wrong: ${after.why}`)
console.log('Start the browser and open the vault to confirm.')
