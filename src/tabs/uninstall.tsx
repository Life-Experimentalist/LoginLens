import React, { useEffect, useMemo, useState } from 'react'
import { ThemeProvider } from 'next-themes'
import { useStorage } from '@plasmohq/storage/hook'
import { extensionStorage } from '../core/storage/config'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Download,
  Heart,
  MessageSquare,
  ShieldOff,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  Copy,
  Check,
  Database,
  Globe,
  KeyRound,
  Eye,
  EyeOff,
  AlertTriangle,
  CloudOff,
  FileJson,
  Trash2
} from 'lucide-react'
import type {
  DomainEntry,
  GlobalMFAAuthenticator,
  GlobalOAuthAccount
} from '../core/storage/schema'
import {
  backupFilename,
  buildEncryptedBackup,
  buildJsonBackup,
  downloadFile,
  PYTHON_DECRYPT_SNIPPET,
  type VaultBundle
} from '../core/utils/export'
import { clearCloudSync, getCloudSyncStatus } from '../core/utils/cloud-sync'
import { NEW_ISSUE_URL, RELEASES_URL } from '../core/constants/links'
import iconUrl from 'url:~/assets/ui/icon.png'
import logoUrl from 'url:~/assets/ui/logo-transparent.png'
import '~/style.css'

type Step = 'main' | 'export' | 'done'

