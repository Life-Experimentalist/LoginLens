import React, { useState, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, UploadCloud, FileText, CheckCircle2, AlertCircle, ShieldCheck, Database, RefreshCw } from 'lucide-react'
import type { DomainEntry, GlobalOAuthAccount, GlobalMFAAuthenticator } from '../../core/storage/schema'
import { parseEdgePasswordsCSV } from '../../core/utils/csv-parser'
import { useStorage } from '@plasmohq/storage/hook'
import { extensionStorage } from '../../core/storage/config'
import { pushToCloudSync } from '../../core/utils/cloud-sync'
import { decryptData } from '../../core/utils/encryption'
import { readVaultBundle } from '../../core/utils/export'
import { setRawFingerprintKey } from '../../core/utils/password-fingerprint'
import { useToast } from '~/components/ui/ToastContext'

interface CSVImportModalProps {
  isOpen: boolean
  onClose: () => void
  savedAccounts: DomainEntry[]
  setSavedAccounts: (accounts: DomainEntry[]) => void
  onSuccess?: (importedCount: number) => void
}

export const CSVImportModal: React.FC<CSVImportModalProps> = ({
  isOpen,
  onClose,
  savedAccounts,
  setSavedAccounts,
  onSuccess
}) => {
  const [oauthRegistry, setOauthRegistry] = useStorage<GlobalOAuthAccount[]>(
    { key: 'oauth_registry', instance: extensionStorage },
    []
  )
  const [mfaRegistry, setMfaRegistry] = useStorage<GlobalMFAAuthenticator[]>(
    { key: 'mfa_registry', instance: extensionStorage },
    []
  )
  const { showToast } = useToast()

  const [file, setFile] = useState<File | null>(null)
  const [fileText, setFileText] = useState<string>('')
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge')
  const [selectedLabelMode, setSelectedLabelMode] = useState<'existing' | 'new'>('existing')
  const [customLabel, setCustomLabel] = useState('Imported Vault')
  const [selectedExistingLabel, setSelectedExistingLabel] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Set when the selected file is an encrypted .llbak whose payload we have
  // not been able to open yet. The preview stays empty until it decrypts.
  const [lockedPayload, setLockedPayload] = useState<string | null>(null)
  const [passphrase, setPassphrase] = useState('')
  const [isUnlocking, setIsUnlocking] = useState(false)
  // Carried out of an encrypted backup so restored fingerprints keep matching.
  const [pendingFingerprintKey, setPendingFingerprintKey] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Extracted preview stats
  const [previewStats, setPreviewStats] = useState<{
    formatType: 'native' | 'encrypted' | 'csv' | 'unknown'
    domainsCount: number
    accountsCount: number
    oauthCount: number
    mfaCount: number
    parsedData?: {
      savedAccounts: DomainEntry[]
      oauthRegistry: GlobalOAuthAccount[]
      mfaRegistry: GlobalMFAAuthenticator[]
    }
  } | null>(null)

  // Extract all unique vault_source tags from saved accounts
  const existingLabels = useMemo(() => {
    const labelsSet = new Set<string>()
    for (const entry of savedAccounts || []) {
      for (const acc of entry.accounts) {
        if (acc.vault_source) {
          acc.vault_source.split(',').forEach((s) => {
            const trimmed = s.trim()
            if (trimmed) labelsSet.add(trimmed)
          })
        }
      }
    }
    return Array.from(labelsSet)
  }, [savedAccounts])

  // Initialize selected label mode when existingLabels change
  React.useEffect(() => {
    if (existingLabels.length > 0 && !selectedExistingLabel) {
      setSelectedExistingLabel(existingLabels[0])
    }
    if (existingLabels.length === 0) {
      setSelectedLabelMode('new')
    }
    // `selectedExistingLabel` is read only as a "has the user chosen yet" guard.
    // Listing it would re-run this the moment they pick something, and clearing
    // the field would snap the choice back to the first label under them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingLabels])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return
    setFile(selectedFile)
    setErrorMsg('')
    setPreviewStats(null)
    setLockedPayload(null)
    setPassphrase('')
    setPendingFingerprintKey(null)

    const reader = new FileReader()
    reader.onload = async (event) => {
      const text = event.target?.result as string
      setFileText(text)
      analyzeFileContent(selectedFile.name, text)
    }
    reader.onerror = () => {
      setErrorMsg('Failed to read file.')
    }
    reader.readAsText(selectedFile)
  }

  const readVaultShape = (parsed: any, encrypted: boolean) => {
    const bundle = readVaultBundle(parsed)

    let totalAccs = 0
    bundle.savedAccounts.forEach((d) => {
      totalAccs += d.accounts?.length || 0
    })

    setPreviewStats({
      formatType: encrypted ? 'encrypted' : 'native',
      domainsCount: bundle.savedAccounts.length,
      accountsCount: totalAccs,
      oauthCount: bundle.oauthRegistry.length,
      mfaCount: bundle.mfaRegistry.length,
      parsedData: bundle
    })
  }

  const handleUnlock = async () => {
    if (!lockedPayload || !passphrase) return
    setIsUnlocking(true)
    setErrorMsg('')
    try {
      const inner = JSON.parse(await decryptData(lockedPayload, passphrase))
      if (typeof inner.passwordFingerprintKey === 'string') {
        setPendingFingerprintKey(inner.passwordFingerprintKey)
      }
      readVaultShape(inner, true)
      setLockedPayload(null)
      setPassphrase('')
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not decrypt this backup.')
    } finally {
      setIsUnlocking(false)
    }
  }

  const analyzeFileContent = async (fileName: string, text: string) => {
    try {
      const trimmed = text.trim()
      if (fileName.endsWith('.llbak') || fileName.endsWith('.json') || trimmed.startsWith('{')) {
        const parsed = JSON.parse(trimmed)

        // Encrypted .llbak: the envelope is readable, the vault is not. Hold
        // the ciphertext and wait for the passphrase before previewing.
        if (typeof parsed.payload === 'string' && !parsed.savedAccounts && !parsed.vault) {
          setLockedPayload(parsed.payload)
          return
        }

        readVaultShape(parsed, false)
      } else {
        // Parse CSV
        const result = await parseEdgePasswordsCSV(text)
        let totalAccs = 0
        result.validDomains.forEach((d) => {
          totalAccs += d.accounts?.length || 0
        })

        setPreviewStats({
          formatType: 'csv',
          domainsCount: result.validDomains.length,
          accountsCount: totalAccs,
          oauthCount: 0,
          mfaCount: 0,
          parsedData: {
            savedAccounts: result.validDomains,
            oauthRegistry: [],
            mfaRegistry: []
          }
        })
      }
    } catch (err: any) {
      setErrorMsg('Could not parse file structure: ' + (err.message || 'Unknown error'))
    }
  }

  const handleImport = async () => {
    if (!fileText || !previewStats?.parsedData) {
      setErrorMsg('Please select a valid vault file or CSV first.')
      return
    }

    const sourceTag =
      selectedLabelMode === 'existing'
        ? selectedExistingLabel
        : customLabel.trim()

    setIsProcessing(true)
    setErrorMsg('')

    try {
      const incoming = previewStats.parsedData
      let finalAccounts: DomainEntry[] = []
      let finalOauth: GlobalOAuthAccount[] = []
      let finalMfa: GlobalMFAAuthenticator[] = []
      let importedCount = 0

      if (importMode === 'replace') {
        // Overwrite mode: 100% exact reproduction
        finalAccounts = incoming.savedAccounts.map((d) => ({
          ...d,
          accounts: d.accounts.map((a) => ({
            ...a,
            vault_source: a.vault_source || sourceTag
          }))
        }))
        finalOauth = incoming.oauthRegistry
        finalMfa = incoming.mfaRegistry

        incoming.savedAccounts.forEach((d) => {
          importedCount += d.accounts.length
        })
      } else {
        // Merge mode: Add & update cleanly
        finalAccounts = [...(savedAccounts || [])]
        finalOauth = [...(oauthRegistry || [])]
        finalMfa = [...(mfaRegistry || [])]

        // 1. Merge Domain Accounts
        incoming.savedAccounts.forEach((newDomainMap) => {
          const existingDomainIdx = finalAccounts.findIndex(
            (d) => d.domain === newDomainMap.domain
          )

          if (existingDomainIdx >= 0) {
            const existingAccounts = finalAccounts[existingDomainIdx].accounts
            newDomainMap.accounts.forEach((newAcc) => {
              const existingIdx = existingAccounts.findIndex(
                (ea) =>
                  ea.id === newAcc.id ||
                  (ea.login_method?.type === newAcc.login_method?.type &&
                    ea.identities[0] === newAcc.identities[0])
              )

              if (existingIdx >= 0) {
                // Update existing account fields cleanly
                const existing = existingAccounts[existingIdx]
                existing.label = newAcc.label || existing.label
                if (newAcc.password_hash) existing.password_hash = newAcc.password_hash
                if (newAcc.notes) existing.notes = newAcc.notes
                if (newAcc.mfa) existing.mfa = newAcc.mfa
                if (newAcc.api_endpoint) existing.api_endpoint = newAcc.api_endpoint
                if (newAcc.key_scope) existing.key_scope = newAcc.key_scope
                if (sourceTag && !existing.vault_source?.includes(sourceTag)) {
                  existing.vault_source = existing.vault_source
                    ? `${existing.vault_source}, ${sourceTag}`
                    : sourceTag
                }
                existing.updated_at = Date.now()
              } else {
                newAcc.vault_source = sourceTag || newAcc.vault_source || 'Imported'
                existingAccounts.push(newAcc)
                importedCount++
              }
            })
          } else {
            newDomainMap.accounts.forEach((acc) => {
              acc.vault_source = sourceTag || acc.vault_source || 'Imported'
              importedCount++
            })
            finalAccounts.push(newDomainMap)
          }
        })

        // 2. Merge OAuth Registry
        incoming.oauthRegistry.forEach((inOauth) => {
          const exists = finalOauth.some(
            (o) => o.id === inOauth.id || (o.provider === inOauth.provider && o.identity === inOauth.identity)
          )
          if (!exists) finalOauth.push(inOauth)
        })

        // 3. Merge MFA Registry
        incoming.mfaRegistry.forEach((inMfa) => {
          const exists = finalMfa.some((m) => m.id === inMfa.id)
          if (!exists) finalMfa.push(inMfa)
        })
      }

      // A full restore has to bring the fingerprint key with it, otherwise the
      // restored password_hash values are keyed to an install that no longer
      // exists and reuse detection silently reports nothing. Only meaningful
      // on 'replace' — merging two vaults keyed differently would corrupt the
      // fingerprints already on this device.
      if (pendingFingerprintKey && importMode === 'replace') {
        await setRawFingerprintKey(pendingFingerprintKey)
      }

      // Commit to storage
      setSavedAccounts(finalAccounts)
      setOauthRegistry(finalOauth)
      setMfaRegistry(finalMfa)

      // Cloud sync is opt-in; a disabled or unconfigured sync is not an import
      // failure, so only a genuine error is worth surfacing.
      const sync = await pushToCloudSync({
        savedAccounts: finalAccounts,
        oauthRegistry: finalOauth,
        mfaRegistry: finalMfa
      })

      setIsProcessing(false)
      showToast(`Import wizard complete! ${importedCount} logins & registries processed.`)
      if (!sync.ok && sync.reason !== 'disabled' && sync.reason !== 'no-passphrase') {
        showToast(`Imported, but cloud sync failed: ${sync.message}`)
      }
      if (onSuccess) onSuccess(importedCount)
      onClose()
    } catch (err: any) {
      setIsProcessing(false)
      setErrorMsg('Failed to process import: ' + (err.message || 'Unknown error'))
    }
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <UploadCloud size={20} className="text-primary" />
              <h3 className="text-base font-bold text-foreground">Import & Restore Wizard</h3>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-muted rounded-full transition-colors text-muted-foreground"
            >
              <X size={18} />
            </button>
          </div>

          <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
            {/* Step 1: File Selection */}
            <div>
              <label className="text-xs font-bold text-foreground block mb-2">
                1. Select Vault Backup or CSV File (.llbak, .json, .csv)
              </label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border hover:border-primary/50 bg-muted/20 hover:bg-muted/40 rounded-xl p-5 text-center cursor-pointer transition-all"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.json,.llbak"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                {file ? (
                  <div className="flex items-center justify-center gap-2 text-foreground font-semibold">
                    <FileText size={18} className="text-primary" />
                    <span className="truncate max-w-[300px]">{file.name}</span>
                    <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <UploadCloud size={24} className="mx-auto text-muted-foreground mb-1" />
                    <p className="text-xs font-semibold text-foreground">
                      Click to browse or drop file here
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Supports LoginLens Native Backup (.llbak), Vault JSON (.json), Edge/Chrome CSV (.csv)
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Encrypted backup — unlock before anything can be previewed */}
            {lockedPayload && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3.5 bg-indigo-500/5 border border-indigo-500/30 rounded-xl space-y-2"
              >
                <p className="text-xs font-bold text-indigo-500 flex items-center gap-1.5">
                  <ShieldCheck size={14} />
                  Encrypted LoginLens Backup
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Enter the passphrase you chose when this backup was exported.
                </p>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={passphrase}
                    autoComplete="current-password"
                    aria-label="Backup passphrase"
                    placeholder="Backup passphrase"
                    onChange={(e) => {
                      setPassphrase(e.target.value)
                      setErrorMsg('')
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleUnlock()
                    }}
                    className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-xs text-foreground focus:outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={handleUnlock}
                    disabled={isUnlocking || !passphrase}
                    className="px-3 py-2 bg-indigo-500 text-white rounded-lg text-xs font-semibold hover:bg-indigo-500/90 transition-colors disabled:opacity-50"
                  >
                    {isUnlocking ? 'Decrypting…' : 'Unlock'}
                  </button>
                </div>
              </motion.div>
            )}

            {/* Preview Card */}
            {previewStats && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3.5 bg-primary/5 border border-primary/20 rounded-xl space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                    <ShieldCheck size={14} />
                    {previewStats.formatType === 'encrypted'
                      ? 'Encrypted LoginLens Backup (unlocked)'
                      : previewStats.formatType === 'native'
                        ? 'LoginLens Native Vault Backup'
                        : 'Passwords CSV Import'}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary font-bold">
                    {previewStats.formatType === 'csv'
                      ? 'Partial fields'
                      : 'Full fidelity'}
                  </span>
                </div>
                {previewStats.formatType === 'csv' && (
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    A browser CSV carries only the site, username, and password.
                    LoginLens keeps the site, the username, and a fingerprint of
                    the password for reuse detection — labels, OAuth links, MFA
                    records, and notes are not present in the file and cannot be
                    recovered from it.
                  </p>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  <div className="p-2 bg-card rounded-lg border border-border text-center">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Domains</p>
                    <p className="text-base font-bold text-foreground">{previewStats.domainsCount}</p>
                  </div>
                  <div className="p-2 bg-card rounded-lg border border-border text-center">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Accounts</p>
                    <p className="text-base font-bold text-foreground">{previewStats.accountsCount}</p>
                  </div>
                  <div className="p-2 bg-card rounded-lg border border-border text-center">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">OAuth</p>
                    <p className="text-base font-bold text-foreground">{previewStats.oauthCount}</p>
                  </div>
                  <div className="p-2 bg-card rounded-lg border border-border text-center">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">MFA</p>
                    <p className="text-base font-bold text-foreground">{previewStats.mfaCount}</p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 2: Import Mode */}
            <div>
              <label className="text-xs font-bold text-foreground block mb-2">
                2. Import Mode
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setImportMode('merge')}
                  className={`p-3 rounded-lg border text-left transition-colors flex items-start gap-2.5 ${
                    importMode === 'merge'
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  <RefreshCw size={16} className="mt-0.5 text-primary shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-foreground">Merge with Vault</p>
                    <p className="text-[10px] text-muted-foreground">Add new items & update existing ones without deleting anything</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setImportMode('replace')}
                  className={`p-3 rounded-lg border text-left transition-colors flex items-start gap-2.5 ${
                    importMode === 'replace'
                      ? 'border-destructive bg-destructive/10 text-foreground'
                      : 'border-border bg-card text-muted-foreground hover:border-destructive/50'
                  }`}
                >
                  <Database size={16} className="mt-0.5 text-destructive shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-foreground">Restore & Overwrite</p>
                    <p className="text-[10px] text-muted-foreground">Replace entire vault state with exact 100% backup fidelity</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Step 3: Source Tag */}
            <div>
              <label className="text-xs font-bold text-foreground block mb-1">
                3. Vault Source Tag
              </label>
              <select
                value={customLabel}
                onChange={(e) => {
                  if (e.target.value === '__add_new__') {
                    const custom = prompt('Enter custom Vault Source name (e.g. 1Password, Personal Laptop):')
                    if (custom?.trim()) setCustomLabel(custom.trim())
                  } else {
                    setCustomLabel(e.target.value)
                  }
                }}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs text-foreground focus:outline-none focus:border-primary"
              >
                {Array.from(new Set([
                  'Imported Vault',
                  'Edge Passwords',
                  'Google Chrome',
                  'Firefox Passwords',
                  'Bitwarden',
                  '1Password',
                  ...((savedAccounts || []).flatMap((d) =>
                    d.accounts.flatMap((a) => (a.vault_source ? a.vault_source.split(',') : []))
                  ).map((s) => s.trim()).filter(Boolean))
                ])).map((src) => (
                  <option key={src} value={src}>
                    {src}
                  </option>
                ))}
                <option value="__add_new__" className="font-semibold text-primary">
                  + Add Custom Source Tag...
                </option>
              </select>
            </div>

            {errorMsg && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive flex items-start gap-2">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-border bg-muted/20">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-border rounded-lg text-xs font-semibold hover:bg-muted transition-colors text-foreground"
            >
              Cancel
            </button>
            <button
              disabled={isProcessing || !fileText}
              onClick={handleImport}
              className="px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-lg text-xs hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {isProcessing ? 'Processing Import...' : 'Execute Import Wizard'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
