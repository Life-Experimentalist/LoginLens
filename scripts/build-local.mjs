// Builds the Edge package for everyday use: no hot-reload runtime, same pinned
// extension ID as `npm run dev`. Output goes to build/edge-mv3-prod, loaded as
// an unpacked extension. Run it again after pulling changes, then press Reload
// on the extension card; it does not touch build/edge-mv3-dev.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const env = { ...process.env, NODE_OPTIONS: '--no-deprecation' }
try {
  const line = readFileSync('.env.development', 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith('PLASMO_PUBLIC_EXT_KEY='))
  if (line) env.PLASMO_PUBLIC_EXT_KEY = line.slice(line.indexOf('=') + 1).trim()
} catch {
  console.warn('No .env.development, building without a pinned extension ID.')
}

const r = spawnSync('npx', ['plasmo', 'build', '--target=edge-mv3'], {
  stdio: 'inherit',
  shell: true,
  env
})
process.exit(r.status ?? 1)
