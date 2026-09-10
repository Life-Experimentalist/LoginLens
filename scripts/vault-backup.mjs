/**
 * Copies the LoginLens extension store out of the browser profile, so the
 * vault survives the extension ID changing or the extension being removed.
 *
 * Read the header of `vault-lib.mjs` for why this exists and what it does not
 * cover. Restore with `vault-restore.mjs`.
 *
 *   node scripts/vault-backup.mjs            take a backup of every install found
 *   node scripts/vault-backup.mjs --list     show what would be backed up, copy nothing
 *   node scripts/vault-backup.mjs --keep 20  keep 20 backups instead of 10
 *
 * Nothing in the store is read or printed: files are copied as bytes and only
 * their names and sizes are shown.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BACKUP_ROOT, checkStore, findInstalls, human, isRunning, listing, sameListing, totalBytes
} from './vault-lib.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const listOnly = args.includes('--list')
const keep = Number(args[args.indexOf('--keep') + 1]) || 10

const installs = findInstalls({ repoRoot })

if (installs.length === 0) {
  console.error('No LoginLens extension registration found in any Edge, Chrome or Brave profile.')
  console.error('Load the extension once, then run this again.')
  process.exit(1)
}

console.log(`Found ${installs.length} LoginLens registration(s):\n`)
for (const i of installs) {
  const files = listing(i.localStore)
  const sync = listing(i.syncStore)
  console.log(`  ${i.browser} / ${i.profile}`)
  console.log(`    id    : ${i.id}`)
  console.log(`    name  : ${i.name}`)
  console.log(`    loaded: ${i.unpackedPath || '(no path)'}`)
  console.log(`    local : ${files.length} files, ${human(totalBytes(files))}`)
  console.log(`    sync  : ${sync.length} files, ${human(totalBytes(sync))}`)
  console.log('')
}

if (listOnly) process.exit(0)

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
let wrote = 0

for (const install of installs) {
  if (!existsSync(install.localStore)) {
    console.log(`skip ${install.id}: no local store on disk yet`)
    continue
  }

  const hot = isRunning(install.process)
  if (hot) {
    console.log(`note: ${install.browser} is running, so this is a hot snapshot`)
  }

  const dest = join(BACKUP_ROOT, `${stamp}_${install.browser}_${install.profile}_${install.id}`)
  const localDest = join(dest, 'Local Extension Settings')
  const syncDest = join(dest, 'Sync Extension Settings')

  // A copy taken while LevelDB is compacting can catch CURRENT pointing at a
  // manifest whose .ldb files were just replaced. Comparing the directory
  // listing either side of the copy detects that; three tries is plenty,
  // because compactions are short and infrequent.
  let ok = false
  let files = []
  for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
    rmSync(dest, { recursive: true, force: true })
    mkdirSync(localDest, { recursive: true })

    const before = listing(install.localStore)
    // .ldb first, then the write-ahead log, then the manifest, then CURRENT:
    // CURRENT is the file that names everything else, so it is copied last and
    // therefore cannot point past what has already been written.
    const order = (f) =>
      f.endsWith('.ldb') ? 0 : f.endsWith('.log') ? 1 : f.startsWith('MANIFEST-') ? 2 : f === 'CURRENT' ? 3 : 1
    for (const f of before.map((f) => f.name).sort((a, b) => order(a) - order(b))) {
      copyFileSync(join(install.localStore, f), join(localDest, f))
    }
    const after = listing(install.localStore)

    const health = checkStore(localDest)
    if (sameListing(before, after) && health.ok) {
      ok = true
      files = before
    } else {
      const why = !sameListing(before, after) ? 'the store changed mid-copy' : health.why
      console.log(`  attempt ${attempt} rejected: ${why}`)
    }
  }

  if (!ok) {
    rmSync(dest, { recursive: true, force: true })
    console.error(`FAILED ${install.id}: could not take a consistent copy in 3 attempts.`)
    console.error('Close the browser and run this again.')
    process.exitCode = 1
    continue
  }

  // Cheap, and it is the copy chrome.storage.sync round-trips through.
  const syncFiles = listing(install.syncStore)
  if (syncFiles.length) {
    mkdirSync(syncDest, { recursive: true })
    for (const f of syncFiles) {
      copyFileSync(join(install.syncStore, f.name), join(syncDest, f.name))
    }
  }

  writeFileSync(
    join(dest, 'backup-info.json'),
    JSON.stringify(
      {
        taken_at: new Date().toISOString(),
        browser: install.browser,
        profile: install.profile,
        extension_id: install.id,
        extension_name: install.name,
        unpacked_path: install.unpackedPath,
        browser_was_running: hot,
        local_files: files,
        sync_files: syncFiles
      },
      null,
      2
    ),
    'utf8'
  )

  console.log(`saved ${human(totalBytes(files))} -> ${dest}`)
  wrote++
}

// Old backups are pruned rather than kept forever, but only ever the oldest,
// and only when there are more than `keep` of them.
if (existsSync(BACKUP_ROOT)) {
  const all = readdirSync(BACKUP_ROOT).filter((d) => /^\d{4}-\d{2}-\d{2}T/.test(d)).sort()
  for (const old of all.slice(0, Math.max(0, all.length - keep))) {
    rmSync(join(BACKUP_ROOT, old), { recursive: true, force: true })
    console.log(`pruned old backup ${old}`)
  }
}

console.log(`\n${wrote} backup(s) written under ${BACKUP_ROOT}`)
