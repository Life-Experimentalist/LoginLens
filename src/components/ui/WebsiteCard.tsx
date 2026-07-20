import React from 'react';
import { motion } from 'framer-motion';
import { Key, Globe, ChevronRight, ExternalLink, Terminal } from 'lucide-react';
import type { DomainEntry } from '../../core/storage/schema';

interface WebsiteCardProps {
  data: DomainEntry;
  onClick: () => void;
}

function getFaviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

export const WebsiteCard: React.FC<WebsiteCardProps> = ({ data, onClick }) => {
  const { domain, accounts } = data;
  const hasOAuth = accounts.some(a => a.login_method?.type === 'oauth');
  const hasPassword = accounts.some(a => a.login_method?.type === 'password');
  const pinnedCount = accounts.filter(a => a.pinned).length;

  const isLocal = domain.includes('localhost') || domain.includes('127.0.0.1') || /^\d{1,3}(\.\d{1,3}){3}$/.test(domain.split(':')[0]);

  return (
    <motion.button
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`p-5 rounded-xl border hover:shadow-lg transition-all text-left flex flex-col gap-3 shadow-sm group w-full ${
        isLocal ? 'bg-amber-500/5 border-amber-500/30 hover:border-amber-500/60' : 'bg-card border-border hover:border-primary/50'
      }`}
    >
      {/* Header row: favicon + domain + arrow */}
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center overflow-hidden shrink-0 border ${
          isLocal ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' : 'bg-muted border-border'
        }`}>
          {isLocal ? (
            <Terminal size={18} />
          ) : (
            <img
              src={getFaviconUrl(domain)}
              alt={domain}
              className="w-5 h-5"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-foreground truncate text-sm">{domain}</p>
              {isLocal && (
                <span className="text-[9px] uppercase tracking-wider font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded">Local Dev</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{accounts.length} account{accounts.length !== 1 ? 's' : ''}</p>
          </div>
          <a 
            href={isLocal ? `http://${domain}` : `https://${domain}`} 
            target="_blank" 
            rel="noreferrer"
            onClick={e => e.stopPropagation()}
            className="p-1.5 text-muted-foreground hover:text-primary hover:bg-muted rounded-md transition-colors"
            title={`Open ${domain}`}
          >
            <ExternalLink size={14} />
          </a>
        </div>
        <ChevronRight size={16} className="text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
      </div>

      {/* Method badges */}
      <div className="flex items-center gap-2 flex-wrap">
        {hasPassword && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
            <Key size={10} /> Password
          </span>
        )}
        {hasOAuth && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
            <Globe size={10} /> OAuth
          </span>
        )}
        {pinnedCount > 0 && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
            ★ Pinned
          </span>
        )}
      </div>
    </motion.button>
  );
};
