import React, { useState } from 'react'
import { Terminal, Smartphone } from 'lucide-react'
import { useStorage } from '@plasmohq/storage/hook'
import { extensionStorage } from '../../core/storage/config'
import { isAppPackageDomain } from '../../core/utils/domain'

/**
 * Opt-in remote favicons. Default off, and it has to stay that way.
 *
 * Asking Google for a favicon sends the domain in the query string, so with
 * this on, simply opening the vault tells a third party every site you keep
 * credentials for — from an extension whose whole premise is that nothing
 * leaves the device. The local monogram below is the default; the toggle in
 * Settings → Interface says plainly what turning it on costs.
 */
export const FAVICON_SOURCE_KEY = 'favicon_source'
export type FaviconSource = 'local' | 'google'

/** Deterministic tile colour, so a given domain always looks the same. */
const TILE_COLORS = [
  'bg-indigo-500/15 text-indigo-500',
  'bg-violet-500/15 text-violet-500',
  'bg-emerald-500/15 text-emerald-500',
  'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  'bg-sky-500/15 text-sky-500',
  'bg-rose-500/15 text-rose-500',
  'bg-teal-500/15 text-teal-500',
  'bg-fuchsia-500/15 text-fuchsia-500'
]

function tileColor(domain: string): string {
  let hash = 0
  for (let i = 0; i < domain.length; i++) {
    hash = (hash * 31 + domain.charCodeAt(i)) | 0
  }
  return TILE_COLORS[Math.abs(hash) % TILE_COLORS.length]
}

/** `mail.google.com` → `G`, `example.co.uk` → `E`. */
function monogram(domain: string): string {
  const label = domain
    .replace(/^www\./, '')
    .split('.')
    .filter((part) => part.length > 2)[0]
  return (label || domain)[0]?.toUpperCase() ?? '?'
}

interface FaviconImageProps {
  domain: string
  size?: number
  className?: string
}

export const FaviconImage: React.FC<FaviconImageProps> = ({
  domain,
  size = 18,
  className = ''
}) => {
  const [source] = useStorage<FaviconSource>(
    { key: FAVICON_SOURCE_KEY, instance: extensionStorage },
    'local'
  )
  const [error, setError] = useState(false)

  const cleanDomain = (domain || '').toLowerCase().trim()

  if (!cleanDomain) {
    return <Monogram domain="?" size={size} className={className} />
  }

  const isLocal =
    cleanDomain.includes('localhost') ||
    cleanDomain.includes('127.0.0.1') ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(cleanDomain.split(':')[0])

  if (isAppPackageDomain(cleanDomain)) {
    return <Smartphone size={size} className={className || 'text-purple-500'} />
  }
  if (isLocal) {
    return <Terminal size={size} className={className || 'text-amber-500'} />
  }

  if (source === 'google' && !error) {
    return (
      <img
        src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(cleanDomain)}&sz=32`}
        alt=""
        referrerPolicy="no-referrer"
        loading="lazy"
        className={`rounded object-contain shrink-0 ${className}`}
        style={{ width: size, height: size }}
        onError={() => setError(true)}
      />
    )
  }

  return <Monogram domain={cleanDomain} size={size} className={className} />
}

const Monogram: React.FC<{
  domain: string
  size: number
  className: string
}> = ({ domain, size, className }) => (
  <span
    aria-hidden="true"
    className={`inline-flex items-center justify-center rounded font-bold shrink-0 select-none ${tileColor(domain)} ${className}`}
    style={{
      width: size,
      height: size,
      fontSize: Math.max(9, Math.round(size * 0.55)),
      lineHeight: 1
    }}
  >
    {monogram(domain)}
  </span>
)
