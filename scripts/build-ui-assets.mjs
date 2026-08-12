/**
 * Regenerates the display-sized artwork the extension UI imports.
 *
 * The files in `assets/` are masters: 1536px and 2048px squares, kept at that
 * size because the store listings and the website need them. The extension UI
 * renders the same art at 80px, 112px and 160px, so importing a master into a
 * component ships several megabytes to draw a thumbnail. Every byte of that
 * lands in the package a user downloads and in every update after it.
 *
 * Each derivative below is sized to roughly three times its largest on-screen
 * size, which covers a 3x display with room to spare.
 *
 * Run after changing anything in `assets/`:
 *   npm run assets
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const ROOT = path.resolve(import.meta.dirname, '..')
const OUT = path.join(ROOT, 'assets', 'ui')

/** `rendered` is the largest CSS size the file appears at, for the record. */
const DERIVATIVES = [
  { from: 'icon.png', to: 'icon.png', size: 256, rendered: '80px' },
  {
    from: 'icon_starry_sky.png',
    to: 'icon-starry-sky.png',
    size: 384,
    rendered: '112px'
  },
  {
    from: 'logo_transparent.png',
    to: 'logo-transparent.png',
    size: 512,
    rendered: '160px'
  }
]

await mkdir(OUT, { recursive: true })

for (const { from, to, size, rendered } of DERIVATIVES) {
  const source = path.join(ROOT, 'assets', from)
  const target = path.join(OUT, to)

  await sharp(source)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    // palette + effort 10 is what turns a multi-megabyte export into tens of
    // kilobytes. These are flat illustrations, so the quantisation is not
    // visible at the sizes they are drawn at.
    .png({ palette: true, quality: 90, effort: 10 })
    .toFile(target)

  const before = (await readFile(source)).length
  const after = (await readFile(target)).length
  const pct = (100 - (after / before) * 100).toFixed(1)
  console.log(
    `${from} -> assets/ui/${to}  ${size}px (drawn at ${rendered})  ` +
      `${(before / 1024 / 1024).toFixed(2)}MB -> ${(after / 1024).toFixed(0)}KB  -${pct}%`
  )
}

await writeFile(
  path.join(OUT, 'README.md'),
  '# Generated\n\nThese files are produced by `npm run assets` from the masters\n' +
    'in `assets/`. Edit the masters, not these.\n'
)