function UninstallContent() {
  const [savedAccountsRaw] = useStorage<DomainEntry[]>(
    { key: 'saved_accounts', instance: extensionStorage },
    []
  )
  const [oauthRegistryRaw] = useStorage<GlobalOAuthAccount[]>(
    { key: 'oauth_registry', instance: extensionStorage },
    []
  )
  const [mfaRegistryRaw] = useStorage<GlobalMFAAuthenticator[]>(
    { key: 'mfa_registry', instance: extensionStorage },
    []
  )

  // Memoised so the `[]` fallback does not rebuild the export bundle on every
  // render while storage is still loading.
  const savedAccounts = useMemo(
    () => (Array.isArray(savedAccountsRaw) ? savedAccountsRaw : []),
    [savedAccountsRaw]
  )
  const oauthRegistry = useMemo(
    () => (Array.isArray(oauthRegistryRaw) ? oauthRegistryRaw : []),
    [oauthRegistryRaw]
  )
  const mfaRegistry = useMemo(
    () => (Array.isArray(mfaRegistryRaw) ? mfaRegistryRaw : []),
    [mfaRegistryRaw]
  )

  const [step, setStep] = useState<Step>('main')
  const [format, setFormat] = useState<'llbak' | 'json'>('llbak')
  const [passphrase, setPassphrase] = useState('')
  const [confirmPassphrase, setConfirmPassphrase] = useState('')
  const [showPassphrase, setShowPassphrase] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [exported, setExported] = useState(false)
  const [copied, setCopied] = useState(false)

  const [hasCloudCopy, setHasCloudCopy] = useState(false)
  const [cloudCleared, setCloudCleared] = useState(false)

  const bundle: VaultBundle = useMemo(
    () => ({ savedAccounts, oauthRegistry, mfaRegistry }),
    [savedAccounts, oauthRegistry, mfaRegistry]
  )

  const totalDomains = savedAccounts.length
  const totalAccounts = savedAccounts.reduce(
    (sum, d) => sum + (d.accounts?.length ?? 0),
    0
  )
  const apiKeyCount = savedAccounts.reduce(
    (sum, d) =>
      sum +
      (d.accounts ?? []).filter((a) => a.login_method?.type === 'api-key')
        .length,
    0
  )
  const isEmpty = totalAccounts === 0

  // An encrypted copy in browser sync outlives this profile — it replicates to
  // every other signed-in device. Uninstalling here does not reach those, so
  // the exit flow has to offer to clear it explicitly.
  useEffect(() => {
    getCloudSyncStatus()
      .then((meta) => setHasCloudCopy(!!meta))
      .catch(() => setHasCloudCopy(false))
  }, [])

  const resetFeedback = () => {
    setErrorMsg('')
    setExported(false)
  }

  const handleExport = async () => {
    setErrorMsg('')

    if (format === 'llbak') {
      if (passphrase.length < 8) {
        setErrorMsg('Choose a passphrase of at least 8 characters.')
        return
      }
      if (passphrase !== confirmPassphrase) {
        setErrorMsg('The two passphrases do not match.')
        return
      }

      setIsExporting(true)
      try {
        const content = await buildEncryptedBackup(bundle, passphrase)
        downloadFile(
          content,
          'application/json',
          backupFilename('loginlens_backup', '.llbak')
        )
        setExported(true)
      } catch (err: any) {
        setErrorMsg(err?.message || 'Could not encrypt the backup.')
      } finally {
        setIsExporting(false)
      }
      return
    }

    downloadFile(
      buildJsonBackup(bundle),
      'application/json',
      backupFilename('loginlens_backup', '.json')
    )
    setExported(true)
  }

  const handleCopyJSON = async () => {
    setErrorMsg('')
    try {
      await navigator.clipboard.writeText(buildJsonBackup(bundle))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access is blocked when the tab is not focused, and rejecting
      // silently would look like the copy succeeded.
      setErrorMsg(
        'The browser blocked clipboard access. Use "Download" instead.'
      )
    }
  }

  const handleClearCloud = async () => {
    try {
      await clearCloudSync()
      setCloudCleared(true)
      setHasCloudCopy(false)
    } catch {
      setErrorMsg('Could not reach browser sync. Try again in a moment.')
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Subtle animated background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div
          className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-indigo-500/5 blur-3xl"
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 8, repeat: Infinity }}
        />
        <motion.div
          className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-violet-500/5 blur-3xl"
          animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 10, repeat: Infinity, delay: 3 }}
        />
      </div>

      <div className="relative w-full max-w-2xl">
        <AnimatePresence mode="wait">
          {step === 'main' && (
            <motion.div
              key="main"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              {/* Header */}
              <div className="text-center space-y-4">
                <div className="flex justify-center">
                  <div className="relative">
                    <img
                      src={iconUrl}
                      alt="LoginLens"
                      className="w-20 h-20 object-contain rounded-2xl shadow-2xl"
                    />
                    <motion.div
                      className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-600/20"
                      animate={{ opacity: [0.5, 0.8, 0.5] }}
                      transition={{ duration: 3, repeat: Infinity }}
                    />
                  </div>
                </div>
                <div>
                  <h1 className="text-4xl font-black tracking-tight text-foreground mb-2">
                    Before you go...
                  </h1>
                  <p className="text-muted-foreground text-lg">
                    {isEmpty
                      ? 'There is nothing in your vault, so there is nothing to take with you.'
                      : 'Your data belongs to you — take it with you before you uninstall.'}
                  </p>
                </div>
              </div>

              {/* Data summary */}
              {!isEmpty && (
                <div className="p-6 rounded-2xl border border-border bg-card shadow-sm">
                  <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                    Your vault contains
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <SummaryTile
                      icon={<Database size={18} className="text-indigo-500" />}
                      value={totalDomains}
                      label="Domains"
                      tone="indigo"
                    />
                    <SummaryTile
                      icon={<Globe size={18} className="text-violet-500" />}
                      value={totalAccounts}
                      label="Credentials"
                      tone="violet"
                    />
                    <SummaryTile
                      icon={
                        <ShieldCheck size={18} className="text-emerald-500" />
                      }
                      value={oauthRegistry.length}
                      label="OAuth accounts"
                      tone="emerald"
                    />
                    <SummaryTile
                      icon={<KeyRound size={18} className="text-amber-500" />}
                      value={mfaRegistry.length}
                      label="Authenticators"
                      tone="amber"
                    />
                  </div>
                </div>
              )}

              {/* Action cards */}
              <div className="space-y-3">
                {!isEmpty && (
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => {
                      resetFeedback()
                      setStep('export')
                    }}
                    className="w-full p-5 rounded-2xl border-2 border-primary bg-primary/5 hover:bg-primary/10 transition-colors text-left flex items-center gap-4 group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Download size={22} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-foreground text-base">
                        Export my data first
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Download an encrypted backup you can restore later, on
                        any device.
                      </p>
                    </div>
                    <ArrowRight
                      size={18}
                      className="text-primary opacity-60 group-hover:opacity-100 group-hover:translate-x-1 transition-all"
                    />
                  </motion.button>
                )}

                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => setStep('done')}
                  className="w-full p-5 rounded-2xl border border-border bg-card hover:bg-muted/50 transition-colors text-left flex items-center gap-4 group"
                >
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center shrink-0">
                    <ShieldOff size={22} className="text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-foreground text-base">
                      {isEmpty ? 'Continue' : 'Continue without exporting'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Everything is stored on this device and is removed when
                      you uninstall.
                    </p>
                  </div>
                  <ArrowRight
                    size={18}
                    className="text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all"
                  />
                </motion.button>
              </div>

              {/* Not an unconditional claim: with sync on, ciphertext really
                  did go to the browser vendor, and this is the last screen on
                  which saying otherwise could still mislead someone. */}
              <p className="text-center text-xs text-muted-foreground">
                <Heart size={12} className="inline mr-1 text-red-400" />
                {hasCloudCopy
                  ? 'LoginLens never sent your vault to us. The only copy that left this device is the encrypted one in your browser’s own sync.'
                  : 'LoginLens never sent your vault anywhere. Everything lived on your device.'}
              </p>
            </motion.div>
          )}

          {step === 'export' && (
            <motion.div
              key="export"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="text-center">
                <h2 className="text-3xl font-bold text-foreground mb-2">
                  Export Your Data
                </h2>
                <p className="text-muted-foreground">
                  This is the same backup file the vault's Export wizard
                  produces — you can import it again from Settings.
                </p>
              </div>

              <div className="p-6 rounded-2xl border border-border bg-card shadow-sm space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/30 border border-border text-sm text-muted-foreground">
                  <CheckCircle2
                    size={16}
                    className="text-green-500 shrink-0 mt-0.5"
                  />
                  <span>
                    The backup contains every domain entry, account label, login
                    method, MFA record, note, and your OAuth registry.{' '}
                    <strong className="text-foreground">
                      LoginLens never stores your passwords
                    </strong>
                    , so none are included
                    {apiKeyCount > 0 ? (
                      <>
                        {' '}
                        — but {apiKeyCount} stored API key
                        {apiKeyCount === 1 ? ' is' : 's are'} in there.
                      </>
                    ) : (
                      '.'
                    )}
                  </span>
                </div>

                {/* Format choice */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setFormat('llbak')
                      resetFeedback()
                    }}
                    className={`p-4 border-2 rounded-xl flex flex-col items-center gap-2 text-xs font-semibold transition-all ${
                      format === 'llbak'
                        ? 'border-indigo-500 bg-indigo-500/10 text-indigo-500'
                        : 'border-border bg-background text-muted-foreground hover:border-border/80'
                    }`}
                  >
                    <ShieldCheck size={20} />
                    Encrypted .LLBAK
                    <span className="font-normal opacity-70">Recommended</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormat('json')
                      resetFeedback()
                    }}
                    className={`p-4 border-2 rounded-xl flex flex-col items-center gap-2 text-xs font-semibold transition-all ${
                      format === 'json'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-background text-muted-foreground hover:border-border/80'
                    }`}
                  >
                    <FileJson size={20} />
                    Plain .JSON
                    <span className="font-normal opacity-70">Unencrypted</span>
                  </button>
                </div>

                {format === 'llbak' ? (
                  <div className="space-y-3 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4">
                    <div>
                      <label
                        htmlFor="exit-passphrase"
                        className="text-xs font-bold text-foreground block mb-1"
                      >
                        Backup passphrase
                      </label>
                      <p className="text-[11px] text-muted-foreground mb-2">
                        Encrypts the file with AES-256-GCM. There is no
                        recovery — if you lose this passphrase the backup cannot
                        be opened, by us or by anyone else.
                      </p>
                      <div className="relative">
                        <input
                          id="exit-passphrase"
                          type={showPassphrase ? 'text' : 'password'}
                          value={passphrase}
                          onChange={(e) => {
                            setPassphrase(e.target.value)
                            resetFeedback()
                          }}
                          autoComplete="new-password"
                          placeholder="At least 8 characters"
                          className="w-full px-3 py-2 pr-10 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassphrase((v) => !v)}
                          aria-label={
                            showPassphrase
                              ? 'Hide passphrase'
                              : 'Show passphrase'
                          }
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                        >
                          {showPassphrase ? (
                            <EyeOff size={15} />
                          ) : (
                            <Eye size={15} />
                          )}
                        </button>
                      </div>
                    </div>
                    <input
                      type={showPassphrase ? 'text' : 'password'}
                      value={confirmPassphrase}
                      onChange={(e) => {
                        setConfirmPassphrase(e.target.value)
                        resetFeedback()
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
                      Your backup stays readable after LoginLens is gone. The
                      script needs only <code>pip install cryptography</code>.
                    </p>
                  </div>
                ) : (
                  <div className="flex gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-600 dark:text-amber-400">
                    <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                    <p className="text-[11px] leading-relaxed">
                      <strong>This file is not encrypted.</strong> It contains
                      your account identities, notes, and any stored API keys in
                      plain text. Anyone who opens the file can read them.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3">
                  <button
                    onClick={handleExport}
                    disabled={isExporting}
                    className={`w-full p-4 rounded-xl border-2 text-left flex items-center gap-4 transition-colors disabled:opacity-60 ${
                      exported
                        ? 'border-green-500 bg-green-500/5'
                        : 'border-primary bg-primary/5 hover:bg-primary/10'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      {exported ? (
                        <CheckCircle2 size={20} className="text-green-500" />
                      ) : (
                        <Download size={20} className="text-primary" />
                      )}
                    </div>
                    <div>
                      <p className="font-bold text-foreground">
                        {isExporting
                          ? 'Encrypting…'
                          : exported
                            ? 'Downloaded!'
                            : `Download ${format === 'llbak' ? '.llbak' : '.json'} backup`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {totalDomains} domain
                        {totalDomains === 1 ? '' : 's'} · {totalAccounts}{' '}
                        credential{totalAccounts === 1 ? '' : 's'}
                      </p>
                    </div>
                  </button>

                  {format === 'json' && (
                    <button
                      onClick={handleCopyJSON}
                      className="w-full p-4 rounded-xl border border-border bg-card hover:bg-muted/50 text-left flex items-center gap-4 transition-colors"
                    >
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        {copied ? (
                          <Check size={20} className="text-green-500" />
                        ) : (
                          <Copy size={20} className="text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <p className="font-bold text-foreground">
                          {copied ? 'Copied to clipboard!' : 'Copy to clipboard'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Paste into any notes app or text editor
                        </p>
                      </div>
                    </button>
                  )}
                </div>

                {errorMsg && (
                  <div
                    role="alert"
                    className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive"
                  >
                    {errorMsg}
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('main')}
                  className="flex-1 py-3 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors"
                >
                  ← Back
                </button>
                <button
                  onClick={() => setStep('done')}
                  className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
                >
                  Done →
                </button>
              </div>
            </motion.div>
          )}

          {step === 'done' && (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="text-center space-y-6"
            >
              <div className="flex justify-center">
                <img
                  src={logoUrl}
                  alt="LoginLens"
                  className="w-40 h-40 object-contain opacity-50"
                />
              </div>
              <div>
                <h2 className="text-3xl font-bold text-foreground mb-3">
                  Take care! 👋
                </h2>
                <p className="text-muted-foreground text-base leading-relaxed">
                  Removing LoginLens from your browser erases everything it
                  stored on this device.
                  <br />
                  If you come back, import your backup from{' '}
                  <span className="text-foreground font-medium">
                    Settings → Data
                  </span>
                  .
                </p>
              </div>

              {/* The one thing an uninstall does NOT reach. */}
              {hasCloudCopy && (
                <div className="text-left p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 space-y-3">
                  <div className="flex items-start gap-2.5 text-amber-600 dark:text-amber-400">
                    <CloudOff size={16} className="shrink-0 mt-0.5" />
                    <p className="text-xs leading-relaxed">
                      You have an encrypted copy in browser sync. It has already
                      replicated to your other signed-in devices, and
                      uninstalling here does not reach them.
                    </p>
                  </div>
                  <button
                    onClick={handleClearCloud}
                    className="w-full py-2 rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-semibold hover:bg-amber-500/30 transition-colors flex items-center justify-center gap-2"
                  >
                    <Trash2 size={13} /> Delete the synced copy everywhere
                  </button>
                </div>
              )}

              {cloudCleared && (
                <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-xs text-green-600 dark:text-green-400">
                  <CheckCircle2 size={14} />
                  The synced copy has been deleted from browser sync.
                </div>
              )}

              <div className="flex items-center justify-center gap-2 p-4 rounded-xl bg-muted/30 border border-border text-xs text-muted-foreground">
                <Heart size={14} className="text-red-400" />
                No telemetry. No tracking. We never knew you were here.
              </div>

              <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
                <a
                  href={NEW_ISSUE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <MessageSquare size={14} /> Tell us what went wrong
                </a>
                <a
                  href={RELEASES_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground hover:underline"
                >
                  <Download size={14} /> Reinstall later
                </a>
              </div>

              <button
                onClick={() => setStep('main')}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                ← I still need to export my data
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

const TONES = {
  indigo: 'bg-indigo-500/5 border-indigo-500/20',
  violet: 'bg-violet-500/5 border-violet-500/20',
  emerald: 'bg-emerald-500/5 border-emerald-500/20',
  amber: 'bg-amber-500/5 border-amber-500/20'
} as const

const SummaryTile: React.FC<{
  icon: React.ReactNode
  value: number
  label: string
  tone: keyof typeof TONES
}> = ({ icon, value, label, tone }) => (
  <div
    className={`flex items-center gap-3 p-3 rounded-xl border ${TONES[tone]}`}
  >
    {icon}
    <div className="min-w-0">
      <p className="text-xl font-bold text-foreground leading-tight">{value}</p>
      <p className="text-[11px] text-muted-foreground truncate">{label}</p>
    </div>
  </div>
)

export default function Uninstall() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <UninstallContent />
    </ThemeProvider>
  )
}
