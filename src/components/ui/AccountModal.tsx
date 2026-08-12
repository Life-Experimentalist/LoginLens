import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Copy,
  Check,
  Key,
  Globe,
  Pin,
  PinOff,
  Trash2,
  Edit3,
  ExternalLink,
  AlertTriangle,
  Smartphone,
  Shield,
  Fingerprint,
  Tag,
  Sparkles
} from 'lucide-react'
import type {
  IdentityProfile,
  DomainEntry,
  GlobalOAuthAccount,
  GlobalMFAAuthenticator
} from '../../core/storage/schema'
import { useStorage } from '@plasmohq/storage/hook'
import { extensionStorage } from '../../core/storage/config'
import { isAppPackageDomain, isLocalEnvironment, getNaturalAliases, resolveDomainPortHint, getAccountPortDetails, normalizeLocalHost, getLocalhostSubdomainHint, syncBidirectionalDomainLinks } from '../../core/utils/domain'
import { useToast } from '~/components/ui/ToastContext'
import { AppNameDisplay } from './AppNameDisplay'
import { FaviconImage } from './FaviconImage'

interface AccountModalProps {
  isOpen: boolean
  onClose: () => void
  domain: string
  accounts: IdentityProfile[]
  filterAccountIds?: string[]
  onRenameDomain?: (oldDomain: string, newDomain: string) => void
}

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  domain,
  accounts,
  onRenameDomain
}) => {
  const [savedAccountsRaw, setSavedAccounts] = useStorage<DomainEntry[]>(
    { key: 'saved_accounts', instance: extensionStorage },
    []
  )
  const [oauthRegistryRaw, setOauthRegistry] = useStorage<GlobalOAuthAccount[]>(
    { key: 'oauth_registry', instance: extensionStorage },
    []
  )
  const [mfaRegistryRaw] = useStorage<GlobalMFAAuthenticator[]>(
    { key: 'mfa_registry', instance: extensionStorage },
    []
  )
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [suppressMfaWarnings] = useStorage<boolean>(
    { key: 'suppress_mfa_warnings', instance: extensionStorage },
    false
  )
  // Normalize to arrays — storage may have corrupted values
  const savedAccounts = React.useMemo(
    () => (Array.isArray(savedAccountsRaw) ? savedAccountsRaw : []),
    [savedAccountsRaw]
  )
  const oauthRegistry = React.useMemo(
    () => (Array.isArray(oauthRegistryRaw) ? oauthRegistryRaw : []),
    [oauthRegistryRaw]
  )
  const mfaRegistry = React.useMemo(
    () => (Array.isArray(mfaRegistryRaw) ? mfaRegistryRaw : []),
    [mfaRegistryRaw]
  )
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNotes, setEditNotes] = useState('')
  const [editUsername, setEditUsername] = useState('')
  const [editProvider, setEditProvider] = useState('')
  const [editSource, setEditSource] = useState('')
  const [editMfaType, setEditMfaType] = useState<any>('unknown')
  const [editMfaLoc, setEditMfaLoc] = useState('')
  const [editMfaAuthId, setEditMfaAuthId] = useState('')
  const [editMfaLinkedAccount, setEditMfaLinkedAccount] = useState('')
  const [editApiEndpoint, setEditApiEndpoint] = useState('')
  const [editKeyScope, setEditKeyScope] = useState('')
  const [editApiKey, setEditApiKey] = useState('')
  const [editOauthPurpose, setEditOauthPurpose] = useState<'login' | 'integration'>('login')
  const [editIntegrationScope, setEditIntegrationScope] = useState('')

  // Domain editing state
  const [isEditingDomain, setIsEditingDomain] = useState(false)
  const [editDomainText, setEditDomainText] = useState(domain)

  // Extract unique vault sources across all saved accounts
  const existingVaultSources = React.useMemo(() => {
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

  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set())

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  const toggleReveal = (id: string) => {
    const next = new Set(revealedKeys)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setRevealedKeys(next)
  }

  const isDomainMatch = (dDomain: string, targetDomain: string) => {
    if (dDomain === targetDomain) return true
    // Normalize localhost <-> 127.0.0.1 before comparing
    const normD = normalizeLocalHost(dDomain)
    const normT = normalizeLocalHost(targetDomain)
    if (normD === normT) return true
    // Virtual port-split domain: "localhost:5678" -> base "localhost"
    const baseTarget = normT.split(':')[0]
    if (normD === baseTarget) return true
    // Also check original (in case storage has 127.0.0.1)
    const baseTargetOrig = targetDomain.split(':')[0]
    if (dDomain === baseTargetOrig) return true
    return false
  }

  const togglePin = (accId: string) => {
    if (!savedAccounts) return
    const updated = savedAccounts.map((d) => {
      if (!isDomainMatch(d.domain, domain)) return d
      return {
        ...d,
        accounts: d.accounts.map((acc) =>
          acc.id === accId ? { ...acc, pinned: !acc.pinned } : acc
        )
      }
    })
    setSavedAccounts(updated)
  }

  const { showToast, confirmAction } = useToast()

  const deleteAccount = (accId: string) => {
    confirmAction({
      title: 'Remove Login Entry',
      message: `Remove this login entry for ${domain}?`,
      confirmText: 'Remove Entry',
      cancelText: 'Cancel',
      type: 'destructive',
      onConfirm: () => {
        if (!savedAccounts) return
        const updated = savedAccounts
          .map((d) => {
            if (!isDomainMatch(d.domain, domain)) return d
            return { ...d, accounts: d.accounts.filter((acc) => acc.id !== accId) }
          })
          .filter((d) => d.accounts.length > 0)
        setSavedAccounts(updated)
        showToast(`Removed login entry for ${domain}`, 'info')
        if (accounts.length <= 1) onClose()
      }
    })
  }

  const handleSaveDomainName = () => {
    if (!savedAccounts || !editDomainText.trim()) return
    const cleanDomain = editDomainText.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
    if (!cleanDomain || cleanDomain === domain) {
      setIsEditingDomain(false)
      return
    }

    const updated = savedAccounts.map((d) => {
      if (!isDomainMatch(d.domain, domain)) return d
      return { ...d, domain: cleanDomain }
    })
    setSavedAccounts(updated)
    setIsEditingDomain(false)
    if (onRenameDomain) onRenameDomain(domain, cleanDomain)
    onClose()
  }

  const saveEdits = (accId: string) => {
    if (!savedAccounts) return
    const matchedAuth = mfaRegistry.find((a) => a.id === editMfaAuthId)

    const updated = savedAccounts.map((d) => {
      if (!isDomainMatch(d.domain, domain)) return d
      return {
        ...d,
        accounts: d.accounts.map((acc) => {
          if (acc.id !== accId) return acc
          const newIdents = [...acc.identities]
          newIdents[0] = editUsername || newIdents[0]
          return {
            ...acc,
            identities: newIdents,
            notes: editNotes,
            api_key: acc.login_method.type === 'api-key' ? editApiKey : acc.api_key,
            vault_source: editSource,
            api_endpoint: editApiEndpoint,
            key_scope: editKeyScope,
            oauth_purpose: acc.login_method.type === 'oauth' ? editOauthPurpose : acc.oauth_purpose,
            integration_scope: acc.login_method.type === 'oauth' ? editIntegrationScope : acc.integration_scope,
            login_method:
              acc.login_method.type === 'oauth'
                ? {
                    type: 'oauth' as const,
                    provider: editProvider || acc.login_method.provider
                  }
                : acc.login_method,
            mfa:
              acc.login_method.type !== 'api-key' && editMfaType !== 'none'
                ? {
                    type: editMfaType === 'unknown' ? 'unknown' : editMfaType,
                    device_location: matchedAuth ? matchedAuth.name : editMfaLoc,
                    authenticator_id: matchedAuth?.id || editMfaAuthId || undefined,
                    linked_account:
                      matchedAuth?.linked_account || editMfaLinkedAccount || undefined
                  }
                : undefined
          }
        })
      }
    })
    setSavedAccounts(updated)
    setEditingId(null)
  }

  const [newLinkedDomainInputs, setNewLinkedDomainInputs] = useState<Record<string, string>>({})

  const toggleIntraDomainAlias = (accId: string, targetAccId: string) => {
    if (!savedAccounts) return
    const updated = savedAccounts.map((d) => {
      if (!isDomainMatch(d.domain, domain)) return d
      return {
        ...d,
        accounts: d.accounts.map((acc) => {
          if (acc.id === accId) {
            const current = new Set(acc.intra_domain_aliases || [])
            if (current.has(targetAccId)) current.delete(targetAccId)
            else current.add(targetAccId)
            return { ...acc, intra_domain_aliases: Array.from(current) }
          }
          if (acc.id === targetAccId) {
            const current = new Set(acc.intra_domain_aliases || [])
            if (current.has(accId)) current.delete(accId)
            else current.add(accId)
            return { ...acc, intra_domain_aliases: Array.from(current) }
          }
          return acc
        })
      }
    })
    setSavedAccounts(updated)
  }

  const addLinkedDomain = (accId: string, domainToLink: string) => {
    if (!savedAccounts || !domainToLink.trim()) return
    const cleanDomain = domainToLink.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
    if (!cleanDomain || cleanDomain === domain) return

    // Add to current domain's account
    let updated = savedAccounts.map((d) => {
      if (!isDomainMatch(d.domain, domain)) return d
      return {
        ...d,
        accounts: d.accounts.map((acc) => {
          if (acc.id !== accId) return acc
          const current = new Set(acc.linked_domains || [])
          current.add(cleanDomain)
          return { ...acc, linked_domains: Array.from(current) }
        })
      }
    })

    // Also add current domain to cleanDomain's accounts (2-Way Symmetric Linking!)
    const targetEntryExists = updated.some((d) => isDomainMatch(d.domain, cleanDomain))
    if (targetEntryExists) {
      updated = updated.map((d) => {
        if (!isDomainMatch(d.domain, cleanDomain)) return d
        return {
          ...d,
          accounts: d.accounts.map((acc) => {
            const current = new Set(acc.linked_domains || [])
            current.add(domain)
            return { ...acc, linked_domains: Array.from(current) }
          })
        }
      })
    } else {
      // Create missing target domain entry and populate mirrored account
      const sourceAcc = accounts.find((a) => a.id === accId)
      updated.push({
        domain: cleanDomain,
        accounts: [
          {
            id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
            label: sourceAcc ? sourceAcc.label : 'Mirrored Account',
            identities: sourceAcc ? [...sourceAcc.identities] : [`user@${cleanDomain}`],
            login_method: sourceAcc ? { ...sourceAcc.login_method } : { type: 'password' },
            password_hash: sourceAcc?.password_hash,
            api_key: sourceAcc?.api_key,
            api_title: sourceAcc?.api_title,
            linked_domains: [domain],
            vault_source: 'Cross-Domain Mirror Sync',
            updated_at: Date.now()
          }
        ]
      })
    }

    setSavedAccounts(syncBidirectionalDomainLinks(updated))
    setNewLinkedDomainInputs((prev) => ({ ...prev, [accId]: '' }))
    showToast(`Linked ${cleanDomain} ↔ ${domain} (2-Way Symmetric Mirror)`, 'success')
  }

  const removeLinkedDomain = (accId: string, domainToRemove: string) => {
    if (!savedAccounts) return
    let updated = savedAccounts.map((d) => {
      if (!isDomainMatch(d.domain, domain)) return d
      return {
        ...d,
        accounts: d.accounts.map((acc) => {
          if (acc.id !== accId) return acc
          const current = (acc.linked_domains || []).filter((ld) => ld !== domainToRemove)
          return { ...acc, linked_domains: current }
        })
      }
    })

    // Also remove current domain from domainToRemove's accounts (2-Way Symmetric Unlink!)
    updated = updated.map((d) => {
      if (!isDomainMatch(d.domain, domainToRemove)) return d
      return {
        ...d,
        accounts: d.accounts.map((acc) => {
          const current = (acc.linked_domains || []).filter((ld) => ld !== domain)
          return { ...acc, linked_domains: current }
        })
      }
    })

    setSavedAccounts(updated)
    showToast(`Unlinked ${domainToRemove} ↔ ${domain}`, 'info')
  }

  // Domain type override
  const handleSetDomainType = (type: 'app' | 'website' | undefined) => {
    const updated = (savedAccounts ?? []).map((d) =>
      isDomainMatch(d.domain, domain) ? { ...d, domain_type: type } : d
    )
    setSavedAccounts(updated)
  }

  // Get current domain's type setting
  const currentDomainEntry = (savedAccounts ?? []).find((d) =>
    isDomainMatch(d.domain, domain)
  )
  const domainTypeOverride = currentDomainEntry?.domain_type
  const autoDetectedAsApp = isAppPackageDomain(domain)

  // Human-readable MFA label builder
  const getMFALabel = (
    mfa: IdentityProfile['mfa']
  ): { label: string; color: string; icon: React.ReactNode } => {
    if (!mfa)
      return {
        label: 'No MFA',
        color: 'text-red-500',
        icon: <AlertTriangle size={12} />
      }
    switch (mfa.type) {
      case 'totp_app':
        return {
          label: mfa.device_location || 'Authenticator App',
          color: 'text-green-500',
          icon: <Smartphone size={12} />
        }
      case 'hardware_key':
        return {
          label: mfa.device_location || 'Hardware Key',
          color: 'text-amber-500',
          icon: <Key size={12} />
        }
      case 'sms':
        return {
          label: 'SMS / Email OTP',
          color: 'text-blue-500',
          icon: <Shield size={12} />
        }
      case 'prompt':
        return {
          label: mfa.device_location || 'Device Prompt',
          color: 'text-indigo-500',
          icon: <Fingerprint size={12} />
        }
      default:
        return {
          label: 'MFA (Unknown)',
          color: 'text-muted-foreground',
          icon: <Shield size={12} />
        }
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-md flex items-center justify-center ${
                    domainTypeOverride === 'app' ||
                    (domainTypeOverride === undefined && autoDetectedAsApp)
                      ? 'bg-purple-500/10 text-purple-500'
                      : 'bg-muted'
                  }`}
                >
                  {domainTypeOverride === 'app' ||
                  (domainTypeOverride === undefined && autoDetectedAsApp) ? (
                    <Smartphone size={16} />
                  ) : (
                    <FaviconImage domain={domain} size={20} />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div>
                    {isEditingDomain ? (
                      <div className="flex items-center gap-1 my-0.5">
                        <input
                          type="text"
                          value={editDomainText}
                          onChange={(e) => setEditDomainText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveDomainName()
                            if (e.key === 'Escape') setIsEditingDomain(false)
                          }}
                          className="px-2 py-0.5 bg-background border border-primary rounded text-sm font-bold text-foreground focus:outline-none"
                          autoFocus
                        />
                        <button
                          onClick={handleSaveDomainName}
                          className="px-2 py-0.5 bg-primary text-primary-foreground rounded hover:bg-primary/90 text-xs font-semibold"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setIsEditingDomain(false)}
                          className="px-2 py-0.5 border border-border rounded text-xs text-muted-foreground hover:bg-muted"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <h2 className="text-lg font-bold text-foreground">
                          <AppNameDisplay domain={domain} />
                        </h2>
                        <button
                          onClick={() => {
                            setEditDomainText(domain)
                            setIsEditingDomain(true)
                          }}
                          className="p-1 hover:bg-muted text-muted-foreground hover:text-foreground rounded transition-colors"
                          title="Edit Domain Name"
                        >
                          <Edit3 size={13} />
                        </button>
                      </div>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs text-muted-foreground">
                        {accounts.length} saved login
                        {accounts.length !== 1 ? 's' : ''}
                      </p>
                      {isLocalEnvironment(domain) && (() => {
                        const portHint = resolveDomainPortHint({ domain, accounts })
                        const subdomainHint = getLocalhostSubdomainHint(domain)
                        return (
                          <>
                            {portHint !== 'Portless' && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 font-semibold flex items-center gap-1">
                                ⚡ Port Purpose: <strong>{portHint}</strong>
                              </span>
                            )}
                            {subdomainHint && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30 font-semibold flex items-center gap-1">
                                🖥️ {subdomainHint}
                              </span>
                            )}
                          </>
                        )
                      })()}
                      {(() => {
                        const aggregatedLinkedDomains = Array.from(
                          new Set(
                            accounts.flatMap((a) => [
                              ...(a.linked_domains || []),
                              ...(isLocalEnvironment(domain) ? getNaturalAliases(domain) : [])
                            ])
                          )
                        ).filter((d) => d !== domain)

                        if (aggregatedLinkedDomains.length === 0) return null

                        return (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 font-semibold flex items-center gap-1">
                            <Globe size={11} /> Linked Domains: <strong>{aggregatedLinkedDomains.join(', ')}</strong>
                          </span>
                        )
                      })()}
                      {/* Domain type badge + override */}
                      <div className="flex items-center gap-1">
                        {(domainTypeOverride === 'app' ||
                          (domainTypeOverride === undefined &&
                            autoDetectedAsApp)) && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-500 font-bold">
                            {domainTypeOverride === undefined
                              ? 'App (auto)'
                              : 'App'}
                          </span>
                        )}
                        {domainTypeOverride === 'website' && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-500 font-bold">
                            Website
                          </span>
                        )}
                        {/* Override toggle */}
                        <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5 border border-border ml-1">
                          <button
                            onClick={() =>
                              handleSetDomainType(
                                domainTypeOverride === 'app' ? undefined : 'app'
                              )
                            }
                            className={`text-[9px] px-1.5 py-0.5 rounded transition-colors font-semibold ${
                              domainTypeOverride === 'app'
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                            title="Mark as App"
                          >
                            App
                          </button>
                          <button
                            onClick={() =>
                              handleSetDomainType(
                                domainTypeOverride === 'website'
                                  ? undefined
                                  : 'website'
                              )
                            }
                            className={`text-[9px] px-1.5 py-0.5 rounded transition-colors font-semibold ${
                              domainTypeOverride === 'website'
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                            title="Mark as Website"
                          >
                            Web
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  {domainTypeOverride !== 'app' &&
                    !(
                      domainTypeOverride === undefined && autoDetectedAsApp
                    ) && (
                      <a
                        href={`https://${domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-muted-foreground hover:text-primary hover:bg-muted rounded-md transition-colors"
                        title={`Open ${domain}`}
                      >
                        <ExternalLink size={16} />
                      </a>
                    )}
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground"
              >
                <X size={18} />
              </button>
            </div>



            {/* Accounts list */}
            <div className="p-4 space-y-3 max-h-[55vh] overflow-y-auto">
              {accounts.length === 0 ? (
                <p className="text-sm text-center text-muted-foreground py-8">
                  No accounts found for this domain.
                </p>
              ) : (
                accounts
                  .slice()
                  .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
                  .map((acc) => (
                    <div
                      key={acc.id}
                      className={`rounded-xl border ${acc.pinned ? 'border-amber-500/40 bg-amber-500/5' : 'border-border bg-muted/30'} p-4 space-y-3 transition-colors`}
                    >
                      {/* Identity + method */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-semibold text-foreground text-sm truncate max-w-[220px]">
                              {acc.identities[0]}
                            </span>
                            {isLocalEnvironment(domain) && (() => {
                              const pDetails = getAccountPortDetails(acc, domain)
                              if (pDetails) {
                                return (
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono font-semibold">
                                    Port: {pDetails.port} ({pDetails.hint})
                                  </span>
                                )
                              }
                              return null
                            })()}
                            {acc.label && acc.label !== 'None' && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-semibold">
                                {acc.label}
                              </span>
                            )}
                            {acc.pinned && (
                              <span className="text-[10px] text-amber-500 font-bold">
                                ★ Pinned
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                            {acc.login_method.type === 'oauth' ? (
                              acc.oauth_purpose === 'integration' ? (
                                <span className="text-[11px] font-semibold text-indigo-500 flex items-center gap-1">
                                  🔌 Connected Data Link {acc.integration_scope ? `(${acc.integration_scope})` : ''}
                                </span>
                              ) : (
                                <span className="text-[11px] font-semibold text-emerald-500 flex items-center gap-1">
                                  🔑 OAuth Login Method
                                </span>
                              )
                            ) : (
                              <span className="capitalize flex items-center gap-1">
                                <Key size={12} /> {acc.login_method.type}
                              </span>
                            )}
                            {acc.login_method.provider && (
                              <span className="text-muted-foreground/70">
                                via {acc.login_method.provider}
                              </span>
                            )}
                          </div>
                        </div>
                        {/* Action buttons */}
                        <div className="flex items-center gap-1 shrink-0">
                          {acc.login_method.type !== 'oauth' && (
                            <button
                              onClick={() =>
                                handleCopy(acc.identities[0], acc.id)
                              }
                              className="p-1.5 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-colors"
                              title="Copy username"
                            >
                              {copiedId === acc.id ? (
                                <Check size={14} className="text-green-500" />
                              ) : (
                                <Copy size={14} />
                              )}
                            </button>
                          )}
                          <button
                            onClick={() => togglePin(acc.id)}
                            className="p-1.5 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-colors"
                            title={acc.pinned ? 'Unpin' : 'Pin'}
                          >
                            {acc.pinned ? (
                              <PinOff size={14} />
                            ) : (
                              <Pin size={14} />
                            )}
                          </button>
                          <button
                            onClick={() => {
                              setEditingId(editingId === acc.id ? null : acc.id)
                              setEditNotes(acc.notes || '')
                              setEditUsername(acc.identities[0] || '')
                              setEditProvider(acc.login_method.provider || '')
                              setEditSource(acc.vault_source || '')
                              setEditMfaType(acc.mfa?.type || 'unknown')
                              setEditMfaLoc(acc.mfa?.device_location || '')
                              setEditMfaAuthId(acc.mfa?.authenticator_id || '')
                              setEditMfaLinkedAccount(
                                acc.mfa?.linked_account || ''
                              )
                              setEditApiEndpoint(acc.api_endpoint || '')
                              setEditKeyScope(acc.key_scope || '')
                              setEditOauthPurpose(acc.oauth_purpose || 'login')
                              setEditIntegrationScope(acc.integration_scope || '')
                            }}
                            className="p-1.5 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-colors"
                            title="Edit details"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => deleteAccount(acc.id)}
                            className="p-1.5 hover:bg-red-500/10 rounded-md text-muted-foreground hover:text-red-500 transition-colors"
                            title="Remove entry"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Inline notes editor */}
                      <AnimatePresence>
                        {editingId === acc.id && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="space-y-3 pt-2 border-t border-border mt-2"
                          >
                            {acc.login_method.type === 'oauth' ? (
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block">
                                    Provider
                                  </label>
                                  <select
                                    value={editProvider}
                                    onChange={(e) => {
                                      setEditProvider(e.target.value)
                                      setEditUsername('')
                                    }}
                                    className="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:border-primary text-foreground"
                                  >
                                    <option value="" disabled>
                                      Select...
                                    </option>
                                    {Array.from(
                                      new Set(
                                        oauthRegistry?.map((r) => r.provider) ||
                                          []
                                      )
                                    ).map((p) => (
                                      <option key={p} value={p}>
                                        {p}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block">
                                    Account
                                  </label>
                                  <select
                                    value={editUsername}
                                    onChange={(e) => {
                                      if (e.target.value === '__add_new__') {
                                        const newId = prompt(
                                          'Enter new email/username for ' +
                                            editProvider
                                        )
                                        if (newId) {
                                          setEditUsername(newId)
                                          setOauthRegistry([
                                            ...(oauthRegistry || []),
                                            {
                                              id:
                                                crypto.randomUUID?.() ??
                                                Math.random()
                                                  .toString(36)
                                                  .substring(2),
                                              provider: editProvider,
                                              identity: newId,
                                              created_at: Date.now(),
                                              updated_at: Date.now(),
                                              is_manual: true
                                            }
                                          ])
                                        }
                                      } else {
                                        setEditUsername(e.target.value)
                                      }
                                    }}
                                    className="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:border-primary text-foreground"
                                    disabled={!editProvider}
                                  >
                                    <option value="" disabled>
                                      Select...
                                    </option>
                                    {(oauthRegistry || [])
                                      .filter(
                                        (r) => r.provider === editProvider
                                      )
                                      .map((registryAcc) => (
                                        <option
                                          key={registryAcc.id}
                                          value={registryAcc.identity}
                                        >
                                          {registryAcc.identity}
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
                            ) : (
                              <div>
                                <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">
                                  {acc.login_method.type === 'api-key'
                                    ? 'Key Title / Name'
                                    : 'Username / Email'}
                                </label>
                                <input
                                  type="text"
                                  value={editUsername}
                                  onChange={(e) =>
                                    setEditUsername(e.target.value)
                                  }
                                  className="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:border-primary text-foreground"
                                />
                              </div>
                            )}
                            {acc.login_method.type === 'api-key' && (
                              <div className="space-y-2">
                                <div>
                                  <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">
                                    Secret API Key Value
                                  </label>
                                  <input
                                    type="password"
                                    value={editApiKey}
                                    onChange={(e) => setEditApiKey(e.target.value)}
                                    placeholder="e.g. sk_live_..."
                                    className="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:border-primary text-foreground font-mono"
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">
                                      Endpoint / URL
                                    </label>
                                    <input
                                      type="text"
                                      value={editApiEndpoint}
                                      onChange={(e) =>
                                        setEditApiEndpoint(e.target.value)
                                      }
                                      placeholder="e.g. https://api.example.com"
                                      className="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:border-primary text-foreground"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">
                                      Key Scope / Permissions
                                    </label>
                                    <input
                                      type="text"
                                      value={editKeyScope}
                                      onChange={(e) =>
                                        setEditKeyScope(e.target.value)
                                      }
                                      placeholder="e.g. Read-only, Admin"
                                      className="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:border-primary text-foreground"
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                            {/* Universal Vault Source Selection */}
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">
                                  Vault Source Tag
                                </label>
                                <select
                                  value={editSource}
                                  onChange={(e) => {
                                    if (e.target.value === '__add_new__') {
                                      const custom = prompt('Enter custom Vault Source name (e.g. 1Password, Personal Vault):')
                                      if (custom?.trim()) setEditSource(custom.trim())
                                    } else {
                                      setEditSource(e.target.value)
                                    }
                                  }}
                                  className="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:border-primary text-foreground"
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
                              {/* MFA Type Selection - Hidden for API Keys */}
                              {acc.login_method.type !== 'api-key' && (
                                <div>
                                  <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">
                                    MFA Type
                                  </label>
                                  <select
                                    value={editMfaType}
                                    onChange={(e) =>
                                      setEditMfaType(e.target.value)
                                    }
                                    className="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:border-primary text-foreground"
                                  >
                                    <option value="none">No MFA</option>
                                    <option value="totp_app">
                                      Authenticator App (TOTP)
                                    </option>
                                    <option value="hardware_key">
                                      Hardware Key (YubiKey)
                                    </option>
                                    <option value="sms">SMS / Phone</option>
                                    <option value="prompt">Push Prompt</option>
                                    <option value="passkey">Passkey / FIDO2</option>
                                    <option value="unknown">Unknown</option>
                                  </select>
                                </div>
                              )}
                            </div>
                            {editMfaType !== 'none' && (
                              <div className="space-y-2">
                                <div>
                                  <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">
                                    Master 2FA Device / Authenticator
                                  </label>
                                  <select
                                    value={editMfaAuthId}
                                    onChange={(e) => {
                                      setEditMfaAuthId(e.target.value)
                                      const matched = mfaRegistry.find(
                                        (a) => a.id === e.target.value
                                      )
                                      if (matched) {
                                        setEditMfaLoc(matched.name)
                                        if (matched.linked_account) {
                                          setEditMfaLinkedAccount(
                                            matched.linked_account
                                          )
                                        }
                                      }
                                    }}
                                    className="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:border-primary text-foreground mb-1"
                                  >
                                    <option value="">
                                      -- Custom / Unlinked --
                                    </option>
                                    {mfaRegistry.map((auth) => (
                                      <option key={auth.id} value={auth.id}>
                                        {auth.name} ({auth.provider || auth.type})
                                      </option>
                                    ))}
                                  </select>
                                  <input
                                    type="text"
                                    placeholder="e.g. Google Auth on iPhone, YubiKey 5C"
                                    value={editMfaLoc}
                                    onChange={(e) => setEditMfaLoc(e.target.value)}
                                    className="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:border-primary text-foreground"
                                  />
                                </div>
                                {(editMfaType === 'totp_app' ||
                                  editMfaType === 'totp') && (
                                  <div>
                                    <label className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                                      <Smartphone size={10} /> Linked Account
                                    </label>
                                    <input
                                      type="text"
                                      placeholder="e.g. user@example.com (the Google account the authenticator is registered to)"
                                      value={editMfaLinkedAccount}
                                      onChange={(e) =>
                                        setEditMfaLinkedAccount(
                                          e.target.value
                                        )
                                      }
                                      className="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:border-primary text-foreground"
                                    />
                                    <p className="text-[9px] text-muted-foreground mt-0.5">
                                      Which Google/Microsoft account holds
                                      this authenticator app?
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}
                            <div>
                              <label className="text-[10px] uppercase font-bold text-muted-foreground">
                                Notes
                              </label>
                              <textarea
                                value={editNotes}
                                onChange={(e) => setEditNotes(e.target.value)}
                                rows={2}
                                className="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:border-primary resize-none text-foreground"
                              />
                            </div>
                            <div className="flex gap-2 justify-end pt-1">
                              <button
                                onClick={() => setEditingId(null)}
                                className="text-xs px-2.5 py-1 border border-border rounded-md hover:bg-muted transition-colors"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => saveEdits(acc.id)}
                                className="text-xs px-2.5 py-1 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                              >
                                Save Details
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Show extra details if not editing */}
                      {editingId !== acc.id && (
                        <div className="space-y-1">
                          {acc.vault_source && (
                            <p className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                              Imported from {acc.vault_source}
                            </p>
                          )}
                          {(() => {
                            const mfaInfo = getMFALabel(acc.mfa)
                            const hasMfa = acc.mfa && acc.mfa.type !== 'unknown'
                            if (hasMfa) {
                              return (
                                <div className="space-y-0.5">
                                  <p
                                    className={`text-[11px] font-semibold flex items-center gap-1 ${mfaInfo.color}`}
                                  >
                                    {mfaInfo.icon}
                                    {mfaInfo.label}
                                  </p>
                                  {acc.mfa?.linked_account && (
                                    <p className="text-[10px] text-muted-foreground/70 pl-4 flex items-center gap-1">
                                      <Smartphone size={10} /> Linked:{' '}
                                      {acc.mfa.linked_account}
                                    </p>
                                  )}
                                </div>
                              )
                            }
                            return null
                          })()}
                          {/* Intra-Domain Same-Account Aliases Section */}
                          {(() => {
                            const linkedAliasAccs = accounts.filter((other) =>
                              (acc.intra_domain_aliases || []).includes(other.id)
                            )
                            const candidateAliasAccs = accounts.filter((other) =>
                              other.id !== acc.id &&
                              !(acc.intra_domain_aliases || []).includes(other.id) &&
                              (
                                (acc.password_hash && other.password_hash && acc.password_hash === other.password_hash) ||
                                (acc.identities[0] && other.identities[0] &&
                                 acc.identities[0].split('@')[0] === other.identities[0].split('@')[0])
                              )
                            )
                            const otherUnlinkedAccs = accounts.filter(
                              (other) => other.id !== acc.id && !(acc.intra_domain_aliases || []).includes(other.id)
                            )

                            return (
                              <div className="mt-2.5 p-2.5 rounded-lg border border-border/60 bg-muted/20 space-y-2">
                                <div className="flex items-center justify-between">
                                  <p className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
                                    <Tag size={12} className="text-purple-500" />
                                    Same-Account Aliases (Same Site)
                                  </p>
                                  {otherUnlinkedAccs.length > 0 && (
                                    <select
                                      value=""
                                      onChange={(e) => {
                                        if (e.target.value) toggleIntraDomainAlias(acc.id, e.target.value)
                                      }}
                                      className="text-[10px] bg-background border border-border rounded px-1.5 py-0.5 text-muted-foreground hover:text-foreground focus:outline-none"
                                    >
                                      <option value="">+ Link Same-Domain Alias...</option>
                                      {otherUnlinkedAccs.map((other) => (
                                        <option key={other.id} value={other.id}>
                                          {other.identities[0]} ({other.label})
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                </div>

                                {/* Active linked aliases */}
                                {linkedAliasAccs.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5">
                                    {linkedAliasAccs.map((alias) => (
                                      <span
                                        key={alias.id}
                                        className="text-[10px] px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-400 border border-purple-500/30 font-semibold flex items-center gap-1"
                                      >
                                        🔗 {alias.identities[0]}
                                        <button
                                          onClick={() => toggleIntraDomainAlias(acc.id, alias.id)}
                                          className="hover:text-red-400 ml-1 font-bold"
                                          title="Unlink alias"
                                        >
                                          ×
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {/* Candidate auto-suggestions */}
                                {candidateAliasAccs.length > 0 && (
                                  <div className="space-y-1 pt-1 border-t border-border/40">
                                    <p className="text-[10px] font-semibold text-amber-400 flex items-center gap-1">
                                      <Sparkles size={10} /> Suggested Aliases (Same Password / Username):
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {candidateAliasAccs.map((cand) => (
                                        <button
                                          key={cand.id}
                                          onClick={() => toggleIntraDomainAlias(acc.id, cand.id)}
                                          className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 font-semibold flex items-center gap-1 transition-colors"
                                          title="Click to link as alias"
                                        >
                                          + Link {cand.identities[0]}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })()}

                          {/* Cross-Domain Mirrors & Linked Domains Section */}
                          {(() => {
                            const naturalAliases = isLocalEnvironment(domain) ? getNaturalAliases(domain) : []
                            const userLinked = acc.linked_domains || []
                            const allLinked = Array.from(new Set([...userLinked, ...naturalAliases])).filter((d) => d !== domain)
                            const availableDomains = (savedAccounts || [])
                              .map((d) => d.domain)
                              .filter((d) => d !== domain && !userLinked.includes(d))

                            return (
                              <div className="mt-2 p-2.5 rounded-lg border border-border/60 bg-muted/20 space-y-2">
                                <div className="flex items-center justify-between">
                                  <p className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
                                    <Globe size={12} className="text-blue-500" />
                                    Cross-Domain Mirrors & Linked Sites
                                  </p>
                                </div>

                                {/* Active linked domains */}
                                {allLinked.length > 0 ? (
                                  <div className="flex flex-wrap gap-1.5">
                                    {allLinked.map((ld) => {
                                      const isUserCustom = userLinked.includes(ld)
                                      return (
                                        <span
                                          key={ld}
                                          className="text-[10px] px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-400 border border-blue-500/30 font-semibold flex items-center gap-1"
                                        >
                                          🌐 {ld}
                                          {isUserCustom && (
                                            <button
                                              onClick={() => removeLinkedDomain(acc.id, ld)}
                                              className="hover:text-red-400 ml-1 font-bold"
                                              title="Remove mirror link"
                                            >
                                              ×
                                            </button>
                                          )}
                                        </span>
                                      )
                                    })}
                                  </div>
                                ) : (
                                  <p className="text-[10px] text-muted-foreground/80">No cross-domain mirrors linked yet.</p>
                                )}

                                {/* Add Linked Domain Control */}
                                <div className="flex items-center gap-1.5 pt-1">
                                  <input
                                    type="text"
                                    placeholder="Enter domain (e.g. myaccount.google.com)..."
                                    value={newLinkedDomainInputs[acc.id] || ''}
                                    onChange={(e) =>
                                      setNewLinkedDomainInputs((prev) => ({
                                        ...prev,
                                        [acc.id]: e.target.value
                                      }))
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        addLinkedDomain(acc.id, newLinkedDomainInputs[acc.id] || '')
                                      }
                                    }}
                                    className="flex-1 text-[10px] px-2 py-1 bg-background border border-border rounded focus:outline-none focus:border-primary text-foreground"
                                  />
                                  {availableDomains.length > 0 && (
                                    <select
                                      value=""
                                      onChange={(e) => {
                                        if (e.target.value) addLinkedDomain(acc.id, e.target.value)
                                      }}
                                      className="text-[10px] bg-background border border-border rounded px-1.5 py-1 text-muted-foreground hover:text-foreground focus:outline-none"
                                    >
                                      <option value="">Pick Vault Site...</option>
                                      {availableDomains.map((vd) => (
                                        <option key={vd} value={vd}>
                                          {vd}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                  <button
                                    onClick={() => addLinkedDomain(acc.id, newLinkedDomainInputs[acc.id] || '')}
                                    className="text-[10px] px-2.5 py-1 bg-primary text-primary-foreground font-semibold rounded hover:bg-primary/90 transition-colors shrink-0"
                                  >
                                    + Link
                                  </button>
                                </div>
                              </div>
                            )
                          })()}
                          {(acc.login_method.type === 'api-key' || acc.notes) && (
                            <div className="mt-2">
                              {acc.login_method.type === 'api-key' ? (
                                <div className="flex flex-col gap-1.5 p-2.5 bg-muted/40 rounded-lg border border-border/60">
                                  {acc.api_endpoint && (
                                    <p className="text-[11px] text-muted-foreground break-all">
                                      <span className="font-semibold text-foreground">
                                        Endpoint:
                                      </span>{' '}
                                      {acc.api_endpoint}
                                    </p>
                                  )}
                                  {acc.key_scope && (
                                    <p className="text-[11px] text-muted-foreground">
                                      <span className="font-semibold text-foreground">
                                        Scope:
                                      </span>{' '}
                                      {acc.key_scope}
                                    </p>
                                  )}
                                  <div className="flex items-center justify-between gap-2 pt-1">
                                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                      <Key size={12} className="text-amber-500 shrink-0" />
                                      <span className="text-xs font-mono text-foreground truncate select-all">
                                        {revealedKeys.has(acc.id)
                                          ? (acc.api_key || acc.notes || '(no key stored)')
                                          : '••••••••••••••••••••••••••••••••'}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <button
                                        onClick={() =>
                                          handleCopy(
                                            acc.api_key || acc.notes || '',
                                            acc.id + '-key'
                                          )
                                        }
                                        className="px-2 py-1 bg-primary text-primary-foreground font-semibold rounded text-[10px] hover:bg-primary/90 transition-colors flex items-center gap-1"
                                        title="Direct Copy Secret API Key to Clipboard"
                                      >
                                        {copiedId === acc.id + '-key' ? (
                                          <>
                                            <Check size={11} className="text-primary-foreground" /> Copied!
                                          </>
                                        ) : (
                                          <>
                                            <Copy size={11} /> Copy Key
                                          </>
                                        )}
                                      </button>
                                      <button
                                        onClick={() => toggleReveal(acc.id)}
                                        className="px-2 py-1 border border-border hover:bg-muted text-muted-foreground hover:text-foreground font-semibold rounded text-[10px] transition-colors"
                                      >
                                        {revealedKeys.has(acc.id) ? 'HIDE' : 'REVEAL'}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                acc.notes && (
                                  <p className="text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2 border border-border/50 mt-2">
                                    {acc.notes}
                                  </p>
                                )
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
