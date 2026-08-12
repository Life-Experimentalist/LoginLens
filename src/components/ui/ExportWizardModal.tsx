import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Download, ShieldCheck, FileJson, FileSpreadsheet, AlertTriangle, Eye, EyeOff } from 'lucide-react'
import type { VaultSnapshot } from '../../core/storage/snapshots'
import type { DomainEntry, GlobalOAuthAccount, GlobalMFAAuthenticator } from '../../core/storage/schema'
import { useStorage } from '@plasmohq/storage/hook'
import { extensionStorage } from '../../core/storage/config'
import { getAccountPortDetails } from '../../core/utils/domain'
import {
  PYTHON_DECRYPT_SNIPPET,
  backupFilename,
  buildEncryptedBackup,
  buildJsonBackup,
  downloadFile,
  escapeCSV
} from '../../core/utils/export'

interface ExportWizardModalProps {
  isOpen: boolean
  onClose: () => void
  snapshots: VaultSnapshot[]
  currentVault: DomainEntry[]
  selectedDomains?: string[]
}

export const ExportWizardModal: React.FC<ExportWizardModalProps> = ({
  isOpen,
  onClose,
  snapshots,
  currentVault,
  selectedDomains = []
}) => {
  const [oauthRegistry] = useStorage<GlobalOAuthAccount[]>(
    { key: 'oauth_registry', instance: extensionStorage },
    []
  )
  const [mfaRegistry] = useStorage<GlobalMFAAuthenticator[]>(
    { key: 'mfa_registry', instance: extensionStorage },
    []
  )
  const [selectedSource, setSelectedSource] = useState<string>('live')
  const [dataSlice, setDataSlice] = useState<'all' | 'selected' | 'passwords' | 'oauth' | 'integrations' | 'apikeys'>(
    selectedDomains.length > 0 ? 'selected' : 'all'
  )
  const [format, setFormat] = useState<'json' | 'csv' | 'llbak'>('llbak')
  const [passphrase, setPassphrase] = useState('')
  const [confirmPassphrase, setConfirmPassphrase] = useState('')
  const [showPassphrase, setShowPassphrase] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  if (!isOpen) return null

  const handleExport = async () => {
    let rawData: DomainEntry[] = []
    let filenamePrefix = 'loginlens_vault'
    let exportOauth = oauthRegistry || []
    let exportMfa = mfaRegistry || []

    if (selectedSource === 'live') {
      rawData = currentVault
      filenamePrefix = 'loginlens_live_vault'
    } else {
      const found = snapshots.find((s) => s.id === selectedSource)
      if (found) {
        rawData = found.data.savedAccounts
        exportOauth = found.data.oauthRegistry || []
        exportMfa = found.data.mfaRegistry || []
        filenamePrefix = `loginlens_snapshot_${found.type}_${found.label.toLowerCase().replace(/\s+/g, '_')}`
      }
    }

    // Apply data slice filter
    let slicedVault: DomainEntry[] = []

    if (dataSlice === 'selected' && selectedDomains.length > 0) {
      slicedVault = rawData.filter((d) => selectedDomains.includes(d.domain))
      filenamePrefix += '_selected_slice'
    } else if (dataSlice === 'passwords') {
      slicedVault = rawData
        .map((d) => ({
          ...d,
          accounts: d.accounts.filter((a) => a.login_method?.type === 'password')
        }))
        .filter((d) => d.accounts.length > 0)
      filenamePrefix += '_passwords_slice'
    } else if (dataSlice === 'oauth') {
      slicedVault = rawData
        .map((d) => ({
          ...d,
          accounts: d.accounts.filter((a) => a.login_method?.type === 'oauth' && a.oauth_purpose !== 'integration')
        }))
        .filter((d) => d.accounts.length > 0)
      filenamePrefix += '_oauth_logins_slice'
    } else if (dataSlice === 'integrations') {
      slicedVault = rawData
        .map((d) => ({
          ...d,
          accounts: d.accounts.filter((a) => a.login_method?.type === 'oauth' && a.oauth_purpose === 'integration')
        }))
        .filter((d) => d.accounts.length > 0)
      filenamePrefix += '_data_links_slice'
    } else if (dataSlice === 'apikeys') {
      slicedVault = rawData
        .map((d) => ({
          ...d,
          accounts: d.accounts.filter((a) => a.login_method?.type === 'api-key')
        }))
        .filter((d) => d.accounts.length > 0)
      filenamePrefix += '_apikeys_slice'
    } else {
      slicedVault = rawData
    }

    if (!slicedVault || slicedVault.length === 0) return

    // Enrich entries with port_hint metadata for exports
    const enrichedVault = slicedVault.map((d) => ({
      ...d,
      accounts: d.accounts.map((a) => {
        const pDetails = getAccountPortDetails(a, d.domain)
        return {
          ...a,
          port_hint: pDetails ? pDetails.fullHint : undefined
        }
      })
    }))

    let content = ''
    let mimeType = 'text/plain'
    let fileExt = '.json'

    const bundle = {
      savedAccounts: enrichedVault,
      oauthRegistry: exportOauth,
      mfaRegistry: exportMfa
    }

    if (format === 'llbak') {
      // The vault carries API keys and recovery notes in the clear, so the
      // format we badge as "encrypted" has to actually be encrypted.
      if (passphrase.length < 8) {
        setErrorMsg('Choose a passphrase of at least 8 characters.')
        return
      }
      if (passphrase !== confirmPassphrase) {
        setErrorMsg('The two passphrases do not match.')
        return
      }

      setIsExporting(true)
      setErrorMsg('')
      try {
        content = await buildEncryptedBackup(bundle, passphrase, dataSlice)
      } catch (err: any) {
        setIsExporting(false)
        setErrorMsg(err?.message || 'Could not encrypt the backup.')
        return
      }
      setIsExporting(false)
      mimeType = 'application/json'
      fileExt = '.llbak'
    } else if (format === 'json') {
      content = buildJsonBackup(bundle, dataSlice)
      mimeType = 'application/json'
      fileExt = '.json'
    } else if (format === 'csv') {
      const headers = ['Domain', 'Label', 'Identity/Email', 'Login Method', 'Provider', 'OAuth Purpose', 'Port Hint', 'Notes']
      const rows: string[][] = []

      ;(enrichedVault as any[]).forEach((d) => {
        d.accounts?.forEach((a: any) => {
          const isApiKey = a.login_method?.type === 'api-key'
          const identity = isApiKey
            ? (a.api_title || (a.identities && a.identities[0]) || a.label || 'API Key')
            : ((a.identities || []).join('; ') || 'Account')
          const noteOrKey = isApiKey ? (a.api_key || a.notes || '') : (a.notes || '')

          rows.push([
            d.domain,
            a.label || '',
            identity,
            a.login_method?.type || 'password',
            a.login_method?.provider || '',
            a.oauth_purpose || 'login',
            a.port_hint || '',
            noteOrKey
          ])
        })
      })

      // escapeCSV quotes only the cells that need it and doubles the quotes
      // inside them. Quoting every cell by hand is what broke this before: a
      // label containing a quote character produced an unparseable row.
      content = [
        headers.join(','),
        ...rows.map((r) => r.map(escapeCSV).join(','))
      ].join('\n')
      mimeType = 'text/csv'
      fileExt = '.csv'
    }

    downloadFile(content, mimeType, backupFilename(filenamePrefix, fileExt))

    onClose()
  }

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-xl overflow-hidden p-6 space-y-6"
        >
          <div className="flex items-center justify-between border-b border-border pb-4">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Download size={20} className="text-primary" />
              Vault Export Wizard
            </h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-muted rounded-md text-muted-foreground transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase block mb-1">
                1. Select Backup Source / Snapshot
              </label>
              <select
                value={selectedSource}
                onChange={(e) => setSelectedSource(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary font-medium"
              >
                <option value="live">
                  ⚡ Live Current Vault ({currentVault.length} domains)
                </option>

                {snapshots.length > 0 && (
                  <optgroup label="Saved Snapshots">
                    {snapshots.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.type === 'manual' ? '✋ Manual' : s.type === 'auto' ? '⚡ Auto' : '📅 Scheduled'}: {s.label} ({new Date(s.timestamp).toLocaleDateString()} - {s.accountCount} accounts)
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase block mb-1">
                2. Filter Data Slice to Export
              </label>
              <select
                value={dataSlice}
                onChange={(e) => setDataSlice(e.target.value as any)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary font-medium"
              >
                <option value="all">📦 All Vault Accounts (Complete Vault)</option>
                {selectedDomains.length > 0 && (
                  <option value="selected">
                    🎯 Selected Items Only ({selectedDomains.length} domains selected)
                  </option>
                )}
                <option value="passwords">🔑 Password Logins Only</option>
                <option value="oauth">🌐 OAuth Sign-in Methods Only</option>
                <option value="integrations">🔌 Connected Data Links / Integrations Only</option>
                <option value="apikeys">⚡ Developer API Keys Only</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase block mb-1">
                3. Export Format
              </label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setFormat('json')}
                  className={`p-3 border rounded-xl flex flex-col items-center gap-2 text-xs font-semibold transition-all ${
                    format === 'json'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:border-border/80'
                  }`}
                >
                  <FileJson size={20} />
                  JSON
                </button>
                <button
                  type="button"
                  onClick={() => setFormat('llbak')}
                  className={`p-3 border rounded-xl flex flex-col items-center gap-2 text-xs font-semibold transition-all ${
                    format === 'llbak'
                      ? 'border-indigo-500 bg-indigo-500/10 text-indigo-500'
                      : 'border-border bg-background text-muted-foreground hover:border-border/80'
                  }`}
                >
                  <ShieldCheck size={20} />
                  .LLBAK
                </button>
                <button
                  type="button"
                  onClick={() => setFormat('csv')}
                  className={`p-3 border rounded-xl flex flex-col items-center gap-2 text-xs font-semibold transition-all ${
                    format === 'csv'
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-500'
                      : 'border-border bg-background text-muted-foreground hover:border-border/80'
                  }`}
                >
                  <FileSpreadsheet size={20} />
                  CSV Table
                </button>
              </div>
            </div>

            {format === 'llbak' ? (
              <div className="space-y-3 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4">
                <div>
                  <label
                    htmlFor="export-passphrase"
                    className="text-xs font-bold text-foreground block mb-1"
                  >
                    4. Backup Passphrase
                  </label>
                  <p className="text-[11px] text-muted-foreground mb-2">
                    Encrypts the file with AES-256-GCM. There is no recovery —
                    if you lose this passphrase the backup cannot be opened, by
                    us or by anyone else.
                  </p>
                  <div className="relative">
                    <input
                      id="export-passphrase"
                      type={showPassphrase ? 'text' : 'password'}
                      value={passphrase}
                      onChange={(e) => {
                        setPassphrase(e.target.value)
                        setErrorMsg('')
                      }}
                      autoComplete="new-password"
                      placeholder="At least 8 characters"
                      className="w-full px-3 py-2 pr-10 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassphrase((v) => !v)}
                      aria-label={
                        showPassphrase ? 'Hide passphrase' : 'Show passphrase'
                      }
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                    >
                      {showPassphrase ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
                <input
                  type={showPassphrase ? 'text' : 'password'}
                  value={confirmPassphrase}
                  onChange={(e) => {
                    setConfirmPassphrase(e.target.value)
                    setErrorMsg('')
                  }}
                  autoComplete="new-password"
                  aria-label="Confirm backup passphrase"
                  placeholder="Confirm passphrase"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() =>
                    downloadFile(
                      PYTHON_DECRYPT_SNIPPET,
                      'text/x-python',
                      'loginlens_decrypt.py'
                    )
                  }
                  className="text-[11px] text-primary hover:underline text-left"
                >
                  Download the offline decryptor script (Python) →
                </button>
                <p className="text-[10px] text-muted-foreground">
                  Your backup stays readable without LoginLens installed. The
                  script needs only <code>pip install cryptography</code>.
                </p>
              </div>
            ) : (
              <div className="flex gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-600 dark:text-amber-400">
                <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                <p className="text-[11px] leading-relaxed">
                  <strong>This file is not encrypted.</strong> It contains your
                  account identities, notes, and any stored API keys in plain
                  text. Anyone who opens the file can read them. Choose{' '}
                  <strong>.LLBAK</strong> for an encrypted backup.
                </p>
              </div>
            )}

            {errorMsg && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                {errorMsg}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:opacity-60"
            >
              <Download size={16} />
              {isExporting ? 'Encrypting…' : 'Export Snapshot'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

export default ExportWizardModal
