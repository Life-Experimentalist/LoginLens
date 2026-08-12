import React, { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStorage } from '@plasmohq/storage/hook'
import { extensionStorage } from '../../core/storage/config'
import {
  ShieldAlert,
  AlertTriangle,
  Link2,
  Unlink,
  CheckCircle2,
  ExternalLink,
  Info,
  ShieldCheck,
  RotateCcw,
  Layers,
  Sparkles,
  Tag,
} from 'lucide-react'
import type { DomainEntry, IdentityProfile } from '../../core/storage/schema'
import { analyzePasswordHashes, classifyReuseGroups } from '../../core/utils/password-inference'
import { useWeakFingerprints } from '../../core/hooks/useWeakFingerprints'
import type {
  ReuseGroup,
  ReuseGroupAccount
} from '../../core/utils/password-inference'
import { FaviconImage } from '../ui/FaviconImage'
import { AccountModal } from '../ui/AccountModal'
import { AppNameDisplay } from '../ui/AppNameDisplay'
import { isLocalEnvironment, getRootDomain, extractAccountPort } from '../../core/utils/domain'

interface GroupItemProps {
  group: ReuseGroup
  allGroupAccounts: ReuseGroupAccount[]
  groupIndex: number
  dashboardColumns: number
  isResolvedView?: boolean
  onLinkSelected: (accounts: ReuseGroupAccount[], allGroupAccounts: ReuseGroupAccount[]) => void
  onDismissSelected: (accounts: ReuseGroupAccount[], allGroupAccounts: ReuseGroupAccount[]) => void
  onLinkAliases: (accounts: ReuseGroupAccount[], allGroupAccounts: ReuseGroupAccount[]) => void
  onDismissAliases: (accounts: ReuseGroupAccount[], allGroupAccounts: ReuseGroupAccount[]) => void
  onResetGroup: (accounts: ReuseGroupAccount[]) => void
  onInspectAccount: (domain: string, filterIds?: string[]) => void
}

