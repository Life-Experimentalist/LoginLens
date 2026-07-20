import React, { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Globe,
  Trash2,
  Edit3,
  X,
  Save,
  ChevronDown,
  ChevronRight,
  Plus,
  Tag
} from 'lucide-react'
import type { GlobalOAuthAccount, DomainEntry } from '../../core/storage/schema'

interface Props {
  oauthRegistry: GlobalOAuthAccount[]
  setOauthRegistry: (val: GlobalOAuthAccount[]) => void
  savedAccounts: DomainEntry[]
  setSavedAccounts: (val: DomainEntry[]) => void
}

const KNOWN_PROVIDERS: Record<string, { label: string; color: string }> = {
  'google.com': { label: 'Google', color: 'from-red-500 to-yellow-500' },
  'github.com': { label: 'GitHub', color: 'from-gray-600 to-gray-900' },
  'microsoft.com': { label: 'Microsoft', color: 'from-blue-500 to-cyan-500' },
  'apple.com': { label: 'Apple', color: 'from-gray-400 to-gray-700' },
  'facebook.com': { label: 'Facebook', color: 'from-blue-600 to-blue-800' },
  'twitter.com': { label: 'Twitter/X', color: 'from-sky-400 to-sky-600' },
  'discord.com': { label: 'Discord', color: 'from-indigo-500 to-purple-600' },
  'linkedin.com': { label: 'LinkedIn', color: 'from-blue-700 to-cyan-700' },
  'slack.com': { label: 'Slack', color: 'from-orange-400 to-pink-500' }
}

