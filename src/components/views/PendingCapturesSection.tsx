import React from 'react'
import { useStorage } from '@plasmohq/storage/hook'
import { extensionStorage } from '../../core/storage/config'
import type {
  PendingOAuthCapture,
  DomainEntry,
  IdentityProfile
} from '../../core/storage/schema'
import { isNonOriginDomain } from '../../core/utils/domain'
import { Clock, Globe, Check, X, Trash2, ShieldCheck } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface PendingCapturesSectionProps {
  savedAccounts: DomainEntry[] | undefined
  setSavedAccounts: (val: DomainEntry[]) => void
  oauthRegistry: any[] | undefined
  setOauthRegistry: (val: any[]) => void
}

export const PendingCapturesSection: React.FC<PendingCapturesSectionProps> = ({
  savedAccounts,
  setSavedAccounts,
  oauthRegistry,
  setOauthRegistry
}) => {
  const [pendingCaptures, setPendingCaptures] = useStorage<
    PendingOAuthCapture[]
  >({ key: 'pending_oauth_captures', instance: extensionStorage }, [])

  const validCaptures = (pendingCaptures || []).filter(
    (c) =>
      c.identity &&
      c.identity !== 'Unknown Account' &&
      c.identity.includes('@') &&
      !isNonOriginDomain(c.suggested_domain)
  )

  if (validCaptures.length === 0) return null

  const handleApprovePending = (
    capture: PendingOAuthCapture,
    rawFinalDomain: string,
    overridePurpose?: 'login' | 'integration'
  ) => {
    // 1. Sanitize domain name
    const cleanDomain = rawFinalDomain
      .toLowerCase()
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]

    if (!cleanDomain || isNonOriginDomain(cleanDomain)) return

    const updated = [...(savedAccounts || [])]
    const existingIdx = updated.findIndex((d) => d.domain === cleanDomain)
    const effectivePurpose = overridePurpose || capture.oauth_purpose || 'login'

    const profile: IdentityProfile = {
      id:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).substring(2),
      label: effectivePurpose === 'integration' 
        ? `${capture.provider.split('.')[0].charAt(0).toUpperCase() + capture.provider.split('.')[0].slice(1)} Data Link`
        : `${capture.provider.split('.')[0].charAt(0).toUpperCase() + capture.provider.split('.')[0].slice(1)} OAuth`,
      identities: [capture.identity],
      login_method: { type: 'oauth', provider: capture.provider },
      oauth_purpose: effectivePurpose,
      integration_scope: capture.integration_scope,
      updated_at: Date.now(),
      notes: effectivePurpose === 'integration'
        ? `Connected data source for ${capture.integration_scope || 'Autofill / Scope access'}`
        : 'Recorded during OAuth login'
    }

    if (existingIdx >= 0) {
      const already = updated[existingIdx].accounts.some(
        (a) =>
          a.login_method.type === 'oauth' &&
          a.login_method.provider === capture.provider &&
          a.identities[0] === capture.identity
      )
      if (!already) {
        updated[existingIdx].accounts.push(profile)
      }
    } else {
      updated.push({ domain: cleanDomain, accounts: [profile] })
    }
    setSavedAccounts(updated)

    // 2. Add to linked_websites in global registry
    const newReg = [...(oauthRegistry || [])]
    const regEntry = newReg.find(
      (r) => r.provider === capture.provider && r.identity === capture.identity
    )
    if (regEntry) {
      regEntry.linked_websites = regEntry.linked_websites || []
      if (!regEntry.linked_websites.includes(cleanDomain)) {
        regEntry.linked_websites.push(cleanDomain)
      }
      setOauthRegistry(newReg)
    }

    // 3. Remove from pending queue
    if (pendingCaptures) {
      setPendingCaptures(pendingCaptures.filter((p) => p.id !== capture.id))
    }
  }

  const handleRejectPending = (id: string) => {
    if (pendingCaptures) {
      setPendingCaptures(pendingCaptures.filter((p) => p.id !== id))
    }
  }

  const handleClearAllPending = () => {
    setPendingCaptures([])
  }

  return (
    <div className="mb-8 p-6 rounded-2xl border border-amber-500/30 bg-amber-500/5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-amber-500 flex items-center gap-2">
          <Clock size={20} /> Pending OAuth Captures
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 font-mono">
            {validCaptures.length}
          </span>
        </h2>
        <button
          onClick={handleClearAllPending}
          className="text-xs px-2.5 py-1 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 font-medium flex items-center gap-1 transition-colors"
          title="Discard all pending suggestions"
        >
          <Trash2 size={13} /> Discard All
        </button>
      </div>

      <div className="space-y-3">
        <AnimatePresence>
          {validCaptures.map((capture) => {
            const suggested = capture.suggested_domain
            return (
              <motion.div
                key={capture.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="p-4 bg-card border border-border rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm"
              >
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="font-semibold text-foreground flex items-center gap-1.5">
                      <ShieldCheck size={16} className="text-amber-500" />
                      {capture.identity}
                    </p>
                    {capture.oauth_purpose === 'integration' ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 font-semibold flex items-center gap-1">
                        🔌 Connected Data Link
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-semibold flex items-center gap-1">
                        🔑 OAuth Login Method
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <Globe size={12} /> via{' '}
                    <span className="font-medium text-foreground">
                      {capture.provider}
                    </span>
                    {capture.integration_scope && (
                      <span className="text-muted-foreground/80 italic ml-1">
                        ({capture.integration_scope})
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex flex-col">
                    <label className="text-[10px] text-muted-foreground font-semibold uppercase mb-1">
                      Classification
                    </label>
                    <select
                      id={`pending-purpose-${capture.id}`}
                      defaultValue={capture.oauth_purpose || 'login'}
                      className="px-2 py-1.5 bg-background border border-border rounded-md text-xs focus:outline-none focus:border-primary font-medium text-foreground"
                    >
                      <option value="login">🔑 OAuth Login</option>
                      <option value="integration">🔌 Data Link</option>
                    </select>
                  </div>
                  <div className="flex flex-col">
                    <label className="text-[10px] text-muted-foreground font-semibold uppercase mb-1">
                      Target Website Domain
                    </label>
                    <input
                      type="text"
                      defaultValue={suggested}
                      id={`pending-domain-${capture.id}`}
                      className="px-3 py-1.5 bg-background border border-border rounded-md text-sm focus:outline-none focus:border-primary w-56 font-mono text-foreground"
                    />
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => {
                        const input = document.getElementById(
                          `pending-domain-${capture.id}`
                        ) as HTMLInputElement
                        const purposeSelect = document.getElementById(
                          `pending-purpose-${capture.id}`
                        ) as HTMLSelectElement
                        const overridePurpose = purposeSelect
                          ? (purposeSelect.value as 'login' | 'integration')
                          : undefined
                        if (input) handleApprovePending(capture, input.value, overridePurpose)
                      }}
                      className="p-2 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25 rounded-lg transition-colors font-medium text-xs flex items-center gap-1"
                      title="Approve & Save to Vault"
                    >
                      <Check size={16} /> Approve
                    </button>
                    <button
                      onClick={() => handleRejectPending(capture.id)}
                      className="p-2 bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-lg transition-colors text-xs flex items-center gap-1"
                      title="Reject & Discard"
                    >
                      <X size={16} /> Discard
                    </button>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