const GroupCard: React.FC<GroupItemProps> = ({
  group,
  allGroupAccounts,
  groupIndex,
  dashboardColumns,
  isResolvedView = false,
  onLinkSelected,
  onDismissSelected,
  onLinkAliases,
  onDismissAliases,
  onResetGroup,
  onInspectAccount
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(group.accounts.length > 5 ? [] : group.accounts.map((a) => a.accountId))
  )

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const selectAll = () =>
    setSelectedIds(new Set(group.accounts.map((a) => a.accountId)))
  const deselectAll = () => setSelectedIds(new Set())

  const selectedAccounts = useMemo(
    () => group.accounts.filter((a) => selectedIds.has(a.accountId)),
    [group.accounts, selectedIds]
  )

  const uniqueDomains = useMemo(
    () => Array.from(new Set(group.accounts.map((a) => a.domain))),
    [group.accounts]
  )

  const isIntraDomainOnly = uniqueDomains.length === 1

  return (
    <div className="p-5 rounded-2xl bg-card border border-border/80 shadow-sm flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`p-2 rounded-xl ${
              isResolvedView
                ? 'bg-green-500/10 text-green-500'
                : isIntraDomainOnly
                  ? 'bg-amber-500/10 text-amber-500'
                  : 'bg-red-500/10 text-red-500'
            }`}
          >
            {isResolvedView ? (
              <ShieldCheck size={20} />
            ) : (
              <AlertTriangle size={20} />
            )}
          </div>
          <div>
            <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
              Group #{groupIndex + 1}: {uniqueDomains.length} Domain
              {uniqueDomains.length !== 1 ? 's' : ''} ({group.accounts.length}{' '}
              Logins)
            </h4>
            <p className="text-[11px] text-muted-foreground font-mono">
              Hash: {group.hash.substring(0, 14)}...
            </p>
          </div>
        </div>

        {/* Actions bar */}
        {!isResolvedView ? (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={
                selectedIds.size === group.accounts.length
                  ? deselectAll
                  : selectAll
              }
              className="text-xs text-muted-foreground hover:text-foreground underline px-2 py-1"
            >
              {selectedIds.size === group.accounts.length
                ? 'Deselect All'
                : 'Select All'}
            </button>

            {isIntraDomainOnly ? (
              <>
                <button
                  onClick={() => onLinkAliases(selectedAccounts, allGroupAccounts)}
                  disabled={selectedAccounts.length < 2}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 font-semibold rounded-lg transition-colors disabled:opacity-50 border border-amber-500/20"
                >
                  <Layers size={13} /> Link as Same-Site Aliases (
                  {selectedAccounts.length})
                </button>
                <button
                  onClick={() => onDismissAliases(selectedAccounts, allGroupAccounts)}
                  disabled={selectedAccounts.length === 0}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground font-medium rounded-lg transition-colors disabled:opacity-50 border border-border"
                >
                  <Unlink size={13} /> Different / Not Alias (
                  {selectedAccounts.length})
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => onLinkSelected(selectedAccounts, allGroupAccounts)}
                  disabled={selectedAccounts.length < 2}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 shadow-sm"
                >
                  <Link2 size={13} /> Link as Same Account (
                  {selectedAccounts.length})
                </button>

                <button
                  onClick={() => onDismissSelected(selectedAccounts, allGroupAccounts)}
                  disabled={selectedAccounts.length === 0}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground font-medium rounded-lg transition-colors disabled:opacity-50 border border-border"
                >
                  <Unlink size={13} /> Different Accounts (
                  {selectedAccounts.length})
                </button>
              </>
            )}
          </div>
        ) : (
          <button
            onClick={() => onResetGroup(group.accounts)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground font-semibold rounded-lg transition-colors border border-border"
          >
            <RotateCcw size={13} /> Re-open Group Review
          </button>
        )}
      </div>

      {/* Account items grid (grouped by root domain) */}
      <div className={`columns-1 ${dashboardColumns >= 4 ? 'md:columns-2 lg:columns-3 xl:columns-4' : 'md:columns-2 lg:columns-3'} gap-4 mt-2 space-y-4`}>
        {Object.entries(
          group.accounts.reduce((acc, account) => {
            const domain = getRootDomain(account.domain);
            if (!acc[domain]) acc[domain] = [];
            acc[domain].push(account);
            return acc;
          }, {} as Record<string, ReuseGroupAccount[]>)
        ).map(([domain, accountsInDomain]) => (
          <div key={domain} className="break-inside-avoid space-y-3 p-3.5 rounded-xl border border-border/80 bg-muted/40 shadow-sm inline-block w-full">
            <div className="flex items-center gap-2.5 px-1 mb-1">
              <FaviconImage domain={domain} size={18} />
              <span className="text-[13px] font-bold text-foreground">
                <AppNameDisplay domain={domain} />
              </span>
              <span className="text-[10px] text-muted-foreground font-semibold font-mono bg-background border border-border/50 px-2 py-0.5 rounded-md shadow-sm ml-auto">
                {accountsInDomain.length} {accountsInDomain.length === 1 ? 'Login' : 'Logins'}
              </span>
            </div>
            
            <div className="flex flex-col gap-2">
              {accountsInDomain.map((acc) => {
                const isSelected = selectedIds.has(acc.accountId)
                return (
                  <div
                    key={acc.accountId}
                    className={`p-2.5 rounded-lg border text-xs flex items-start justify-between gap-3 transition-colors ${
                      isSelected
                        ? 'bg-muted/80 border-primary/40'
                        : 'bg-background border-border/60 hover:border-border transition-colors'
                    }`}
                  >
                    <label className="flex items-start gap-2.5 min-w-0 cursor-pointer flex-1 pt-0.5">
                      {!isResolvedView && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(acc.accountId)}
                          className="rounded border-border accent-primary cursor-pointer shrink-0 mt-0.5"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold text-foreground truncate text-[13px]">
                            {acc.identity}
                          </p>
                          {acc.login_method_type && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono uppercase">
                              {acc.login_method_type}
                            </span>
                          )}
                        </div>

                        {isLocalEnvironment(acc.domain) && (() => {
                          const p = extractAccountPort(acc, acc.domain)
                          if (p) {
                            return (
                              <p className="text-[10px] text-muted-foreground mt-1">
                                <span className="px-1.5 py-0.5 rounded bg-muted/80 font-mono text-foreground border border-border/50">
                                  Port: {p}
                                </span>
                              </p>
                            )
                          }
                          return null
                        })()}


                        {/* Provenance Tag & Linked Domains */}
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          {acc.vault_source && (
                            <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-500 font-medium">
                              <Tag size={9} /> Source: {acc.vault_source}
                            </span>
                          )}
                          {acc.linked_domains && acc.linked_domains.length > 0 && (
                            <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-500 font-medium">
                              <Link2 size={9} /> Same Account: {acc.linked_domains.join(', ')}
                            </span>
                          )}
                          {acc.dismissed_mirrors && acc.dismissed_mirrors.length > 0 && (
                            <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-400 font-medium">
                              <Unlink size={9} /> Different Account: {acc.dismissed_mirrors.join(', ')}
                            </span>
                          )}
                          {acc.dismissed_aliases && acc.dismissed_aliases.length > 0 && (
                            <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-500 font-medium">
                              <Unlink size={9} /> Different / Not Alias: {acc.dismissed_aliases.length}
                            </span>
                          )}
                        </div>
                      </div>
                    </label>

                    {/* Inspect button */}
                    <button
                      onClick={() => onInspectAccount(acc.domain, group.accounts.map(a => a.accountId))}
                      className="text-muted-foreground hover:text-indigo-500 transition-colors p-1.5 hover:bg-indigo-500/10 rounded-md shrink-0 mt-0.5"
                      title="Inspect Vault Source"
                    >
                      <ExternalLink size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export const SecurityReviewView: React.FC = () => {
  const [savedAccountsRaw, setSavedAccounts] = useStorage<DomainEntry[]>(
    { key: 'saved_accounts', instance: extensionStorage },
    []
  )

  // Local optimistic state for instant UI snappiness
  const [localAccountsOverride, setLocalAccountsOverride] = useState<DomainEntry[] | null>(null)
  const [activeTab, setActiveTab] = useState<'active' | 'resolved'>('active')
  const [inspectModalDomain, setInspectModalDomain] = useState<string | null>(
    null
  )
  const [inspectModalAccounts, setInspectModalAccounts] = useState<
    IdentityProfile[]
  >([])
  const [inspectModalFilterIds, setInspectModalFilterIds] = useState<string[] | null>(null)

  // Toast state with Undo support
  const [toast, setToast] = useState<{
    message: string
    previousAccounts: DomainEntry[]
  } | null>(null)

  const [autoResolveLeftovers, setAutoResolveLeftovers] = useState(false)

  // Effective accounts: use local optimistic state if available, else storage
  const effectiveAccounts = useMemo(() => {
    return localAccountsOverride !== null
      ? localAccountsOverride
      : Array.isArray(savedAccountsRaw)
        ? savedAccountsRaw
        : []
  }, [localAccountsOverride, savedAccountsRaw])

  const [dashboardColumns] = useStorage<number>(
    { key: 'dashboard_columns', instance: extensionStorage },
    3
  )

  // Clear local override when savedAccountsRaw updates to match it
  React.useEffect(() => {
    if (localAccountsOverride !== null && savedAccountsRaw) {
      setLocalAccountsOverride(null)
    }
    // Deliberately keyed on the storage value alone: the point is to drop the
    // optimistic override once real data lands. Listing the override would make
    // setting it immediately schedule its own clear.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedAccountsRaw])

  // Run hash inference
  const weakFingerprints = useWeakFingerprints()
  const reuseAnalysis = useMemo(
    () => analyzePasswordHashes(effectiveAccounts, weakFingerprints),
    [effectiveAccounts, weakFingerprints]
  )

  // Classify groups into active and resolved
  const { activeGroups, resolvedGroups } = useMemo(() => {
    return classifyReuseGroups(reuseAnalysis.reuseGroups, autoResolveLeftovers)
  }, [reuseAnalysis.reuseGroups, autoResolveLeftovers])

  // Compute intra-domain groups for the auto-resolve button
  const intraDomainGroups = useMemo(() => {
    return activeGroups.filter(group => {
      const originalGroup = reuseAnalysis.reuseGroups.find(g => g.hash === group.hash)
      const uniqueDomains = Array.from(new Set((originalGroup?.accounts || group.accounts).map((a) => a.domain)))
      return uniqueDomains.length === 1
    })
  }, [activeGroups, reuseAnalysis.reuseGroups])

  // Helper to commit account changes optimistically and show Undo toast
  const commitAccountChange = (
    updated: DomainEntry[],
    toastMsg: string
  ) => {
    const prev = effectiveAccounts
    setLocalAccountsOverride(updated)
    setSavedAccounts(updated)
    setToast({ message: toastMsg, previousAccounts: prev })
  }

  const handleUndo = () => {
    if (!toast) return
    const prev = toast.previousAccounts
    setLocalAccountsOverride(prev)
    setSavedAccounts(prev)
    setToast(null)
  }

  // Actions
  const handleLinkSelected = (selectedAccs: ReuseGroupAccount[]) => {
    if (!effectiveAccounts || selectedAccs.length < 2) return
    const targetDomains = Array.from(new Set(selectedAccs.map((a) => a.domain)))
    const targetIds = new Set(selectedAccs.map((a) => a.accountId))

    const updated = effectiveAccounts.map((entry) => {
      if (!targetDomains.includes(entry.domain)) return entry
      return {
        ...entry,
        accounts: entry.accounts.map((acc) => {
          if (!targetIds.has(acc.id)) return acc
          
          const currentLinked = new Set(acc.linked_domains || [])
          const currentAliases = new Set(acc.intra_domain_aliases || [])
          
          selectedAccs.forEach(otherAcc => {
            if (otherAcc.accountId === acc.id) return
            if (otherAcc.domain !== entry.domain) {
              currentLinked.add(otherAcc.domain)
            } else {
              currentAliases.add(otherAcc.accountId)
            }
          })
          
          return { 
            ...acc, 
            linked_domains: Array.from(currentLinked),
            intra_domain_aliases: Array.from(currentAliases)
          }
        })
      }
    })
    commitAccountChange(
      updated,
      `Linked ${selectedAccs.length} accounts as mirror domains.`
    )
  }

  const handleDismissSelected = (selectedAccs: ReuseGroupAccount[], allGroupAccounts: ReuseGroupAccount[] = []) => {
    if (!effectiveAccounts || selectedAccs.length === 0) return
    const targetDomains = Array.from(new Set(selectedAccs.map((a) => a.domain)))
    const targetIds = new Set(selectedAccs.map((a) => a.accountId))

    const updated = effectiveAccounts.map((entry) => {
      if (!targetDomains.includes(entry.domain)) return entry
      return {
        ...entry,
        accounts: entry.accounts.map((acc) => {
          if (!targetIds.has(acc.id)) return acc
          
          const currentDismissedMirrors = new Set(acc.dismissed_mirrors || [])
          const currentDismissedAliases = new Set(acc.dismissed_aliases || [])
          
          const targets = allGroupAccounts
          
          targets.forEach(otherAcc => {
            if (otherAcc.accountId === acc.id) return
            if (otherAcc.domain !== entry.domain) {
              currentDismissedMirrors.add(otherAcc.domain)
            } else {
              currentDismissedAliases.add(otherAcc.accountId)
            }
          })
          
          return { 
            ...acc, 
            dismissed_mirrors: Array.from(currentDismissedMirrors),
            dismissed_aliases: Array.from(currentDismissedAliases)
          }
        })
      }
    })
    commitAccountChange(
      updated,
      `Marked ${selectedAccs.length} domains as different / not mirrors.`
    )
  }



  // Auto-resolve ALL intra-domain (same-site) accounts in 1 click
  const handleAutoResolveAllIntraDomain = () => {
    if (!effectiveAccounts || intraDomainGroups.length === 0) return

    // Build a map of accountId -> list of sibling accountIds on the same domain
    const aliasMap = new Map<string, string[]>()
    for (const group of intraDomainGroups) {
      const ids = group.accounts.map((a) => a.accountId)
      for (const a of group.accounts) {
        aliasMap.set(
          a.accountId,
          ids.filter((id) => id !== a.accountId)
        )
      }
    }

    const updated = effectiveAccounts.map((entry) => ({
      ...entry,
      accounts: entry.accounts.map((acc) => {
        const siblings = aliasMap.get(acc.id)
        if (!siblings || siblings.length === 0) return acc
        const currentAliases = new Set(acc.intra_domain_aliases || [])
        siblings.forEach((id) => currentAliases.add(id))
        return { ...acc, intra_domain_aliases: Array.from(currentAliases) }
      })
    }))

    commitAccountChange(
      updated,
      `Auto-resolved all ${intraDomainGroups.length} same-site password groups!`
    )
  }

  const handleResetGroup = (groupAccs: ReuseGroupAccount[]) => {
    if (!effectiveAccounts) return
    const targetIds = new Set(groupAccs.map((a) => a.accountId))

    const updated = effectiveAccounts.map((entry) => ({
      ...entry,
      accounts: entry.accounts.map((acc) => {
        if (!targetIds.has(acc.id)) return acc
        return {
          ...acc,
          linked_domains: [],
          dismissed_mirrors: [],
          intra_domain_aliases: []
        }
      })
    }))
    commitAccountChange(
      updated,
      `Re-opened review for ${groupAccs.length} accounts.`
    )
  }

  const handleInspectAccount = (domain: string, filterIds?: string[]) => {
    const found = (effectiveAccounts || []).find((d) => d.domain === domain)
    if (found) {
      setInspectModalDomain(found.domain)
      setInspectModalAccounts(found.accounts)
      setInspectModalFilterIds(filterIds || null)
    }
  }

  return (
    <div className="p-8 max-w-6xl mx-auto w-full pb-24 space-y-6 relative">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-1 flex items-center gap-3">
            <ShieldAlert size={28} className="text-indigo-500" />
            Security & Account Grouping Review
          </h1>
          <p className="text-muted-foreground text-sm">
            Detect password reuse, link shared accounts across domains, and organize same-site aliases.
          </p>
        </div>

        {/* Tab switchers */}
        <div className="flex gap-2 bg-muted p-1 rounded-xl border border-border">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-3.5 py-2 text-xs rounded-lg font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'active'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <AlertTriangle size={14} className="text-red-500" />
            Active Threats ({activeGroups.length})
          </button>

          <button
            onClick={() => setActiveTab('resolved')}
            className={`px-3.5 py-2 text-xs rounded-lg font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'resolved'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <CheckCircle2 size={14} className="text-green-500" />
            Resolved ({resolvedGroups.length})
          </button>
        </div>
        
        <div className="flex items-center gap-2 px-1">
          <label className="flex items-center gap-2 cursor-pointer group">
            <input 
              type="checkbox" 
              checked={autoResolveLeftovers} 
              onChange={(e) => setAutoResolveLeftovers(e.target.checked)} 
              className="w-4 h-4 rounded text-indigo-500 focus:ring-indigo-500 bg-background border-border"
            />
            <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
              Auto-resolve leftover single accounts
            </span>
          </label>
        </div>
      </div>

      {/* Helper Banners based on tab */}
      {activeTab === 'active' && (
        <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-center justify-between flex-wrap gap-4 text-xs leading-relaxed">
          <div className="flex items-start gap-3">
             <Info size={18} className="text-indigo-500 shrink-0 mt-0.5" />
             <div className="text-muted-foreground space-y-1">
               <p className="font-semibold text-foreground">Password Reuse Threats:</p>
               <p>• Review the grouped accounts below. Link them if they are aliases/mirrors of the same account, or mark them as different to clear the warning.</p>
               <p>• Note: You can auto-resolve all Same-Site accounts (multiple logins on the exact same website) in one click.</p>
             </div>
          </div>
          {intraDomainGroups.length > 0 && (
             <button
               onClick={handleAutoResolveAllIntraDomain}
               className="px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center gap-2 shrink-0"
             >
               <Sparkles size={14} /> Auto-Resolve All Same-Site Accounts ({intraDomainGroups.length})
             </button>
          )}
        </div>
      )}

      {/* Main List */}
      <div className="space-y-4">
        {activeTab === 'active' ? (
          activeGroups.length === 0 ? (
            <div className="text-center py-24 px-4 bg-muted/30 rounded-2xl border border-dashed border-border flex flex-col items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
                <CheckCircle2 size={32} className="text-emerald-500" />
              </div>
              <div className="max-w-md">
                <p className="font-bold text-foreground text-base">No Password Reuse Threats!</p>
                <p className="text-muted-foreground mt-2 text-sm">
                  All accounts use unique passwords or have been successfully organized and linked.
                </p>
              </div>
            </div>
          ) : (
            activeGroups.map((group, idx) => (
              <GroupCard
                key={group.hash + '_' + group.accounts.map((a) => a.accountId).join('_')}
                group={group}
                allGroupAccounts={reuseAnalysis.reuseGroups.find(g => g.hash === group.hash)?.accounts || []}
                groupIndex={idx}
                dashboardColumns={dashboardColumns}
                onLinkSelected={handleLinkSelected}
                onDismissSelected={handleDismissSelected}
                onLinkAliases={handleLinkSelected}
                onDismissAliases={handleDismissSelected}
                onResetGroup={handleResetGroup}
                onInspectAccount={handleInspectAccount}
              />
            ))
          )
        ) : resolvedGroups.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground flex flex-col items-center justify-center gap-3 bg-card border border-border rounded-2xl">
            <p className="font-bold text-foreground text-base">No Resolved Groups Yet</p>
            <p className="text-xs max-w-sm">
              When you link or resolve groups in the Active Threats tab, they will appear here.
            </p>
          </div>
        ) : (
          resolvedGroups.map((group, idx) => (
            <GroupCard
              key={group.hash + '_' + group.accounts.map((a) => a.accountId).join('_')}
              group={group}
              allGroupAccounts={reuseAnalysis.reuseGroups.find(g => g.hash === group.hash)?.accounts || []}
              groupIndex={idx}
              dashboardColumns={dashboardColumns}
              isResolvedView
              onLinkSelected={handleLinkSelected}
              onDismissSelected={handleDismissSelected}
              onLinkAliases={handleLinkSelected}
              onDismissAliases={handleDismissSelected}
              onResetGroup={handleResetGroup}
              onInspectAccount={handleInspectAccount}
            />
          ))
        )}
      </div>

      {/* Floating Toast Notification with Undo */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-50 p-4 rounded-xl bg-card border border-primary/30 shadow-2xl flex items-center gap-4 text-xs max-w-md"
          >
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <CheckCircle2 size={16} className="text-green-500 shrink-0" />
              <span className="font-medium text-foreground truncate">
                {toast.message}
              </span>
            </div>
            <button
              onClick={handleUndo}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground font-bold rounded-lg hover:bg-primary/90 transition-colors shrink-0"
            >
              <RotateCcw size={12} /> Undo
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Account Inspect Modal */}
      {inspectModalDomain && (
        <AccountModal
          isOpen={!!inspectModalDomain}
          domain={inspectModalDomain}
          accounts={inspectModalAccounts}
          filterAccountIds={inspectModalFilterIds || undefined}
          onClose={() => {
            setInspectModalDomain(null)
            setInspectModalAccounts([])
            setInspectModalFilterIds(null)
          }}
        />
      )}
    </div>
  )
}
