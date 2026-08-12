import React, { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Shield,
  Smartphone,
  Key,
  MessageSquare,
  Bell,
  AlertTriangle,
  ExternalLink,
  Search,
  ShieldCheck,
  Plus,
  Trash2,
  Lock,
  Globe,
  Fingerprint
} from 'lucide-react'
import { useStorage } from '@plasmohq/storage/hook'
import { extensionStorage } from '../../core/storage/config'
import { useToast } from '~/components/ui/ToastContext'
import type {
  DomainEntry,
  IdentityProfile,
  GlobalMFAAuthenticator
} from '../../core/storage/schema'
import { FaviconImage } from '../ui/FaviconImage'
import { AccountModal } from '../ui/AccountModal'

interface MFARegistrySectionProps {
  savedAccounts?: DomainEntry[]
  setSavedAccounts?: (accounts: DomainEntry[]) => void
  filterMode?: 'all' | 'mfa-only' | 'unprotected-only'
}

export const MFARegistrySection: React.FC<MFARegistrySectionProps> = ({
  savedAccounts: propSavedAccounts
}) => {
  const [savedAccountsRaw, setSavedAccounts] = useStorage<DomainEntry[]>(
    { key: 'saved_accounts', instance: extensionStorage },
    []
  )
  const [mfaRegistryRaw, setMfaRegistry] = useStorage<GlobalMFAAuthenticator[]>(
    { key: 'mfa_registry', instance: extensionStorage },
    []
  )

  const savedAccounts = useMemo(
    () =>
      propSavedAccounts ??
      (Array.isArray(savedAccountsRaw) ? savedAccountsRaw : []),
    [propSavedAccounts, savedAccountsRaw]
  )
  const mfaRegistry = useMemo(
    () => (Array.isArray(mfaRegistryRaw) ? mfaRegistryRaw : []),
    [mfaRegistryRaw]
  )

  const [viewTab, setViewTab] = useState<'authenticators' | 'logins'>(
    'authenticators'
  )
  const [selectedType, setSelectedType] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDomainModal, setSelectedDomainModal] = useState<string | null>(
    null
  )

  // Master Authenticator creation state
  const [isAddAuthModalOpen, setIsAddAuthModalOpen] = useState(false)
  const [authName, setAuthName] = useState('')
  const [authType, setAuthType] = useState<
    'totp_app' | 'hardware_key' | 'sms' | 'prompt' | 'passkey'
  >('totp_app')
  const [authProvider, setAuthProvider] = useState('')
  const [authLinkedAccount, setAuthLinkedAccount] = useState('')
  const [authNotes, setAuthNotes] = useState('')

  // Map authenticators to their linked vault website accounts
  const authenticatorsWithLinkedAccounts = useMemo(() => {
    return mfaRegistry.map((auth) => {
      const linkedLogins: Array<{ domain: string; identity: string }> = []
      for (const entry of savedAccounts) {
        for (const acc of entry.accounts) {
          if (
            acc.mfa?.authenticator_id === auth.id ||
            (acc.mfa?.device_location &&
              acc.mfa.device_location.toLowerCase() === auth.name.toLowerCase())
          ) {
            linkedLogins.push({
              domain: entry.domain,
              identity: acc.identities[0] || 'Unknown'
            })
          }
        }
      }
      return { ...auth, linkedLogins }
    })
  }, [mfaRegistry, savedAccounts])

  // Extract all MFA-secured and missing-MFA profiles across all domains
  const { mfaItems, missingMfaItems, typeCounts } = useMemo(() => {
    const mfa: Array<{
      domain: string
      account: IdentityProfile
      domainEntry: DomainEntry
    }> = []
    const missing: Array<{
      domain: string
      account: IdentityProfile
      domainEntry: DomainEntry
    }> = []
    const counts: Record<string, number> = {
      totp_app: 0,
      hardware_key: 0,
      sms: 0,
      prompt: 0,
      passkey: 0,
      unknown: 0
    }

    for (const entry of savedAccounts) {
      for (const acc of entry.accounts) {
        if (acc.mfa && acc.mfa.type !== 'unknown') {
          mfa.push({ domain: entry.domain, account: acc, domainEntry: entry })
          counts[acc.mfa.type] = (counts[acc.mfa.type] || 0) + 1
        } else if (acc.login_method?.type !== 'oauth') {
          missing.push({
            domain: entry.domain,
            account: acc,
            domainEntry: entry
          })
        }
      }
    }

    return { mfaItems: mfa, missingMfaItems: missing, typeCounts: counts }
  }, [savedAccounts])

  const filteredItems = useMemo(() => {
    let items = selectedType === 'unprotected' ? missingMfaItems : mfaItems
    if (selectedType !== 'all' && selectedType !== 'unprotected') {
      items = items.filter((item) => item.account.mfa?.type === selectedType)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      items = items.filter(
        (item) =>
          item.domain.toLowerCase().includes(q) ||
          item.account.identities.some((id) => id.toLowerCase().includes(q)) ||
          (item.account.mfa?.device_location &&
            item.account.mfa.device_location.toLowerCase().includes(q))
      )
    }
    return items
  }, [mfaItems, missingMfaItems, selectedType, searchQuery])

  const filteredAuthenticators = useMemo(() => {
    if (!searchQuery.trim()) return authenticatorsWithLinkedAccounts
    const q = searchQuery.toLowerCase().trim()
    return authenticatorsWithLinkedAccounts.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.provider && a.provider.toLowerCase().includes(q)) ||
        (a.linked_account && a.linked_account.toLowerCase().includes(q)) ||
        a.linkedLogins.some(
          (l: any) =>
            l.domain.toLowerCase().includes(q) ||
            l.identity.toLowerCase().includes(q)
        )
    )
  }, [authenticatorsWithLinkedAccounts, searchQuery])

  const { showToast, confirmAction } = useToast()

  const handleCreateAuthenticator = (e: React.FormEvent) => {
    e.preventDefault()
    if (!authName.trim()) {
      showToast('Please enter a name for the authenticator.', 'error')
      return
    }

    const newAuth: GlobalMFAAuthenticator = {
      id: crypto.randomUUID?.() ?? Math.random().toString(36).substring(2),
      name: authName.trim(),
      type: authType,
      provider: authProvider.trim() || undefined,
      linked_account: authLinkedAccount.trim() || undefined,
      notes: authNotes.trim() || undefined,
      created_at: Date.now(),
      updated_at: Date.now()
    }

    setMfaRegistry([...mfaRegistry, newAuth])
    setIsAddAuthModalOpen(false)
    setAuthName('')
    setAuthProvider('')
    setAuthLinkedAccount('')
    setAuthNotes('')
    showToast(`Registered authenticator "${newAuth.name}"`, 'success')
  }

  const handleDeleteAuthenticator = (id: string, name: string) => {
    confirmAction({
      title: 'Remove Authenticator',
      message: `Remove master authenticator "${name}"? Unlinking from accounts will occur.`,
      confirmText: 'Remove',
      cancelText: 'Cancel',
      type: 'destructive',
      onConfirm: () => {
        const updatedRegistry = mfaRegistry.filter((a) => a.id !== id)
        setMfaRegistry(updatedRegistry)

        // Unlink authenticator_id from saved accounts
        if (setSavedAccounts && savedAccounts) {
          const updatedAccounts = savedAccounts.map((d) => ({
            ...d,
            accounts: d.accounts.map((acc: IdentityProfile) => {
              if (acc.mfa?.authenticator_id === id) {
                return {
                  ...acc,
                  mfa: { ...acc.mfa, authenticator_id: undefined }
                }
              }
              return acc
            })
          }))
          setSavedAccounts(updatedAccounts)
        }
        showToast(`Removed authenticator "${name}"`, 'info')
      }
    })
  }

  const handleLinkAccountToAuth = (
    targetDomain: string,
    targetAccountId: string,
    authenticatorId: string
  ) => {
    if (!setSavedAccounts && !savedAccountsRaw) return
    const matchedAuth = mfaRegistry.find((a) => a.id === authenticatorId)

    const updated = savedAccounts.map((d) => {
      if (d.domain !== targetDomain) return d
      return {
        ...d,
        accounts: d.accounts.map((acc: IdentityProfile) => {
          if (acc.id !== targetAccountId) return acc
          return {
            ...acc,
            mfa: {
              type: matchedAuth ? matchedAuth.type : 'totp_app',
              device_location: matchedAuth ? matchedAuth.name : '2FA Device',
              authenticator_id: matchedAuth ? matchedAuth.id : undefined,
              linked_account: matchedAuth?.linked_account || acc.mfa?.linked_account
            }
          }
        })
      }
    })
    setSavedAccounts(updated)
  }

  const getMfaBadge = (type?: string) => {
    switch (type) {
      case 'totp_app':
        return {
          label: 'Authenticator App (TOTP)',
          icon: <Smartphone size={13} />,
          color: 'bg-green-500/10 text-green-500 border-green-500/20'
        }
      case 'hardware_key':
        return {
          label: 'Hardware Key (YubiKey)',
          icon: <Key size={13} />,
          color: 'bg-purple-500/10 text-purple-500 border-purple-500/20'
        }
      case 'sms':
        return {
          label: 'SMS / Phone OTP',
          icon: <MessageSquare size={13} />,
          color: 'bg-blue-500/10 text-blue-500 border-blue-500/20'
        }
      case 'prompt':
        return {
          label: 'Push Device Prompt',
          icon: <Bell size={13} />,
          color: 'bg-amber-500/10 text-amber-500 border-amber-500/20'
        }
      case 'passkey':
        return {
          label: 'Passkey / FIDO2',
          icon: <Fingerprint size={13} />,
          color: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20'
        }
      default:
        return {
          label: 'No MFA Configured',
          icon: <AlertTriangle size={13} />,
          color: 'bg-red-500/10 text-red-500 border-red-500/20'
        }
    }
  }

  const selectedDomainData = selectedDomainModal
    ? savedAccounts.find((d) => d.domain === selectedDomainModal)
    : null

  return (
    <div className="w-full space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-card border border-border shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-green-500/10 text-green-500">
            <ShieldCheck size={26} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              MFA Security & Authenticator Registry
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-green-500/10 text-green-500 font-semibold border border-green-500/20">
                {mfaRegistry.length} Master Authenticators
              </span>
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Register master 2FA devices (Google Authenticator, YubiKeys, Authy)
              and link website logins to them.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAddAuthModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold text-xs rounded-xl shadow transition-colors shrink-0"
          >
            <Plus size={15} /> Register New 2FA Authenticator
          </button>
        </div>
      </div>

      {/* Main View Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewTab('authenticators')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors flex items-center gap-2 ${
              viewTab === 'authenticators'
                ? 'bg-primary text-primary-foreground shadow'
                : 'bg-card border border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            <Smartphone size={14} /> Master 2FA Devices ({mfaRegistry.length})
          </button>
          <button
            onClick={() => setViewTab('logins')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors flex items-center gap-2 ${
              viewTab === 'logins'
                ? 'bg-primary text-primary-foreground shadow'
                : 'bg-card border border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            <Lock size={14} /> Vault Website Coverage ({mfaItems.length})
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search
            size={14}
            className="absolute left-3 top-2.5 text-muted-foreground"
          />
          <input
            type="text"
            placeholder="Search authenticators or logins..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      {/* ─── TAB 1: MASTER 2FA AUTHENTICATORS ───────────────────────────────────── */}
      {viewTab === 'authenticators' && (
        <div>
          {filteredAuthenticators.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground flex flex-col items-center justify-center gap-3 bg-card rounded-xl border border-dashed border-border p-6">
              <Shield size={36} className="text-muted-foreground/40 mb-1" />
              <p className="font-bold text-foreground text-base">
                No Master 2FA Devices Registered Yet
              </p>
              <p className="text-xs text-muted-foreground max-w-md">
                Register your authenticators (e.g. Google Authenticator on iPhone,
                YubiKey 5C, Authy) so you can easily link them across all your website logins.
              </p>
              <button
                onClick={() => setIsAddAuthModalOpen(true)}
                className="mt-2 flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-xl shadow hover:bg-primary/90 transition-colors"
              >
                <Plus size={14} /> Register Your First 2FA Device
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAuthenticators.map((auth) => {
                const badge = getMfaBadge(auth.type)
                return (
                  <motion.div
                    key={auth.id}
                    whileHover={{ y: -2 }}
                    className="p-5 rounded-2xl border border-border bg-card shadow-sm flex flex-col justify-between gap-4 hover:border-primary/40 transition-all"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`p-2.5 rounded-xl ${badge.color}`}>
                            {badge.icon}
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-bold text-foreground text-sm truncate">
                              {auth.name}
                            </h3>
                            <p className="text-[11px] text-muted-foreground font-medium truncate">
                              {auth.provider || badge.label}
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={() =>
                            handleDeleteAuthenticator(auth.id, auth.name)
                          }
                          className="p-1.5 hover:bg-red-500/10 rounded-lg text-muted-foreground hover:text-red-500 transition-colors shrink-0"
                          title="Delete authenticator"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {auth.linked_account && (
                        <div className="mb-3 px-2.5 py-1 rounded-lg bg-muted/50 border border-border text-[11px] text-muted-foreground flex items-center gap-1.5 truncate">
                          <span className="font-semibold text-foreground">
                            Master Account:
                          </span>
                          <span className="truncate">{auth.linked_account}</span>
                        </div>
                      )}

                      {auth.notes && (
                        <p className="text-xs text-muted-foreground/80 mb-3 italic">
                          "{auth.notes}"
                        </p>
                      )}
                    </div>

                    <div className="pt-3 border-t border-border/60">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground font-medium flex items-center gap-1">
                          <Globe size={13} /> Linked Vault Logins:
                        </span>
                        <span className="font-bold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
                          {auth.linkedLogins.length} account
                          {auth.linkedLogins.length !== 1 ? 's' : ''}
                        </span>
                      </div>

                      {auth.linkedLogins.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-1">
                          {auth.linkedLogins.map((login: any, idx: number) => (
                            <span
                              key={idx}
                              onClick={() => setSelectedDomainModal(login.domain)}
                              className="text-[10px] px-2 py-1 rounded-md bg-muted text-foreground border border-border font-medium hover:border-primary cursor-pointer transition-colors"
                            >
                              {login.domain} ({login.identity})
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 2: VAULT WEBSITE COVERAGE ─────────────────────────────────────── */}
      {viewTab === 'logins' && (
        <div className="space-y-4">
          {/* Sub-Filters */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setSelectedType('all')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                selectedType === 'all'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-card border border-border hover:bg-muted text-muted-foreground'
              }`}
            >
              All Secured ({mfaItems.length})
            </button>

            <button
              onClick={() => setSelectedType('totp_app')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                selectedType === 'totp_app'
                  ? 'bg-green-500 text-white shadow-sm'
                  : 'bg-card border border-border hover:bg-muted text-muted-foreground'
              }`}
            >
              <Smartphone size={13} /> Authenticator App ({typeCounts.totp_app || 0})
            </button>

            <button
              onClick={() => setSelectedType('hardware_key')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                selectedType === 'hardware_key'
                  ? 'bg-purple-500 text-white shadow-sm'
                  : 'bg-card border border-border hover:bg-muted text-muted-foreground'
              }`}
            >
              <Key size={13} /> Hardware Keys ({typeCounts.hardware_key || 0})
            </button>

            <button
              onClick={() => setSelectedType('unprotected')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                selectedType === 'unprotected'
                  ? 'bg-red-500 text-white shadow-sm'
                  : 'bg-card border border-border hover:bg-muted text-muted-foreground'
              }`}
            >
              <AlertTriangle size={13} /> Unprotected ({missingMfaItems.length})
            </button>
          </div>

          {/* Grid of MFA items */}
          {filteredItems.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground flex flex-col items-center justify-center gap-2 bg-card rounded-xl border border-border p-6">
              <Shield size={32} className="text-muted-foreground/50 mb-1" />
              <p className="font-semibold text-foreground text-sm">
                No vault logins found in this category
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredItems.map(({ domain, account }) => {
                const badge = getMfaBadge(account.mfa?.type)
                const identity = account.identities[0] || 'Unknown Identity'

                return (
                  <motion.div
                    key={`${domain}-${account.id}`}
                    whileHover={{ y: -2 }}
                    className="p-4 rounded-xl border border-border bg-card shadow-sm flex flex-col justify-between gap-3 hover:border-primary/40 transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FaviconImage domain={domain} size={22} />
                        <div className="min-w-0">
                          <p className="font-bold text-foreground text-sm truncate">
                            {domain}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {identity}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => setSelectedDomainModal(domain)}
                        className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors shrink-0"
                        title="Edit Account Details"
                      >
                        <ExternalLink size={14} />
                      </button>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-border/60">
                      <div className="flex items-center justify-between gap-2">
                        <div
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${badge.color}`}
                        >
                          {badge.icon}
                          <span>{badge.label}</span>
                        </div>
                      </div>

                      {/* Quick Link Master Authenticator Dropdown */}
                      <div className="pt-1">
                        <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">
                          Linked 2FA Device:
                        </label>
                        <select
                          value={account.mfa?.authenticator_id || ''}
                          onChange={(e) =>
                            handleLinkAccountToAuth(
                              domain,
                              account.id,
                              e.target.value
                            )
                          }
                          className="w-full px-2 py-1 text-xs bg-muted/50 border border-border rounded-lg focus:outline-none focus:border-primary text-foreground"
                        >
                          <option value="">-- Unlinked / Default --</option>
                          {mfaRegistry.map((auth) => (
                            <option key={auth.id} value={auth.id}>
                              {auth.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── MODAL: REGISTER NEW MASTER AUTHENTICATOR ──────────────────────────── */}
      {isAddAuthModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card text-card-foreground border border-border rounded-2xl shadow-2xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Smartphone size={18} className="text-green-500" /> Register Master 2FA Device
              </h3>
              <button
                onClick={() => setIsAddAuthModalOpen(false)}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAuthenticator} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Device / Authenticator Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Google Authenticator (Personal iPhone)"
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                  className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    2FA Type
                  </label>
                  <select
                    value={authType}
                    onChange={(e) => setAuthType(e.target.value as any)}
                    className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-xs focus:outline-none focus:border-primary"
                  >
                    <option value="totp_app">Authenticator App (TOTP)</option>
                    <option value="hardware_key">Hardware Key (YubiKey)</option>
                    <option value="sms">SMS / Phone</option>
                    <option value="prompt">Push Prompt</option>
                    <option value="passkey">Passkey / FIDO2</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    App / Brand (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Google, Yubico, Authy"
                    value={authProvider}
                    onChange={(e) => setAuthProvider(e.target.value)}
                    className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-xs focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Linked Master Email/Account (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. user@example.com"
                  value={authLinkedAccount}
                  onChange={(e) => setAuthLinkedAccount(e.target.value)}
                  className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-xs focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Backed up to iCloud Keychain"
                  value={authNotes}
                  onChange={(e) => setAuthNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-xs focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsAddAuthModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-semibold bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                >
                  Save Authenticator
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Account Modal for Editing */}
      {selectedDomainData && (
        <AccountModal
          isOpen={!!selectedDomainModal}
          onClose={() => setSelectedDomainModal(null)}
          domain={selectedDomainData.domain}
          accounts={selectedDomainData.accounts}
        />
      )}
    </div>
  )
}
