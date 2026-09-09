import React, { useState, useEffect, useMemo } from 'react'
import { useStorage } from '@plasmohq/storage/hook'
import { extensionStorage } from '../../core/storage/config'
import { WebsiteCard } from '~/components/ui/WebsiteCard'
import { AccountModal } from '~/components/ui/AccountModal'
import { GlobalOAuthSection } from './GlobalOAuthSection'
import { PendingCapturesSection } from './PendingCapturesSection'
import {
  analyzePasswordHashes,
  classifyReuseGroups
} from '../../core/utils/password-inference'
import { useWeakFingerprints } from '../../core/hooks/useWeakFingerprints'
import type {
  DomainEntry,
  IdentityProfile,
  GlobalMFAAuthenticator
} from '../../core/storage/schema'
import { isLocalEnvironment, resolveDomainPortHint, expandLocalDevPortEntries } from '~/core/utils/domain'
import { useToast } from '~/components/ui/ToastContext'
import { ExportWizardModal } from '~/components/ui/ExportWizardModal'
import { getSnapshots, type VaultSnapshot } from '../../core/storage/snapshots'
import { dateInputToExpiry } from '../../core/utils/api-key-expiry'
import {
  Search,
  Plus,
  Key,
  Globe,
  Shield,
  Trash2,
  CheckSquare,
  Square,
  AlertTriangle,
  Smartphone,
  Download,
  ChevronDown,
  ChevronRight
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

type FilterType = 'all' | 'password' | 'oauth' | 'api-key'

interface DashboardViewProps {
  filterOverride?: FilterType
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  filterOverride
}) => {
  const [savedAccountsRaw, setSavedAccounts] = useStorage<DomainEntry[]>(
    { key: 'saved_accounts', instance: extensionStorage },
    []
  )
  const [oauthRegistryRaw, setOauthRegistry] = useStorage<any[]>(
    { key: 'oauth_registry', instance: extensionStorage },
    []
  )
  const [mfaRegistryRaw, setMfaRegistry] = useStorage<GlobalMFAAuthenticator[]>(
    { key: 'mfa_registry', instance: extensionStorage },
    []
  )
  const [dashboardColumns] = useStorage<number>(
    { key: 'dashboard_columns', instance: extensionStorage },
    3
  )
  const [isLocalDevCollapsed, setIsLocalDevCollapsed] = useStorage<boolean>(
    { key: 'local_dev_collapsed', instance: extensionStorage },
    false
  )
  const [isOauthCollapsed, setIsOauthCollapsed] = useStorage<boolean>(
    { key: 'oauth_registry_collapsed', instance: extensionStorage },
    false
  )
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null)

  // Normalize to arrays — storage may have corrupted values
  const savedAccounts = useMemo(
    () => (Array.isArray(savedAccountsRaw) ? savedAccountsRaw : []),
    [savedAccountsRaw]
  )
  const expandedAccounts = useMemo(
    () => expandLocalDevPortEntries(savedAccounts),
    [savedAccounts]
  )
  const oauthRegistry = useMemo(
    () => (Array.isArray(oauthRegistryRaw) ? oauthRegistryRaw : []),
    [oauthRegistryRaw]
  )
  const mfaRegistry = useMemo(
    () => (Array.isArray(mfaRegistryRaw) ? mfaRegistryRaw : []),
    [mfaRegistryRaw]
  )

  // Auto-pin migration: on first mount, tag single-account domains as auto_pinned
  useEffect(() => {
    if (!savedAccounts || savedAccounts.length === 0) return
    let needsUpdate = false
    const updated = savedAccounts.map((d) => {
      if (d.accounts.length === 1) {
        const acc = d.accounts[0]
        // Apply auto_pin if not already explicitly set
        if (!acc.pinned && acc.auto_pinned === undefined) {
          needsUpdate = true
          return { ...d, accounts: [{ ...acc, auto_pinned: true }] }
        }
      }
      return d
    })
    if (needsUpdate) setSavedAccounts(updated)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedAccounts?.length])
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [filterType, setFilterType] = useState<FilterType>(
    filterOverride || 'all'
  )

  useEffect(() => {
    if (filterOverride) {
      setFilterType(filterOverride)
    }
  }, [filterOverride])

  const [sortOrder, setSortOrder] = useState<'newest' | 'az' | 'za'>('newest')
  const [isMultiSelect, setIsMultiSelect] = useState(false)
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set())
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isExportWizardOpen, setIsExportWizardOpen] = useState(false)
  const [snapshots, setSnapshotsList] = useState<VaultSnapshot[]>([])

  useEffect(() => {
    getSnapshots().then(setSnapshotsList)
  }, [savedAccountsRaw])

  // New account form state
  const [newDomain, setNewDomain] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [newType, setNewType] = useState<'password' | 'oauth' | 'api-key'>(
    'password'
  )
  const [newProvider, setNewProvider] = useState('')

  // API Key specific form state
  const [newApiTitle, setNewApiTitle] = useState('')
  const [newApiEndpoint, setNewApiEndpoint] = useState('')
  const [newKeyScope, setNewKeyScope] = useState('')
  const [newApiKey, setNewApiKey] = useState('')
  const [newApiExpiry, setNewApiExpiry] = useState('')

  // Vault Source state
  const [newVaultSource, setNewVaultSource] = useState('Manual Entry')

  // Extract unique vault sources across all saved accounts
  const existingVaultSources = useMemo(() => {
    const set = new Set<string>([
      'Manual Entry',
      'Edge Passwords',
      'Chrome Passwords',
      'Firefox Passwords',
      'Bitwarden',
      '1Password'
    ])
    for (const entry of savedAccounts || []) {
      for (const acc of entry.accounts) {
        if (acc.vault_source) {
          acc.vault_source.split(',').forEach((s) => {
            const trimmed = s.trim()
            if (trimmed) set.add(trimmed)
          })
        }
      }
    }
    return Array.from(set)
  }, [savedAccounts])

  // MFA specific form state
  const [newMfaType, setNewMfaType] = useState<
    'none' | 'totp_app' | 'hardware_key' | 'sms' | 'prompt'
  >('none')
  const [selectedMfaAuthId, setSelectedMfaAuthId] = useState<string>('')

  const { showToast, confirmAction } = useToast()

  const handleOpenAddModal = () => {
    if (filterType === 'password') setNewType('password')
    else if (filterType === 'oauth') setNewType('oauth')
    else if (filterType === 'api-key') setNewType('api-key')
    setIsAddModalOpen(true)
  }

  const selectedData = expandedAccounts?.find((d) => d.domain === selectedDomain)

  const filteredAccounts = expandedAccounts?.filter((d) => {
    const q = searchQuery.toLowerCase().trim()
    const matchesQuery =
      !q ||
      d.domain.toLowerCase().includes(q) ||
      d.accounts.some((acc) =>
        acc.identities.some((id) => id.toLowerCase().includes(q))
      )
    if (!matchesQuery) return false

    if (filterType === 'password') {
      return d.accounts.some((acc) => acc.login_method?.type === 'password')
    }
    if (filterType === 'oauth') {
      return d.accounts.some((acc) => acc.login_method?.type === 'oauth')
    }
    if (filterType === 'api-key') {
      return d.accounts.some((acc) => acc.login_method?.type === 'api-key')
    }
    return true
  })

  const handleAddAccount = (e: React.FormEvent) => {
    e.preventDefault()
    if (newType === 'api-key') {
      if (!newDomain.trim() || !newApiTitle.trim() || !newApiKey.trim()) {
        showToast('Please enter a Domain, Title, and API Key value.', 'error')
        return
      }
    } else {
      if (!newDomain.trim() || !newUsername.trim()) {
        showToast('Please enter both a domain and a username.', 'error')
        return
      }
    }

    const cleanDomain = newDomain
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]

    let mfaConfig: IdentityProfile['mfa'] = undefined
    if (newMfaType !== 'none') {
      const matchedAuth = mfaRegistry.find((a) => a.id === selectedMfaAuthId)
      mfaConfig = {
        type: newMfaType,
        device_location:
          matchedAuth?.name ||
          (newMfaType === 'totp_app'
            ? 'Authenticator App'
            : newMfaType === 'hardware_key'
              ? 'Hardware Key'
              : '2FA Device'),
        authenticator_id: matchedAuth?.id
      }
    }

    const newProfile: IdentityProfile = {
      id:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).substring(2),
      label: newType === 'api-key' ? 'API Key' : 'Personal',
      identities:
        newType === 'api-key' ? [newApiTitle.trim()] : [newUsername.trim()],
      login_method: {
        type: newType,
        provider:
          newType === 'oauth' ? newProvider.trim() || 'google.com' : undefined
      },
      api_title: newType === 'api-key' ? newApiTitle.trim() : undefined,
      api_endpoint: newType === 'api-key' ? newApiEndpoint.trim() : undefined,
      key_scope: newType === 'api-key' ? newKeyScope.trim() : undefined,
      api_key: newType === 'api-key' ? newApiKey.trim() : undefined,
      api_key_expiry:
        newType === 'api-key' ? dateInputToExpiry(newApiExpiry) : undefined,
      vault_source: newVaultSource || 'Manual Entry',
      mfa: newType === 'api-key' ? undefined : mfaConfig,
      updated_at: Date.now()
    }

    const updated = [...(savedAccounts || [])]
    const existingIdx = updated.findIndex((d) => d.domain === cleanDomain)

    if (existingIdx >= 0) {
      const existingDomain = updated[existingIdx]
      const wasAutoPin =
        existingDomain.accounts.length === 1 &&
        existingDomain.accounts[0].auto_pinned

      // Break auto-pin: clear auto_pinned on the existing account
      if (wasAutoPin) {
        const existingAcc = existingDomain.accounts[0]
        updated[existingIdx] = {
          ...existingDomain,
          accounts: [{ ...existingAcc, auto_pinned: undefined }]
        }
      }
      updated[existingIdx].accounts.push(newProfile)

      // If auto-pin was broken, prompt user using custom confirmation modal
      if (wasAutoPin) {
        confirmAction({
          title: 'Multiple Logins Detected',
          message: `You now have multiple logins for ${cleanDomain}.\nKeep the existing login "${updated[existingIdx].accounts[0].identities[0]}" pinned?`,
          confirmText: 'Keep Pinned',
          cancelText: 'Leave Unpinned',
          onConfirm: () => {
            const currentSaved = [...(savedAccounts || [])]
            const idx = currentSaved.findIndex((d) => d.domain === cleanDomain)
            if (idx >= 0 && currentSaved[idx].accounts.length > 0) {
              currentSaved[idx].accounts[0] = {
                ...currentSaved[idx].accounts[0],
                pinned: true
              }
              setSavedAccounts(currentSaved)
            }
          }
        })
      }
    } else {
      updated.push({
        domain: cleanDomain,
        accounts: [{ ...newProfile, auto_pinned: true }]
      })
    }

    setSavedAccounts(updated)

    if (newType === 'oauth') {
      const newReg = [...(oauthRegistry || [])]
      const regEntry = newReg.find(
        (r) => r.provider === newProvider && r.identity === newUsername
      )
      if (regEntry) {
        regEntry.linked_websites = regEntry.linked_websites || []
        if (!regEntry.linked_websites.includes(cleanDomain)) {
          regEntry.linked_websites.push(cleanDomain)
        }
        setOauthRegistry(newReg)
      }
    }
    setIsAddModalOpen(false)
    setNewDomain('')
    setNewUsername('')
    setNewProvider('')
    setNewApiTitle('')
    setNewApiEndpoint('')
    setNewApiKey('')
    setNewApiExpiry('')
    showToast(`Added entry for ${cleanDomain}!`, 'success')
  }

  const handleBulkDelete = () => {
    if (selectedCards.size === 0) return
    confirmAction({
      title: 'Delete Selected Domains',
      message: `Are you sure you want to delete ${selectedCards.size} domain entries from your vault?`,
      confirmText: 'Delete Entries',
      cancelText: 'Cancel',
      type: 'destructive',
      onConfirm: () => {
        const updated =
          savedAccounts?.filter((d) => !selectedCards.has(d.domain)) || []
        setSavedAccounts(updated)
        setSelectedCards(new Set())
        setIsMultiSelect(false)
        showToast('Selected entries deleted', 'info')
      }
    })
  }

  const toggleSelectCard = (domain: string) => {
    const next = new Set(selectedCards)
    if (next.has(domain)) next.delete(domain)
    else next.add(domain)
    setSelectedCards(next)
  }
  const weakFingerprints = useWeakFingerprints()
  const reuseAnalysis = useMemo(
    () => analyzePasswordHashes(savedAccounts, weakFingerprints),
    [savedAccounts, weakFingerprints]
  )
  const [autoResolveLeftovers] = useStorage<boolean>(
    { key: 'auto_resolve_leftovers', instance: extensionStorage },
    true
  )
  const activeGroupsCount = useMemo(() => {
    return classifyReuseGroups(reuseAnalysis.reuseGroups, autoResolveLeftovers)
      .activeGroups.length
  }, [reuseAnalysis.reuseGroups, autoResolveLeftovers])

  return (
    <div className="p-8 max-w-7xl mx-auto w-full pb-24">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-1">
            {filterOverride === 'oauth'
              ? 'OAuth Registry'
              : filterOverride === 'password'
                ? 'Passwords'
                : filterOverride === 'api-key'
                  ? 'API Keys'
                  : 'All Entries'}
          </h1>
          <p className="text-muted-foreground">
            Manage your locally stored identities and OAuth mappings.
          </p>
        </div>
        <button
          onClick={handleOpenAddModal}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground font-semibold rounded-lg shadow hover:bg-primary/90 transition-colors self-start sm:self-auto text-sm"
        >
          <Plus size={16} /> Add New Entry
        </button>
      </div>

      {/* Password Reuse Security Banner */}
      {(!filterOverride || filterOverride === 'password') &&
        activeGroupsCount > 0 && (
          <div className="mb-6 p-4 rounded-xl border border-red-500/30 bg-red-500/5 flex items-center justify-between flex-wrap gap-3 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10 text-red-500">
                <AlertTriangle size={18} />
              </div>
              <div>
                <p className="font-bold text-foreground text-sm flex items-center gap-2">
                  {activeGroupsCount} Password Reuse Group
                  {activeGroupsCount !== 1 ? 's' : ''} Detected
                </p>
                <p className="text-xs text-muted-foreground">
                  Multiple accounts share identical password hashes. Link mirror
                  domains or separate credentials to resolve warnings.
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                window.location.hash = '#security-review'
              }}
              className="px-3.5 py-1.5 bg-red-500 hover:bg-red-600 text-white font-bold text-xs rounded-lg transition-colors shadow-sm"
            >
              Review & Link Mirror Domains ({activeGroupsCount})
            </button>
          </div>
        )}

      {/* Pending OAuth Captures */}
      {(!filterOverride || filterOverride === 'oauth') && (
        <PendingCapturesSection
          savedAccounts={savedAccounts}
          setSavedAccounts={setSavedAccounts}
          oauthRegistry={oauthRegistry}
          setOauthRegistry={setOauthRegistry}
        />
      )}

      {/* Global OAuth Registry Section */}
      {(!filterOverride || filterOverride === 'oauth') &&
        oauthRegistry &&
        oauthRegistry.length > 0 && (
          <GlobalOAuthSection
            oauthRegistry={oauthRegistry}
            setOauthRegistry={setOauthRegistry}
            savedAccounts={savedAccounts}
            setSavedAccounts={setSavedAccounts}
            isCollapsed={isOauthCollapsed}
            setIsCollapsed={setIsOauthCollapsed}
          />
        )}

      {/* Controls Bar: Search & Category Filter */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3.5 top-3 text-muted-foreground"
          />
          <input
            type="text"
            placeholder="Search domains or usernames..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
          />
        </div>

        {!filterOverride && (
          <div className="flex items-center gap-1 bg-muted p-1 rounded-lg border border-border">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                filterType === 'all'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All ({savedAccounts?.length || 0})
            </button>
            <button
              onClick={() => setFilterType('password')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                filterType === 'password'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Key size={13} /> Passwords
            </button>
            <button
              onClick={() => setFilterType('oauth')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                filterType === 'oauth'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Globe size={13} /> OAuth
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as any)}
            className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary transition-colors h-10"
          >
            <option value="newest">Latest Added</option>
            <option value="az">A - Z</option>
            <option value="za">Z - A</option>
          </select>

          <button
            onClick={() => {
              setIsMultiSelect(!isMultiSelect)
              if (isMultiSelect) setSelectedCards(new Set())
            }}
            className={`px-3 py-2 border rounded-lg text-sm transition-colors flex items-center gap-2 h-10 ${isMultiSelect ? 'bg-primary/10 border-primary text-primary' : 'bg-card border-border text-foreground hover:border-primary'}`}
          >
            {isMultiSelect ? <CheckSquare size={16} /> : <Square size={16} />}
            {isMultiSelect ? 'Cancel' : 'Select'}
          </button>
        </div>
      </div>

      {/* Grid of Cards */}
      {!filteredAccounts || filteredAccounts.length === 0 ? (
        <div className="text-center p-12 border border-dashed border-border rounded-xl bg-card">
          <Shield size={32} className="mx-auto mb-3 text-muted-foreground/40" />
          <p className="font-semibold text-foreground">
            No matching vault entries found.
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {searchQuery
              ? `No results for "${searchQuery}"`
              : 'Import a CSV in Settings or click "Add New Entry" above.'}
          </p>
        </div>
      ) : (
        <>
          {/* Local Environments Section */}
          {(() => {
            const localAccounts = filteredAccounts.filter((d) =>
              isLocalEnvironment(d.domain)
            )
            if (localAccounts.length === 0) return null

            return (
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                      <Globe className="text-emerald-500" size={20} />
                      Local Development Environments
                    </h2>
                    <span className="bg-emerald-500/10 text-emerald-500 text-xs px-2.5 py-0.5 rounded-full font-bold">
                      {localAccounts.length}
                    </span>
                  </div>
                  <button
                    onClick={() => setIsLocalDevCollapsed(!isLocalDevCollapsed)}
                    className="p-1.5 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                  >
                    <span>{isLocalDevCollapsed ? 'Expand' : 'Collapse'}</span>
                    {isLocalDevCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>

                {!isLocalDevCollapsed && (
                  <motion.div
                    layout
                    className={`grid grid-cols-1 md:grid-cols-2 ${(dashboardColumns ?? 3) >= 4 ? 'lg:grid-cols-3 xl:grid-cols-4' : 'lg:grid-cols-3'} gap-4`}
                  >
                    <AnimatePresence>
                      {localAccounts.map((data) => {
                        const portHint = resolveDomainPortHint(data)

                      return (
                        <motion.div
                          layout
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          transition={{ duration: 0.2 }}
                          key={data.domain}
                          className="relative"
                        >
                          {isMultiSelect && (
                            <div
                              className="absolute -top-2 -left-2 z-10 bg-background rounded-md border border-border shadow cursor-pointer"
                              onClick={() => toggleSelectCard(data.domain)}
                            >
                              <div
                                className={`p-1 rounded-md transition-colors ${selectedCards.has(data.domain) ? 'bg-destructive text-destructive-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                              >
                                <CheckSquare size={18} />
                              </div>
                            </div>
                          )}
                          {portHint !== 'Portless' && (
                            <div className="absolute top-2 right-2 z-10">
                              <span className="text-[10px] px-1.5 py-0.5 bg-background/80 backdrop-blur-md rounded border border-border text-muted-foreground font-mono">
                                {portHint}
                              </span>
                            </div>
                          )}
                          <WebsiteCard
                            data={data}
                            onClick={() => {
                              if (isMultiSelect) toggleSelectCard(data.domain)
                              else setSelectedDomain(data.domain)
                            }}
                          />
                        </motion.div>
                      )
                    })}
                  </AnimatePresence>
                </motion.div>
                )}
              </div>
            )
          })()}

          {/* Regular Websites Section */}
          <motion.div
            layout
            className={`grid grid-cols-1 md:grid-cols-2 ${(dashboardColumns ?? 3) >= 4 ? 'lg:grid-cols-3 xl:grid-cols-4' : 'lg:grid-cols-3'} gap-4`}
          >
            <AnimatePresence>
              {filteredAccounts
                .filter((d) => !isLocalEnvironment(d.domain))
                .slice()
                .sort((a, b) => {
                  // First apply pin sorting
                  const aPinned = a.accounts.some((acc) => acc.pinned) ? 1 : 0
                  const bPinned = b.accounts.some((acc) => acc.pinned) ? 1 : 0
                  if (aPinned !== bPinned) return bPinned - aPinned

                  // Then apply sortOrder
                  if (sortOrder === 'az')
                    return a.domain.localeCompare(b.domain)
                  if (sortOrder === 'za')
                    return b.domain.localeCompare(a.domain)

                  // newest
                  const aMax = Math.max(
                    0,
                    ...a.accounts.map((acc) => acc.updated_at || 0)
                  )
                  const bMax = Math.max(
                    0,
                    ...b.accounts.map((acc) => acc.updated_at || 0)
                  )
                  return bMax - aMax
                })
                .map((data) => (
                  <motion.div
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.2 }}
                    key={data.domain}
                    className="relative"
                  >
                    {isMultiSelect && (
                      <div
                        className="absolute -top-2 -left-2 z-10 bg-background rounded-md border border-border shadow cursor-pointer"
                        onClick={() => toggleSelectCard(data.domain)}
                      >
                        <div
                          className={`p-1 rounded-md transition-colors ${selectedCards.has(data.domain) ? 'bg-destructive text-destructive-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                        >
                          <CheckSquare size={18} />
                        </div>
                      </div>
                    )}
                    <WebsiteCard
                      data={data}
                      onClick={() => {
                        if (isMultiSelect) toggleSelectCard(data.domain)
                        else setSelectedDomain(data.domain)
                      }}
                    />
                  </motion.div>
                ))}
            </AnimatePresence>
          </motion.div>
        </>
      )}

      {/* Floating Action Bar for Bulk Delete */}
      <AnimatePresence>
        {isMultiSelect && selectedCards.size > 0 && (
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-card border border-border shadow-2xl rounded-full px-6 py-3 flex items-center gap-6 z-50"
          >
            <span className="font-semibold text-sm">
              {selectedCards.size} selected
            </span>
            <button
              onClick={() => setIsExportWizardOpen(true)}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-1.5 rounded-full text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
            >
              <Download size={16} /> Export Selected ({selectedCards.size})
            </button>
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-2 bg-destructive text-destructive-foreground px-4 py-1.5 rounded-full text-sm font-medium hover:bg-destructive/90 transition-colors shadow-sm"
            >
              <Trash2 size={16} /> Delete Selected
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Export Wizard Modal */}
      <ExportWizardModal
        isOpen={isExportWizardOpen}
        onClose={() => setIsExportWizardOpen(false)}
        snapshots={snapshots}
        currentVault={savedAccounts}
        selectedDomains={Array.from(selectedCards)}
      />

      {/* Account Modal Details */}
      <AccountModal
        isOpen={!!selectedDomain}
        onClose={() => setSelectedDomain(null)}
        domain={selectedDomain || ''}
        accounts={selectedData?.accounts || []}
      />

      {/* Add New Entry Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card text-card-foreground border border-border rounded-xl shadow-2xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-xl font-bold border-b border-border pb-3">
              Add New Vault Entry
            </h3>
            <form onSubmit={handleAddAccount} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Authentication Method
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setNewType('password')
                      setNewUsername('')
                    }}
                    className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-colors ${newType === 'password' ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/50 text-foreground border-border hover:border-primary'}`}
                  >
                    Password
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewType('oauth')
                      setNewUsername('')
                    }}
                    className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-colors ${newType === 'oauth' ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-muted/50 text-foreground border-border hover:border-indigo-500'}`}
                  >
                    OAuth / SSO
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewType('api-key')
                      setNewUsername('')
                    }}
                    className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-colors ${newType === 'api-key' ? 'bg-amber-500 text-white border-amber-500' : 'bg-muted/50 text-foreground border-border hover:border-amber-500'}`}
                  >
                    API Key
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Domain Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. github.com or roadmap.sh"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
                  required
                />
              </div>

              {newType === 'oauth' ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground mb-1">
                        Provider
                      </label>
                      <select
                        value={newProvider}
                        onChange={(e) => {
                          setNewProvider(e.target.value)
                          setNewUsername('')
                        }}
                        className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
                        required
                      >
                        <option value="" disabled>
                          Select...
                        </option>
                        {Array.from(
                          new Set(oauthRegistry.map((r) => r.provider))
                        ).map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground mb-1">
                        Account
                      </label>
                      <select
                        value={newUsername}
                        onChange={(e) => {
                          if (e.target.value === '__add_new__') {
                            const newId = prompt(
                              'Enter new email/username for ' + newProvider
                            )
                            if (newId) {
                              setNewUsername(newId)
                              setOauthRegistry([
                                ...oauthRegistry,
                                {
                                  id:
                                    crypto.randomUUID?.() ??
                                    Math.random().toString(36).substring(2),
                                  provider: newProvider,
                                  identity: newId,
                                  created_at: Date.now(),
                                  updated_at: Date.now(),
                                  is_manual: true
                                }
                              ])
                            }
                          } else {
                            setNewUsername(e.target.value)
                          }
                        }}
                        className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
                        required
                        disabled={!newProvider}
                      >
                        <option value="" disabled>
                          Select...
                        </option>
                        {oauthRegistry
                          .filter((r) => r.provider === newProvider)
                          .map((acc) => (
                            <option key={acc.id} value={acc.identity}>
                              {acc.identity}
                            </option>
                          ))}
                        <option
                          value="__add_new__"
                          className="font-semibold text-indigo-500"
                        >
                          + Add New Identity...
                        </option>
                      </select>
                    </div>
                  </div>
                  {oauthRegistry.length === 0 && (
                    <p className="text-xs text-destructive mt-1">
                      No OAuth accounts in registry. Log in via OAuth somewhere
                      first, or add one manually in the registry.
                    </p>
                  )}
                </>
              ) : newType === 'api-key' ? (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      Key Title / Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Production Key, Admin Token"
                      value={newApiTitle}
                      onChange={(e) => setNewApiTitle(e.target.value)}
                      className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      API Key Secret Value
                    </label>
                    <input
                      type="password"
                      placeholder="e.g. sk_live_..."
                      value={newApiKey}
                      onChange={(e) => setNewApiKey(e.target.value)}
                      className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground mb-1">
                        Endpoint / URL (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. https://api.openai.com/v1"
                        value={newApiEndpoint}
                        onChange={(e) => setNewApiEndpoint(e.target.value)}
                        className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground mb-1">
                        Scope (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Read-only, Admin, Billing"
                        value={newKeyScope}
                        onChange={(e) => setNewKeyScope(e.target.value)}
                        className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      Expires On (Optional)
                    </label>
                    <input
                      type="date"
                      value={newApiExpiry}
                      onChange={(e) => setNewApiExpiry(e.target.value)}
                      className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Leave blank for no expiry. Keys saved before this field
                      existed have no expiry.
                    </p>
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Username / Email
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. user@example.com"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
                    required
                  />
                </div>
              )}

              {/* Universal Vault Source Selection */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Vault Source / Origin Tag
                </label>
                <select
                  value={newVaultSource}
                  onChange={(e) => {
                    if (e.target.value === '__add_new__') {
                      const custom = prompt('Enter custom Vault Source name (e.g. 1Password, Personal Vault):')
                      if (custom?.trim()) setNewVaultSource(custom.trim())
                    } else {
                      setNewVaultSource(e.target.value)
                    }
                  }}
                  className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:border-primary text-foreground"
                >
                  {existingVaultSources.map((src) => (
                    <option key={src} value={src}>
                      {src}
                    </option>
                  ))}
                  <option value="__add_new__" className="font-semibold text-primary">
                    + Add Custom Source Tag...
                  </option>
                </select>
              </div>

              {/* MFA Method Selection - Hidden for API Keys */}
              {newType !== 'api-key' && (
                <div className="pt-3 border-t border-border space-y-2">
                <label className="block text-xs font-semibold text-muted-foreground flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-foreground">
                    <Smartphone size={14} className="text-green-500" /> 2FA /
                    MFA Security Method
                  </span>
                  <span className="text-[10px] text-muted-foreground font-normal">
                    (Optional)
                  </span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <select
                      value={newMfaType}
                      onChange={(e) => setNewMfaType(e.target.value as any)}
                      className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-xs focus:outline-none focus:border-primary text-foreground"
                    >
                      <option value="none">No 2FA Configured</option>
                      <option value="totp_app">Authenticator App (TOTP)</option>
                      <option value="hardware_key">
                        Hardware Key (YubiKey)
                      </option>
                      <option value="sms">SMS / Phone OTP</option>
                      <option value="prompt">Push Device Prompt</option>
                    </select>
                  </div>

                  {newMfaType !== 'none' && (
                    <div>
                      <select
                        value={selectedMfaAuthId}
                        onChange={(e) => {
                          if (e.target.value === '__add_new__') {
                            const name = prompt(
                              'Enter a name for your 2FA authenticator (e.g. "Google Auth on Personal iPhone" or "YubiKey 5C"):',
                              newMfaType === 'totp_app'
                                ? 'Google Authenticator'
                                : newMfaType === 'hardware_key'
                                  ? 'YubiKey 5C NFC'
                                  : '2FA Device'
                            )
                            if (name?.trim()) {
                              const newId =
                                crypto.randomUUID?.() ??
                                Math.random().toString(36).substring(2)
                              const newAuth: GlobalMFAAuthenticator = {
                                id: newId,
                                name: name.trim(),
                                type: newMfaType,
                                created_at: Date.now(),
                                updated_at: Date.now()
                              }
                              setMfaRegistry([...mfaRegistry, newAuth])
                              setSelectedMfaAuthId(newId)
                            }
                          } else {
                            setSelectedMfaAuthId(e.target.value)
                          }
                        }}
                        className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-xs focus:outline-none focus:border-primary text-foreground"
                      >
                        <option value="">Select Authenticator...</option>
                        {mfaRegistry
                          .filter(
                            (a) => a.type === newMfaType || a.type === 'unknown'
                          )
                          .map((auth) => (
                            <option key={auth.id} value={auth.id}>
                              {auth.name}
                            </option>
                          ))}
                        <option
                          value="__add_new__"
                          className="font-bold text-green-500"
                        >
                          + Register New Authenticator...
                        </option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                >
                  Save Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