export const GlobalOAuthSection: React.FC<Props> = ({
  oauthRegistry,
  setOauthRegistry,
  savedAccounts,
  setSavedAccounts
}) => {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editIdentity, setEditIdentity] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(
    new Set()
  )
  const [isAdding, setIsAdding] = useState(false)
  const [newProvider, setNewProvider] = useState('')
  const [newIdentity, setNewIdentity] = useState('')
  const [newNotes, setNewNotes] = useState('')

  if (!oauthRegistry) return null

  // ── Group by provider ─────────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<string, GlobalOAuthAccount[]>()
    oauthRegistry.forEach((acc) => {
      if (!map.has(acc.provider)) map.set(acc.provider, [])
      map.get(acc.provider)!.push(acc)
    })
    // Sort: known providers first, then alphabetical
    return Array.from(map.entries()).sort(([a], [b]) => {
      const aKnown = a in KNOWN_PROVIDERS ? 0 : 1
      const bKnown = b in KNOWN_PROVIDERS ? 0 : 1
      return aKnown - bKnown || a.localeCompare(b)
    })
  }, [oauthRegistry])

  const toggleProvider = (provider: string) => {
    setExpandedProviders((prev) => {
      const next = new Set(prev)
      if (next.has(provider)) next.delete(provider)
      else next.add(provider)
      return next
    })
  }

  const handleEdit = (acc: GlobalOAuthAccount) => {
    setEditingId(acc.id)
    setEditIdentity(acc.identity)
    setEditNotes(acc.notes || '')
  }

  const handleDelete = (id: string) => {
    if (
      !window.confirm(
        "Remove this OAuth account from the registry? (This won't delete website logins)"
      )
    )
      return
    setOauthRegistry(oauthRegistry.filter((a) => a.id !== id))
  }

  const handleSave = (id: string) => {
    const originalAcc = oauthRegistry.find((a) => a.id === id)
    if (!originalAcc) return

    const trimmedIdentity = editIdentity.trim()
    if (!trimmedIdentity) {
      alert('Identity cannot be empty')
      return
    }

    // Update registry
    setOauthRegistry(
      oauthRegistry.map((acc) =>
        acc.id === id
          ? {
              ...acc,
              identity: trimmedIdentity,
              notes: editNotes.trim(),
              updated_at: Date.now()
            }
          : acc
      )
    )

    // Cascade-update vault entries if identity changed
    if (originalAcc.identity !== trimmedIdentity) {
      setSavedAccounts(
        savedAccounts.map((domainEntry) => ({
          ...domainEntry,
          accounts: domainEntry.accounts.map((a) => {
            if (
              a.login_method.type === 'oauth' &&
              a.login_method.provider === originalAcc.provider &&
              a.identities[0] === originalAcc.identity
            ) {
              return {
                ...a,
                identities: [trimmedIdentity],
                updated_at: Date.now()
              }
            }
            return a
          })
        }))
      )
    }

    setEditingId(null)
  }

  const handleAddNew = () => {
    if (!newProvider.trim() || !newIdentity.trim()) {
      alert('Provider and Identity are required.')
      return
    }
    const cleanProvider = newProvider
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
    const newAcc: GlobalOAuthAccount = {
      id: crypto.randomUUID?.() ?? Math.random().toString(36).substring(2),
      provider: cleanProvider,
      identity: newIdentity.trim(),
      notes: newNotes.trim(),
      is_manual: true,
      created_at: Date.now(),
      updated_at: Date.now()
    }
    setOauthRegistry([...oauthRegistry, newAcc])
    setIsAdding(false)
    setNewProvider('')
    setNewIdentity('')
    setNewNotes('')
  }

  return (
    <div className="mb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Globe className="text-indigo-500" size={20} />
          <h2 className="text-xl font-bold tracking-tight">
            Global OAuth Registry
          </h2>
          <span className="text-xs bg-indigo-500/10 text-indigo-500 px-2 py-0.5 rounded-full font-semibold">
            {oauthRegistry.length}
          </span>
        </div>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
        >
          <Plus size={14} />
          {isAdding ? 'Cancel' : 'Add OAuth Provider'}
        </button>
      </div>

      {/* Add Form */}
      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-6 p-4 border border-primary/20 bg-primary/5 rounded-xl space-y-3"
          >
            <p className="text-sm font-semibold text-foreground mb-1">
              Add a manual OAuth provider & account
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                  Provider Domain
                </label>
                <input
                  type="text"
                  value={newProvider}
                  onChange={(e) => setNewProvider(e.target.value)}
                  placeholder="e.g. microsoft.com"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary text-foreground"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                  Email / Username
                </label>
                <input
                  type="text"
                  value={newIdentity}
                  onChange={(e) => setNewIdentity(e.target.value)}
                  placeholder="e.g. you@example.com"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary text-foreground"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                Notes (optional)
              </label>
              <input
                type="text"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="e.g. Work account, Personal…"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary text-foreground"
              />
            </div>
            <div className="flex justify-end pt-1">
              <button
                onClick={handleAddNew}
                className="px-4 py-2 bg-primary text-primary-foreground text-sm font-bold rounded-lg hover:bg-primary/90 transition-colors"
              >
                Save Provider
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state */}
      {oauthRegistry.length === 0 && !isAdding && (
        <div className="p-8 text-center border border-dashed border-border rounded-xl">
          <Globe size={32} className="mx-auto mb-2 text-muted-foreground/40" />
          <p className="text-muted-foreground text-sm">
            No OAuth identities in registry.
          </p>
          <p className="text-muted-foreground/60 text-xs mt-1">
            Log in to a site via OAuth or add one manually.
          </p>
        </div>
      )}

      {/* Grouped Provider Sections */}
      <div className="space-y-4">
        {grouped.map(([provider, accounts]) => {
          const isCollapsed = !expandedProviders.has(provider)
          const providerInfo = KNOWN_PROVIDERS[provider]
          const connectedSitesAll = new Set<string>()
          accounts.forEach((acc) => {
            if (acc.linked_websites) {
              acc.linked_websites.forEach((w) => connectedSitesAll.add(w))
            }
          })

          return (
            <motion.div
              key={provider}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="border border-border rounded-xl overflow-hidden bg-card shadow-sm"
            >
              {/* Provider Header */}
              <button
                onClick={() => toggleProvider(provider)}
                className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors text-left"
              >
                <img
                  src={`https://www.google.com/s2/favicons?domain=${provider}&sz=32`}
                  className="w-6 h-6 rounded"
                  alt={provider}
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-foreground text-sm">
                    {providerInfo?.label || provider}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {accounts.length} account{accounts.length !== 1 ? 's' : ''}{' '}
                    · {connectedSitesAll.size} site
                    {connectedSitesAll.size !== 1 ? 's' : ''} connected
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {accounts.filter((a) => a.is_manual).length > 0 && (
                    <span className="text-[10px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded font-semibold flex items-center gap-1">
                      <Tag size={9} /> Manual
                    </span>
                  )}
                  {isCollapsed ? (
                    <ChevronRight size={16} className="text-muted-foreground" />
                  ) : (
                    <ChevronDown size={16} className="text-muted-foreground" />
                  )}
                </div>
              </button>

              {/* Account List */}
              <AnimatePresence>
                {!isCollapsed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="border-t border-border"
                  >
                    {accounts.map((acc, idx) => {
                      const connected = acc.linked_websites || []

                      return (
                        <div
                          key={acc.id}
                          className={`px-4 py-3 group ${idx < accounts.length - 1 ? 'border-b border-border/60' : ''} hover:bg-muted/30 transition-colors`}
                        >
                          {editingId === acc.id ? (
                            <div className="space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                                    Email / Username
                                  </label>
                                  <input
                                    type="text"
                                    value={editIdentity}
                                    onChange={(e) =>
                                      setEditIdentity(e.target.value)
                                    }
                                    className="w-full bg-muted border border-border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-primary text-foreground"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                                    Notes
                                  </label>
                                  <input
                                    type="text"
                                    value={editNotes}
                                    onChange={(e) =>
                                      setEditNotes(e.target.value)
                                    }
                                    placeholder="Optional…"
                                    className="w-full bg-muted border border-border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-primary text-foreground"
                                  />
                                </div>
                              </div>
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => setEditingId(null)}
                                  className="p-1.5 text-muted-foreground hover:bg-muted rounded"
                                >
                                  <X size={14} />
                                </button>
                                <button
                                  onClick={() => handleSave(acc.id)}
                                  className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary/90 flex items-center gap-1"
                                >
                                  <Save size={12} /> Save
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="font-semibold text-sm text-foreground truncate">
                                    {acc.identity}
                                  </span>
                                  {acc.is_manual && (
                                    <span className="text-[10px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded font-semibold shrink-0">
                                      Manual
                                    </span>
                                  )}
                                </div>
                                {acc.notes && (
                                  <p className="text-xs text-muted-foreground italic mb-1">
                                    {acc.notes}
                                  </p>
                                )}
                                {connected.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {connected.map((domain) => (
                                      <span
                                        key={domain}
                                        className="inline-flex items-center gap-1 text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded border border-border/50"
                                      >
                                        <img
                                          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
                                          className="w-3 h-3 rounded"
                                          alt=""
                                          onError={(e) => {
                                            ;(
                                              e.target as HTMLImageElement
                                            ).style.display = 'none'
                                          }}
                                        />
                                        {domain}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {connected.length === 0 && (
                                  <p className="text-[10px] text-muted-foreground/50 mt-1">
                                    No connected sites yet
                                  </p>
                                )}
                              </div>
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                <button
                                  onClick={() => handleEdit(acc)}
                                  className="p-1.5 text-muted-foreground hover:text-primary hover:bg-muted rounded transition-colors"
                                >
                                  <Edit3 size={13} />
                                </button>
                                <button
                                  onClick={() => handleDelete(acc.id)}
                                  className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
