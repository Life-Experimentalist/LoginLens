import React, { useState } from 'react';
import { Home, LayoutDashboard, BarChart2, Settings, ChevronLeft, ChevronRight, Key, KeyRound, Globe, Layers, Database } from 'lucide-react';
import iconUrl from "url:~/assets/icon.png";
import { useStorage } from '@plasmohq/storage/hook';
import { extensionStorage } from '../../core/storage/config';
import type { DomainEntry, GlobalOAuthAccount } from '../../core/storage/schema';

export type ViewType = 'at-a-glance' | 'dashboard' | 'passwords' | 'oauth' | 'api-keys' | 'stats' | 'settings';

interface SidebarProps {
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;
}

const navSections = [
  {
    label: null,
    items: [
      { id: 'at-a-glance', icon: Home, label: 'At a Glance', color: 'text-primary' },
      { id: 'stats', icon: BarChart2, label: 'Statistics', color: 'text-blue-400' },
    ],
  },
  {
    label: 'Vault',
    items: [
      { id: 'dashboard', icon: LayoutDashboard, label: 'All Entries', color: 'text-zinc-400' },
      { id: 'passwords', icon: Key, label: 'Passwords', color: 'text-emerald-400' },
      { id: 'oauth', icon: Globe, label: 'OAuth Registry', color: 'text-indigo-400' },
      { id: 'api-keys', icon: KeyRound, label: 'API Keys', color: 'text-amber-400' },
    ],
  },
  {
    label: null,
    items: [
      { id: 'settings', icon: Settings, label: 'Settings', color: 'text-zinc-400' },
    ],
  },
] as const;

export const Sidebar: React.FC<SidebarProps> = ({ activeView, setActiveView }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  
  const [savedAccounts] = useStorage<DomainEntry[]>({ key: "saved_accounts", instance: extensionStorage }, []);
  const [oauthRegistry] = useStorage<GlobalOAuthAccount[]>({ key: "oauth_registry", instance: extensionStorage }, []);

  const totalVaultItems = savedAccounts?.reduce((sum, d) => sum + d.accounts.length, 0) || 0;
  const totalOAuth = oauthRegistry?.length || 0;

  return (
    <aside
      className={`${
        isCollapsed ? 'w-16' : 'w-60'
      } border-r border-border bg-card text-card-foreground flex flex-col h-full transition-all duration-300 relative shrink-0`}
    >
      {/* Toggle Button */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-6 z-10 bg-card border border-border rounded-full p-1 shadow-md hover:bg-muted text-foreground transition-colors"
        title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
      >
        {isCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
      </button>

      {/* Header / Logo */}
      <div className={`p-4 pb-3 flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5'} border-b border-border`}>
        <img
          src={iconUrl}
          alt="LoginLens Logo"
          className="w-8 h-8 object-contain rounded-lg shrink-0"
        />
        {!isCollapsed && (
          <div className="min-w-0">
            <span className="text-base font-bold tracking-tight truncate block">LoginLens</span>
            <span className="text-[10px] text-muted-foreground font-medium">Identity Vault</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-1">
        {navSections.map((section, si) => (
          <div key={si} className={si > 0 ? 'pt-2' : ''}>
            {section.label && !isCollapsed && (
              <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest px-2 mb-1">
                {section.label}
              </p>
            )}
            {section.label && isCollapsed && si > 0 && (
              <div className="border-t border-border my-2" />
            )}
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveView(item.id as ViewType)}
                  title={isCollapsed ? item.label : undefined}
                  className={`w-full flex items-center ${
                    isCollapsed ? 'justify-center' : 'gap-3'
                  } px-2.5 py-2 rounded-lg transition-all duration-150 ${
                    isActive
                      ? 'bg-primary/10 text-primary font-semibold border border-primary/20'
                      : `hover:bg-muted ${item.color} hover:text-foreground`
                  }`}
                >
                  <Icon size={18} className="shrink-0" />
                  {!isCollapsed && (
                    <span className="font-medium text-sm truncate">{item.label}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Bottom version badge */}
      {!isCollapsed && (
        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-muted/50 justify-between">
            <div className="flex items-center gap-1.5" title="Total Vault Entries">
              <Database size={13} className="text-muted-foreground shrink-0" />
              <span className="text-[11px] text-muted-foreground font-medium">{totalVaultItems}</span>
            </div>
            <div className="flex items-center gap-1.5" title="Total OAuth Identities">
              <Globe size={13} className="text-muted-foreground shrink-0" />
              <span className="text-[11px] text-muted-foreground font-medium">{totalOAuth}</span>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
