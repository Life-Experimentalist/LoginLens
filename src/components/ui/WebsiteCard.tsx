import React from 'react'
import { motion } from 'framer-motion'
import { Key, Globe, ChevronRight, ExternalLink } from 'lucide-react'
import type { DomainEntry } from '../../core/storage/schema'
import { isAppPackageDomain } from '../../core/utils/domain'
import { AppNameDisplay } from './AppNameDisplay'
import { FaviconImage } from './FaviconImage'

interface WebsiteCardProps {
  data: DomainEntry
  onClick: () => void
}

export const WebsiteCard: React.FC<WebsiteCardProps> = ({ data, onClick }) => {
  const { domain, accounts } = data
  const hasOAuthLogin = accounts.some((a) => a.login_method?.type === 'oauth' && a.oauth_purpose !== 'integration')
  const hasDataIntegration = accounts.some((a) => a.login_method?.type === 'oauth' && a.oauth_purpose === 'integration')
  const hasPassword = accounts.some((a) => a.login_method?.type === 'password')
  const hasApiKey = accounts.some((a) => a.login_method?.type === 'api-key')
  const pinnedCount = accounts.filter((a) => a.pinned).length
  const autoPinnedCount = accounts.filter(
    (a) => a.auto_pinned && !a.pinned
  ).length

  const isLocal =
    domain.includes('localhost') ||
    domain.includes('127.0.0.1') ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(domain.split(':')[0])
  const isApp =
    data.domain_type === 'app' ||
    (data.domain_type !== 'website' && isAppPackageDomain(domain))

  return (
    <motion.button
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`p-5 rounded-xl border hover:shadow-lg transition-all text-left flex flex-col gap-3 shadow-sm group w-full ${
        isApp
          ? 'bg-purple-500/5 border-purple-500/30 hover:border-purple-500/60'
          : isLocal
            ? 'bg-amber-500/5 border-amber-500/30 hover:border-amber-500/60'
            : 'bg-card border-border hover:border-primary/50'
      }`}
    >
      {/* Header row: favicon + domain + arrow */}
      <div className="flex items-center gap-3">
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center overflow-hidden shrink-0 border ${
            isApp
              ? 'bg-purple-500/10 border-purple-500/20 text-purple-500'
              : isLocal
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-500'
                : 'bg-muted border-border'
          }`}
        >
          <FaviconImage domain={domain} size={20} />
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-foreground truncate text-sm">
                <AppNameDisplay domain={domain} />
              </p>
              {isApp && (
                <span className="text-[9px] uppercase tracking-wider font-bold bg-purple-500/20 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded">
                  App
                </span>
              )}
              {isLocal && (
                <span className="text-[9px] uppercase tracking-wider font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded">
                  Local Dev
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {accounts.length} account{accounts.length !== 1 ? 's' : ''}
            </p>
          </div>
          <a
            href={isLocal ? `http://${domain}` : `https://${domain}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="p-1.5 text-muted-foreground hover:text-primary hover:bg-muted rounded-md transition-colors"
            title={`Open ${domain}`}
          >
            <ExternalLink size={14} />
          </a>
        </div>
        <ChevronRight
          size={16}
          className="text-muted-foreground group-hover:text-primary transition-colors shrink-0"
        />
      </div>

      {/* Method badges */}
      <div className="flex items-center gap-2 flex-wrap">
        {hasPassword && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
            <Key size={10} /> Password
          </span>
        )}
        {hasOAuthLogin && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            🔑 OAuth Login
          </span>
        )}
        {hasApiKey && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
            ⚡ API Key
          </span>
        )}
        {hasDataIntegration && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
            🔌 Data Link
          </span>
        )}
        {pinnedCount > 0 && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
            ★ Pinned
          </span>
        )}
        {autoPinnedCount > 0 && pinnedCount === 0 && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
            ⊙ Auto-pin
          </span>
        )}
        {(() => {
          const linkedDomains = Array.from(
            new Set(accounts.flatMap((a) => a.linked_domains || []))
          ).filter((d) => d !== domain)

          if (linkedDomains.length === 0) return null

          return (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20">
              <Globe size={10} /> +{linkedDomains.length} Linked Site{linkedDomains.length !== 1 ? 's' : ''}
            </span>
          )
        })()}
      </div>
    </motion.button>
  )
}
