import React, { useState, useEffect } from 'react'
import { Download, CheckCircle2, Sparkles } from 'lucide-react'
import { EXTERNAL_LINK_PROPS, RELEASES_URL } from '../constants/links'

export const ExtensionStatusBadge: React.FC = () => {
  const [isInstalled, setIsInstalled] = useState(false)
  // Empty until the extension reports its own version. Hardcoding one here
  // meant the badge confidently displayed a version the visitor did not have.
  const [version, setVersion] = useState<string>('')

  useEffect(() => {
    // 1. Check DOM attribute injected by bridge-content.ts
    const checkDom = () => {
      const attr = document.documentElement.getAttribute('data-loginlens-installed')
      const ver = document.documentElement.getAttribute('data-loginlens-version')
      if (attr === 'true') {
        setIsInstalled(true)
        if (ver) setVersion(ver)
      }
    }

    checkDom()

    // 2. Listen for CustomEvent emitted by bridge-content.ts
    const handleEvent = (e: any) => {
      if (e.detail?.installed) {
        setIsInstalled(true)
        if (e.detail.version) setVersion(e.detail.version)
      }
    }

    window.addEventListener('LOGINLENS_EXTENSION_DETECTED', handleEvent)

    // Send a ping request in case content script loaded early
    window.dispatchEvent(new CustomEvent('LOGINLENS_PING_REQUEST'))

    return () => {
      window.removeEventListener('LOGINLENS_EXTENSION_DETECTED', handleEvent)
    }
  }, [])

  if (isInstalled) {
    return (
      <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold shadow-sm animate-pulse">
        <CheckCircle2 size={16} className="text-emerald-400" />
        <span>LoginLens Extension Active{version && ` (v${version})`}</span>
        <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
      </div>
    )
  }

  return (
    <a
      href={RELEASES_URL}
      {...EXTERNAL_LINK_PROPS}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs font-semibold hover:bg-primary/20 transition-all shadow-sm group"
    >
      <Sparkles size={15} className="text-primary group-hover:scale-110 transition-transform" />
      <span>Install LoginLens for Chrome & Edge</span>
      <Download size={14} />
    </a>
  )
}
