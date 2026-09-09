import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useStorage } from '@plasmohq/storage/hook'
import { extensionStorage } from '../../core/storage/config'
import type {
  DomainEntry,
  GlobalMFAAuthenticator
} from '../../core/storage/schema'
import {
  UploadCloud,
  DownloadCloud,
  AlertTriangle,
  Sliders,
  Database,
  Sun,
  Moon,
  Globe,
  Monitor,
  Code,
  Trash2,
  Copy,
  Radio,
  Download,
  ArrowRightLeft,
  Layout,
  Sparkles,
  BellOff,
  LogOut,
  Info,
  BookOpen,
  Bug,
  Shield,
  Scale,
  ExternalLink
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { getBrowserName } from '../../core/utils/browser'
import { useToast } from '~/components/ui/ToastContext'
import {
  pushToCloudSync,
  pullFromCloudSync,
  clearCloudSync,
  getCloudSyncStatus,
  estimateSyncPayloadBytes,
  MAX_TOTAL_BYTES,
  CLOUD_SYNC_ENABLED_KEY,
  CLOUD_SYNC_PASSPHRASE_KEY,
  type SyncMeta
} from '../../core/utils/cloud-sync'
import { normalizeLocalHost } from '../../core/utils/domain'
import { log, type LogEntry } from '../../core/utils/logger'
import {
  getSnapshots,
  createSnapshot,
  restoreSnapshot,
  deleteSnapshot,
  type VaultSnapshot
} from '../../core/storage/snapshots'
import {
  FAVICON_SOURCE_KEY,
  type FaviconSource
} from '~/components/ui/FaviconImage'
import type { RecentOrder } from '~/core/utils/recent-domains'
import { CSVImportModal } from '~/components/ui/CSVImportModal'
import { ExportWizardModal } from '~/components/ui/ExportWizardModal'
import { getExtensionVersion } from '../../core/utils/runtime'
import {
  DOCS_URL,
  LICENSE_URL,
  NEW_ISSUE_URL,
  REPO_URL,
  SECURITY_URL
} from '../../core/constants/links'

type SettingsTab =
  | 'interface'
  | 'general'
  | 'domains'
  | 'data'
  | 'developer'
  | 'about'

// Reusable toggle component
const Toggle: React.FC<{
  checked: boolean
  onChange: () => void
  id?: string
}> = ({ checked, onChange, id }) => (
  <button
    type="button"
    role="switch"
    id={id}
    aria-checked={checked}
    onClick={onChange}
    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background ${
      checked ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'
    }`}
  >
    <span
      className={`inline-block h-4 w-4 transform rounded-full shadow-md transition-transform duration-200 ${
        checked
          ? 'translate-x-6 bg-white dark:bg-black'
          : 'translate-x-1 bg-white'
      }`}
    />
  </button>
)

export const SettingsView: React.FC = () => {
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
  // Normalize to arrays — storage may have corrupted values. Memoised because
  // the `[]` fallback is a fresh array every render while storage is still
  // loading, which would re-run the sync-payload sizing below — a full
  // JSON.stringify of the vault — on every keystroke in this view.
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
  const [isExportWizardOpen, setIsExportWizardOpen] = useState(false)
  const { showToast, confirmAction } = useToast()
  const [snapshots, setSnapshotsList] = useState<VaultSnapshot[]>([])

  useEffect(() => {
    getSnapshots().then(setSnapshotsList)
  }, [savedAccountsRaw])

  const handleCreateManualSnapshot = async () => {
    const label = prompt(
      'Enter a label for this manual snapshot:',
      'Manual Backup'
    )
    if (label !== null) {
      await createSnapshot('manual', label || 'Manual Backup')
      const updated = await getSnapshots()
      setSnapshotsList(updated)
      showToast('Manual snapshot created successfully!')
    }
  }

  const handleRestoreSnapshot = (s: VaultSnapshot) => {
    confirmAction({
      title: 'Restore Vault Snapshot',
      message: `Are you sure you want to restore your vault to "${s.label}" from ${new Date(s.timestamp).toLocaleString()}? Current unsaved changes will be replaced.`,
      confirmText: 'Restore Vault',
      type: 'destructive',
      onConfirm: async () => {
        try {
          // A restore replaces the whole vault, so the state being replaced
          // needs a restore point of its own — otherwise picking the wrong
          // snapshot from the list is unrecoverable. The cloud restore below
          // has always done this; doing it here too makes every restore
          // reversible.
          await createSnapshot('auto', 'Before snapshot restore')
          await restoreSnapshot(s)
          setSnapshotsList(await getSnapshots())
          showToast('Vault restored successfully!')
        } catch (err) {
          log.error('Snapshot restore failed', err)
          showToast(
            'Restore failed — your vault was left unchanged.',
            'error'
          )
        }
      }
    })
  }

  const handleDeleteSnapshot = (id: string) => {
    confirmAction({
      title: 'Delete Snapshot',
      message: 'Are you sure you want to delete this snapshot backup?',
      confirmText: 'Delete Snapshot',
      type: 'destructive',
      onConfirm: async () => {
        await deleteSnapshot(id)
        const updated = await getSnapshots()
        setSnapshotsList(updated)
        showToast('Snapshot deleted.')
      }
    })
  }
  const [debugMode, setDebugMode] = useStorage<boolean>(
    { key: 'debug_mode', instance: extensionStorage },
    process.env.NODE_ENV === 'development'
  )
  const [alwaysRecordOauth, setAlwaysRecordOauth] = useStorage<boolean>(
    { key: 'always_record_oauth', instance: extensionStorage },
    false
  )
  const [dashboardColumns, setDashboardColumns] = useStorage<number>(
    { key: 'dashboard_columns', instance: extensionStorage },
    3
  )
  const [recentOrder, setRecentOrder] = useStorage<RecentOrder>(
    { key: 'recent_domains_order', instance: extensionStorage },
    'recent'
  )
  const [recentCount, setRecentCount] = useStorage<number>(
    { key: 'recent_domains_count', instance: extensionStorage },
    5
  )
  const [showSisterDomains, setShowSisterDomains] = useStorage<boolean>(
    { key: 'show_sister_domains', instance: extensionStorage },
    false
  )
  const [suppressMfaWarnings, setSuppressMfaWarnings] = useStorage<boolean>(
    { key: 'suppress_mfa_warnings', instance: extensionStorage },
    false
  )
  const [faviconSource, setFaviconSource] = useStorage<FaviconSource>(
    { key: FAVICON_SOURCE_KEY, instance: extensionStorage },
    'local'
  )
  const [, setOnboardingComplete] = useStorage<boolean>(
    { key: 'onboarding_complete', instance: extensionStorage },
    true
  )
  const [reviewItems, setReviewItems] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<SettingsTab>('interface')
  const [aiEnabled, setAiEnabled] = useState(true)
  // Sync uploads data off this device, so it stays off until the user turns it
  // on and sets a passphrase. The default here must match isCloudSyncEnabled().
  const [cloudSyncEnabled, setCloudSyncEnabled] = useStorage<boolean>(
    { key: CLOUD_SYNC_ENABLED_KEY, instance: extensionStorage },
    false
  )
  const [syncPassphrase, setSyncPassphrase] = useStorage<string>(
    { key: CLOUD_SYNC_PASSPHRASE_KEY, instance: extensionStorage },
    ''
  )
  const [passphraseDraft, setPassphraseDraft] = useState('')
  const [syncMeta, setSyncMeta] = useState<SyncMeta | null>(null)
  const [isRestoringFromCloud, setIsRestoringFromCloud] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [trainDomainInput, setTrainDomainInput] = useState('')
  const [trainDomainType, setTrainDomainType] = useState<'website' | 'app'>(
    'website'
  )
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const { theme, setTheme } = useTheme()
  const logContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (activeTab === 'developer') {
      log.getLogs().then(setLogs)
      const interval = setInterval(() => log.getLogs().then(setLogs), 2000)
      return () => clearInterval(interval)
    }
  }, [activeTab])

  useEffect(() => {
    if (activeTab === 'data') getCloudSyncStatus().then(setSyncMeta)
  }, [activeTab, savedAccountsRaw])

  // Everything that goes up must be measured — leaving the MFA registry out of
  // the estimate would under-report the payload against the same 100KB cap the
  // upload is checked against.
  const syncPayload = useMemo(
    () => ({ savedAccounts, oauthRegistry, mfaRegistry }),
    [savedAccounts, oauthRegistry, mfaRegistry]
  )
  const syncPayloadBytes = useMemo(
    () => estimateSyncPayloadBytes(syncPayload),
    [syncPayload]
  )
  const syncPayloadPct = (syncPayloadBytes / MAX_TOTAL_BYTES) * 100

  const vaultBytes = useMemo(
    () => new TextEncoder().encode(JSON.stringify(syncPayload)).length,
    [syncPayload]
  )

  /**
   * Pulls the encrypted copy back down and replaces the local vault with it.
   *
   * Sync is only half a feature without this: uploading a vault nobody can
   * restore is just a backup nothing reads. Restore is destructive by nature —
   * the remote copy is the whole vault, not a diff — so it takes a snapshot
   * first and routes through a confirmation.
   */
  const handleRestoreFromCloud = () => {
    confirmAction({
      title: 'Restore from Cloud Sync',
      message:
        'This replaces the vault on this device with the encrypted copy stored in browser sync. A snapshot of the current vault is taken first so you can undo it.',
      confirmText: 'Replace local vault',
      type: 'destructive',
      onConfirm: async () => {
        setIsRestoringFromCloud(true)
        try {
          await createSnapshot('manual', 'Before cloud restore')
          const remote = await pullFromCloudSync()
          if (!remote) {
            showToast('Nothing has been uploaded to browser sync yet.')
            return
          }
          setSavedAccounts(remote.savedAccounts)
          setOauthRegistry(remote.oauthRegistry)
          setMfaRegistry(remote.mfaRegistry)
          setSnapshotsList(await getSnapshots())
          showToast(
            `Restored ${remote.savedAccounts.length} domain(s) from cloud sync.`
          )
        } catch (err: any) {
          // pullFromCloudSync throws with a message written for the user —
          // a wrong passphrase and a corrupt payload need different fixes.
          showToast(err?.message || 'Could not restore from cloud sync.')
        } finally {
          setIsRestoringFromCloud(false)
        }
      }
    })
  }

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs])

  /**
   * Tidies up two kinds of drift that ordinary use produces:
   *
   *  1. The same local dev server saved under both `127.0.0.1` and
   *     `localhost`, which shows up as two unrelated entries.
   *  2. OAuth registry entries whose `linked_websites` has fallen behind the
   *     accounts that actually use that provider, so the "used on 14 sites"
   *     count reads low.
   *
   * It only ever merges and backfills — nothing is deleted. A restore point is
   * taken first regardless, because a bulk rewrite of the vault is not
   * something a user should have to take on trust.
   */
  const handleRepairVault = async () => {
    if (!savedAccounts || !oauthRegistry) return
    const newReg = [...oauthRegistry]
    let modified = false

    await createSnapshot('auto', 'Before vault repair')

    // Phase 1: Consolidate local dev domains (127.0.0.1 -> localhost) in raw storage
    const domainMap = new Map<string, DomainEntry>()
    savedAccounts.forEach((d) => {
      const canonicalDomain = normalizeLocalHost(d.domain)
      if (domainMap.has(canonicalDomain)) {
        const existing = domainMap.get(canonicalDomain)!
        const existingIds = new Set(existing.accounts.map((a) => a.id))
        const newAccs = d.accounts.filter((a) => !existingIds.has(a.id))
        if (newAccs.length > 0) {
          domainMap.set(canonicalDomain, {
            ...existing,
            accounts: [...existing.accounts, ...newAccs]
          })
          modified = true
        }
      } else {
        domainMap.set(canonicalDomain, { ...d, domain: canonicalDomain })
        if (canonicalDomain !== d.domain) modified = true
      }
    })

    const consolidatedAccounts = Array.from(domainMap.values())

    // Phase 2: Link OAuth providers
    consolidatedAccounts.forEach((domainEntry) => {
      domainEntry.accounts.forEach((acc) => {
        if (acc.login_method?.type === 'oauth' && acc.login_method.provider) {
          const regEntry = newReg.find(
            (r) =>
              r.provider === acc.login_method.provider &&
              r.identity === acc.identities[0]
          )
          if (regEntry) {
            regEntry.linked_websites = regEntry.linked_websites || []
            if (!regEntry.linked_websites.includes(domainEntry.domain)) {
              regEntry.linked_websites.push(domainEntry.domain)
              modified = true
            }
          }
        }
      })
    })

    if (modified) {
      setSavedAccounts(consolidatedAccounts)
      setOauthRegistry(newReg)
    }

    const result = await pushToCloudSync(
      modified
        ? {
            savedAccounts: consolidatedAccounts,
            oauthRegistry: newReg,
            mfaRegistry
          }
        : syncPayload
    )

    const base = modified
      ? 'Vault repaired. A restore point was saved first.'
      : 'Nothing to repair — the vault is already tidy.'

    if (result.ok) {
      showToast(`${base} Synced ${result.chunks} encrypted chunk(s).`)
    } else if (result.reason === 'disabled') {
      showToast(base)
    } else {
      // Anything other than "sync is off" is worth telling the user about —
      // silently swallowing it is how a vault stops syncing without anyone
      // noticing.
      showToast(`${base} Cloud sync skipped: ${result.message}`)
    }
  }

  const handleReopenWalkthrough = async () => {
    await extensionStorage.set('welcome_step', 0)
    setOnboardingComplete(false)
    window.location.hash = 'welcome'
  }

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'interface', label: 'Interface', icon: <Layout size={16} /> },
    { id: 'general', label: 'General', icon: <Sliders size={16} /> },
    { id: 'domains', label: 'Domain Rules', icon: <Globe size={16} /> },
    { id: 'data', label: 'Data', icon: <Database size={16} /> },
    { id: 'developer', label: 'Developer', icon: <Code size={16} /> },
    { id: 'about', label: 'About', icon: <Info size={16} /> }
  ]

  return (
    <div className="p-8 max-w-4xl mx-auto w-full pb-20">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Settings</h1>
        <p className="text-muted-foreground">
          Configure LoginLens preferences and manage data.
        </p>
      </div>

      {/* Horizontal Sub-Tabs */}
      <div className="flex border-b border-border mb-6 gap-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 pb-3 font-medium text-sm transition-colors border-b-2 ${
              activeTab === tab.id
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Interface */}
      {activeTab === 'interface' && (
        <div className="space-y-6">
          {/* Appearance */}
          <div className="p-6 rounded-xl border border-border bg-card shadow-sm space-y-4">
            <h3 className="text-lg font-semibold border-b border-border pb-2">
              Appearance & Theme
            </h3>
            <div className="flex justify-between items-center py-2">
              <div>
                <p className="font-medium text-foreground">Color Theme</p>
                <p className="text-sm text-muted-foreground">
                  Choose between Light, Dark, or System mode.
                </p>
              </div>
              <div className="flex items-center gap-2 bg-muted p-1 rounded-lg border border-border">
                <button
                  onClick={() => setTheme('light')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                    theme === 'light'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Sun size={14} /> Light
                </button>
                <button
                  onClick={() => setTheme('dark')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                    theme === 'dark'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Moon size={14} /> Dark
                </button>
                <button
                  onClick={() => setTheme('system')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                    theme === 'system'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Monitor size={14} /> System
                </button>
              </div>
            </div>
          </div>

          {/* Dashboard Layout */}
          <div className="p-6 rounded-xl border border-border bg-card shadow-sm space-y-4">
            <h3 className="text-lg font-semibold border-b border-border pb-2">
              Dashboard Layout
            </h3>

            <div className="flex justify-between items-center py-2">
              <div>
                <p className="font-medium text-foreground">
                  Vault Grid Columns
                </p>
                <p className="text-sm text-muted-foreground">
                  Number of columns in the All Entries vault grid. 3 is the
                  default; 4 gives more density on wider screens.
                </p>
              </div>
              <div className="flex items-center gap-2 bg-muted p-1 rounded-lg border border-border">
                {[2, 3, 4].map((n) => (
                  <button
                    key={n}
                    onClick={() => setDashboardColumns(n)}
                    className={`w-9 py-1.5 text-xs rounded-md font-bold transition-colors ${
                      (dashboardColumns ?? 3) === n
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="py-2 border-t border-border pt-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-medium text-foreground">
                    Popup Suggestions
                  </p>
                  <p className="text-sm text-muted-foreground">
                    What the popup lists below the current site. Recently used
                    only counts domains already in your vault, so this never
                    becomes a record of where you browsed.
                  </p>
                </div>
                <div className="flex items-center gap-2 bg-muted p-1 rounded-lg border border-border shrink-0">
                  {(
                    [
                      ['recent', 'Recent'],
                      ['alphabetical', 'A-Z'],
                      ['accounts', 'Most']
                    ] as [RecentOrder, string][]
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setRecentOrder(value)}
                      className={`px-3 py-1.5 text-xs rounded-md font-bold transition-colors ${
                        (recentOrder ?? 'recent') === value
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-between items-center mt-3">
                <p className="text-sm text-muted-foreground">
                  How many to show
                </p>
                <div className="flex items-center gap-2 bg-muted p-1 rounded-lg border border-border">
                  {[0, 3, 5, 10].map((n) => (
                    <button
                      key={n}
                      onClick={() => setRecentCount(n)}
                      className={`w-9 py-1.5 text-xs rounded-md font-bold transition-colors ${
                        (recentCount ?? 5) === n
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {n === 0 ? 'Off' : n}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center py-2 border-t border-border pt-4">
              <div>
                <p className="font-medium text-foreground flex items-center gap-2">
                  <BellOff size={15} className="text-muted-foreground" />{' '}
                  Suppress MFA Warnings
                </p>
                <p className="text-sm text-muted-foreground">
                  Hide the red "No MFA configured" warning in account cards.
                  Useful once you understand your security posture.
                </p>
              </div>
              <Toggle
                id="suppress-mfa"
                checked={suppressMfaWarnings ?? false}
                onChange={() => setSuppressMfaWarnings(!suppressMfaWarnings)}
              />
            </div>

            <div className="flex justify-between items-center py-2 border-t border-border pt-4">
              <div className="pr-6">
                <p className="font-medium text-foreground flex items-center gap-2">
                  <Globe size={15} className="text-muted-foreground" /> Load
                  Favicons from Google
                </p>
                <p className="text-sm text-muted-foreground">
                  Off by default. Turning this on requests each site's icon from{' '}
                  <code className="text-xs">google.com/s2/favicons</code>, which
                  puts the domain in the URL — so opening your vault reveals
                  every site you have saved to Google. With it off, LoginLens
                  draws the icons locally and makes no network requests.
                </p>
              </div>
              <Toggle
                id="favicon-source"
                checked={faviconSource === 'google'}
                onChange={() =>
                  setFaviconSource(
                    faviconSource === 'google' ? 'local' : 'google'
                  )
                }
              />
            </div>
          </div>

          {/* Walkthrough */}
          <div className="p-6 rounded-xl border border-border bg-card shadow-sm space-y-4">
            <h3 className="text-lg font-semibold border-b border-border pb-2">
              Onboarding
            </h3>
            <div className="flex justify-between items-center py-2">
              <div>
                <p className="font-medium text-foreground">
                  Reopen Welcome Walkthrough
                </p>
                <p className="text-sm text-muted-foreground">
                  Revisit the guided tour of LoginLens features. Won't affect
                  any of your data.
                </p>
              </div>
              <button
                onClick={handleReopenWalkthrough}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/20 font-medium rounded-md transition-colors border border-indigo-500/20 text-sm"
              >
                <Sparkles size={15} /> Open Walkthrough
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab: General */}
      {activeTab === 'general' && (
        <div className="space-y-6">
          <div className="p-6 rounded-xl border border-border bg-card shadow-sm space-y-4">
            <h3 className="text-lg font-semibold border-b border-border pb-2">
              Behavior & Inference
            </h3>

            <div className="flex justify-between items-center py-2">
              <div>
                <p className="font-medium text-foreground">
                  AI DOM Inference Patcher
                </p>
                <p className="text-sm text-muted-foreground">
                  Automatically infer obscure login field names using local
                  fallback heuristics.
                </p>
              </div>
              <Toggle
                checked={aiEnabled}
                onChange={() => setAiEnabled(!aiEnabled)}
              />
            </div>

            <div className="flex justify-between items-center py-2 border-t border-border mt-2 pt-4">
              <div>
                <p className="font-medium text-foreground">
                  Always Record OAuth Logins
                </p>
                <p className="text-sm text-muted-foreground">
                  Automatically monitor and record all OAuth logins without
                  clicking the Record button.
                </p>
              </div>
              <Toggle
                checked={alwaysRecordOauth ?? false}
                onChange={() => setAlwaysRecordOauth(!alwaysRecordOauth)}
              />
            </div>

            <div className="flex justify-between items-center py-2 border-t border-border mt-2 pt-4">
              <div>
                <p className="font-medium text-foreground">
                  Show Sister Domains in the Popup
                </p>
                <p className="text-sm text-muted-foreground">
                  Also surface domains that merely share a first label, like
                  paypal.me next to paypal.com. This is a guess rather than a
                  link you made, so it is off by default. Subdomains, parent
                  domains and domains you linked yourself always show.
                </p>
              </div>
              <Toggle
                checked={showSisterDomains ?? false}
                onChange={() => setShowSisterDomains(!showSisterDomains)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Tab: Domain Rules & Training */}
      {activeTab === 'domains' && (
        <div className="space-y-6">
          <div className="p-6 rounded-xl border border-border bg-card shadow-sm space-y-4">
            <div>
              <h3 className="text-lg font-bold border-b border-border pb-2 flex items-center gap-2">
                <Globe size={18} /> Domain Classification & Rules Training
              </h3>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                Train LoginLens to recognize specific domains (e.g.{' '}
                <code className="text-indigo-400 font-mono">
                  in.pinterest.com
                </code>
                ) as a <strong>Website</strong> or <strong>App</strong>.
                Overrides auto-detection.
              </p>
            </div>

            {/* Form to add custom domain rule */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const clean = trainDomainInput
                  .toLowerCase()
                  .trim()
                  .replace(/^https?:\/\//, '')
                  .split('/')[0]
                if (!clean) return
                const updated = (savedAccounts ?? []).map((d) => {
                  if (d.domain === clean)
                    return { ...d, domain_type: trainDomainType }
                  return d
                })
                const exists = updated.some((d) => d.domain === clean)
                if (!exists) {
                  updated.push({
                    domain: clean,
                    domain_type: trainDomainType,
                    accounts: []
                  })
                }
                setSavedAccounts(updated)
                setTrainDomainInput('')
              }}
              className="p-4 rounded-xl bg-muted/40 border border-border flex flex-col sm:flex-row items-end gap-3"
            >
              <div className="flex-1 w-full space-y-1">
                <label className="text-xs font-semibold text-foreground">
                  Target Domain Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. in.pinterest.com or com.example.app"
                  value={trainDomainInput}
                  onChange={(e) => setTrainDomainInput(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs focus:outline-none focus:border-primary"
                  required
                />
              </div>

              <div className="space-y-1 w-full sm:w-40">
                <label className="text-xs font-semibold text-foreground">
                  Classify As
                </label>
                <select
                  value={trainDomainType}
                  onChange={(e) =>
                    setTrainDomainType(e.target.value as 'website' | 'app')
                  }
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs focus:outline-none focus:border-primary"
                >
                  <option value="website">Website (Web)</option>
                  <option value="app">App (Package)</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full sm:w-auto px-4 py-2 bg-primary text-primary-foreground font-semibold text-xs rounded-lg hover:bg-primary/90 transition-colors shrink-0"
              >
                Add / Save Rule
              </button>
            </form>

            {/* List of active domain classification overrides */}
            <div className="space-y-2 pt-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Current Trained Classifications
              </h4>
              {!savedAccounts ||
              savedAccounts.filter((d) => d.domain_type).length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  No custom domain overrides active. Standard web TLD rules
                  apply.
                </p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {savedAccounts
                    .filter((d) => d.domain_type)
                    .map((d) => (
                      <div
                        key={d.domain}
                        className="flex items-center justify-between p-3 rounded-lg border border-border bg-background text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">
                            {d.domain}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              d.domain_type === 'website'
                                ? 'bg-indigo-500/10 text-indigo-500 border border-indigo-500/20'
                                : 'bg-purple-500/10 text-purple-500 border border-purple-500/20'
                            }`}
                          >
                            {d.domain_type === 'website' ? 'Website' : 'App'}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            const updated = savedAccounts.map((entry) =>
                              entry.domain === d.domain
                                ? { ...entry, domain_type: undefined }
                                : entry
                            )
                            setSavedAccounts(updated)
                          }}
                          className="text-xs text-muted-foreground hover:text-destructive underline"
                        >
                          Reset to Auto
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Data Management */}
      {activeTab === 'data' && (
        <div className="space-y-6">
          {/* Storage Usage Analytics */}
          <div className="p-6 rounded-xl border border-border bg-card shadow-sm space-y-4">
            <h3 className="text-lg font-semibold border-b border-border pb-2">
              Storage Analytics
            </h3>

            <div className="py-2 space-y-4">
              <div>
                <div className="flex justify-between items-end mb-2">
                  <div>
                    <p className="font-medium text-foreground">
                      Estimated Vault Size
                    </p>
                  </div>
                  <div className="text-sm font-bold text-foreground">
                    {(vaultBytes / (1024 * 1024)).toFixed(2)} MB / 10 MB
                  </div>
                </div>
                <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${(() => {
                      const pct = (vaultBytes / (10 * 1024 * 1024)) * 100
                      if (pct > 90) return 'bg-red-500'
                      if (pct > 75) return 'bg-amber-500'
                      return 'bg-primary'
                    })()}`}
                    style={{
                      width: `${Math.min(100, (vaultBytes / (10 * 1024 * 1024)) * 100)}%`
                    }}
                  />
                </div>
              </div>

              {/* Cloud Sync Toggle and Bar */}
              <div className="border-t border-border mt-4 pt-4">
                <div className="flex justify-between items-center mb-4">
                  <div className="pr-4">
                    <p className="font-medium text-foreground">
                      Cloud Sync{' '}
                      <span className="ml-1 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground align-middle">
                        Off by default
                      </span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Copies an encrypted vault to {getBrowserName()} Sync so
                      your other signed-in browsers can read it. The data leaves
                      this device and is stored on your browser vendor's
                      servers — encrypted with your passphrase, which they never
                      receive.
                    </p>
                  </div>
                  <Toggle
                    id="cloud-sync-toggle"
                    checked={cloudSyncEnabled === true}
                    onChange={() => {
                      if (cloudSyncEnabled) {
                        confirmAction({
                          title: 'Turn off Cloud Sync',
                          message:
                            'This deletes the encrypted copy from browser sync. Your local vault is untouched.',
                          confirmText: 'Turn off & delete cloud copy',
                          type: 'destructive',
                          onConfirm: async () => {
                            setCloudSyncEnabled(false)
                            await clearCloudSync()
                            setSyncMeta(null)
                            showToast('Cloud sync disabled and remote copy deleted.')
                          }
                        })
                      } else {
                        setCloudSyncEnabled(true)
                      }
                    }}
                  />
                </div>

                {cloudSyncEnabled && (
                  <div className="mb-4 space-y-2 rounded-lg border border-border bg-background p-3">
                    <label
                      htmlFor="sync-passphrase"
                      className="text-xs font-bold text-foreground block"
                    >
                      Sync Passphrase
                    </label>
                    <p className="text-[11px] text-muted-foreground">
                      {syncPassphrase
                        ? 'A passphrase is set. Every other device must use the same one to read the synced vault.'
                        : 'Nothing syncs until you set one. Without a passphrase LoginLens refuses to upload rather than uploading in the clear.'}
                    </p>
                    <div className="flex gap-2">
                      <input
                        id="sync-passphrase"
                        type="password"
                        autoComplete="new-password"
                        value={passphraseDraft}
                        onChange={(e) => setPassphraseDraft(e.target.value)}
                        placeholder={
                          syncPassphrase
                            ? 'Enter a new passphrase to replace it'
                            : 'At least 8 characters'
                        }
                        className="flex-1 px-3 py-2 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none focus:border-primary"
                      />
                      <button
                        type="button"
                        disabled={passphraseDraft.length < 8}
                        onClick={async () => {
                          setSyncPassphrase(passphraseDraft)
                          setPassphraseDraft('')
                          // A new passphrase makes the existing remote copy
                          // undecryptable, so replace it immediately.
                          await clearCloudSync()
                          const result = await pushToCloudSync(syncPayload)
                          setSyncMeta(await getCloudSyncStatus())
                          showToast(
                            result.ok
                              ? `Passphrase saved. Vault synced in ${result.chunks} encrypted chunk(s).`
                              : `Passphrase saved, but sync failed: ${result.message}`
                          )
                        }}
                        className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                      >
                        Save & Sync
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {syncMeta
                        ? `Last uploaded ${new Date(syncMeta.updated_at).toLocaleString()} • ${syncMeta.numChunks} chunk(s).`
                        : 'Nothing has been uploaded yet.'}
                    </p>

                    <div className="border-t border-border pt-3 mt-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold text-foreground">
                          Restore from Cloud
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Pull the synced vault down onto this device. Use this
                          on a second browser after setting the same passphrase.
                          It replaces the local vault — a snapshot is taken
                          first.
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={!syncMeta || !syncPassphrase || isRestoringFromCloud}
                        onClick={handleRestoreFromCloud}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-xs font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <DownloadCloud size={14} />
                        {isRestoringFromCloud ? 'Restoring…' : 'Restore'}
                      </button>
                    </div>
                  </div>
                )}

                {cloudSyncEnabled && (
                  <div>
                    <div className="flex justify-between items-end mb-2">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">
                          Encrypted Sync Payload
                        </p>
                      </div>
                      <div className="text-sm font-bold text-foreground">
                        {(syncPayloadBytes / 1024).toFixed(2)} KB / 100 KB
                      </div>
                    </div>
                    <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          syncPayloadPct > 90
                            ? 'bg-red-500'
                            : syncPayloadPct > 75
                              ? 'bg-amber-500'
                              : 'bg-indigo-500'
                        }`}
                        style={{ width: `${Math.min(100, syncPayloadPct)}%` }}
                      />
                    </div>
                    {syncPayloadPct > 100 && (
                      <p className="text-[11px] text-red-500 mt-2">
                        This vault is over the browser sync limit. Sync will be
                        refused — use an encrypted .LLBAK export to move it
                        between devices instead.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-lg flex gap-3 text-sm text-amber-600 dark:text-amber-400 mt-4">
                <AlertTriangle className="shrink-0 mt-0.5" size={16} />
                <div>
                  <p className="font-bold mb-1">
                    Vault Size vs. Encrypted Sync Payload
                  </p>
                  <p className="opacity-90 leading-relaxed text-xs space-y-1">
                    <span>
                      <strong>Estimated Vault Size</strong> is the raw JSON
                      stored locally on this machine. Local storage is capped at
                      roughly 10 MB, which is far more than a typical vault
                      needs.
                    </span>
                    <br />
                    <span className="block mt-1">
                      <strong>Encrypted Sync Payload</strong> is what would
                      actually be uploaded: the vault is minified to short field
                      names, LZ-compressed, encrypted with AES-256-GCM, and
                      base64-encoded. {getBrowserName()} Sync caps that at{' '}
                      <strong>100 KB</strong> total, so large vaults have to
                      move by file export instead.
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-xl border border-border bg-card shadow-sm space-y-4">
            <h3 className="text-lg font-semibold border-b border-border pb-2">
              Vault Data Import / Export
            </h3>

            <div className="flex justify-between items-center py-2">
              <div>
                <p className="font-medium text-foreground">Import & Restore Vault</p>
                <p className="text-sm text-muted-foreground">
                  Import passwords or restore complete vault backups (.llbak, .json, .csv).
                </p>
              </div>
              <button
                onClick={() => setIsImportModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 font-medium rounded-md transition-colors"
              >
                <UploadCloud size={16} />
                Import Wizard
              </button>
            </div>

            <div className="flex justify-between items-center py-2 border-t border-border mt-2 pt-4">
              <div>
                <p className="font-medium text-foreground">
                  Export Data & Snapshots
                </p>
                <p className="text-sm text-muted-foreground">
                  Export any live vault or snapshot as JSON, CSV, or .LLBAK
                  format.
                </p>
              </div>
              <button
                onClick={() => setIsExportWizardOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 font-medium rounded-md transition-colors"
              >
                <Download size={16} />
                Export Wizard
              </button>
            </div>

            {/* 3-Tier Snapshot Manager */}
            <div className="border-t border-border mt-4 pt-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-semibold text-foreground flex items-center gap-2">
                    <Database size={18} className="text-primary" />
                    3-Tier Rolling Snapshot Vault
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Manual (max 5) • Auto Change Restore (max 7) • Weekly
                    Scheduled (if modified)
                  </p>
                </div>
                <button
                  onClick={handleCreateManualSnapshot}
                  className="px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  + Create Snapshot
                </button>
              </div>

              {snapshots.length === 0 ? (
                <div className="p-4 rounded-lg bg-muted/40 border border-border text-center text-xs text-muted-foreground">
                  No snapshots created yet. Snapshots will automatically be
                  created when changes occur.
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {snapshots.map((s) => (
                    <div
                      key={s.id}
                      className="p-3 bg-muted/30 border border-border rounded-lg flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-full font-bold uppercase text-[9px] ${
                            s.type === 'manual'
                              ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                              : s.type === 'auto'
                                ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                                : 'bg-indigo-500/15 text-indigo-500 border border-indigo-500/30'
                          }`}
                        >
                          {s.type}
                        </span>
                        <div>
                          <p className="font-semibold text-foreground">
                            {s.label}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(s.timestamp).toLocaleString()} •{' '}
                            {s.accountCount} accounts ({s.domainCount} domains)
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleRestoreSnapshot(s)}
                          className="px-2.5 py-1 bg-primary/10 text-primary hover:bg-primary/20 rounded font-medium transition-colors text-[11px]"
                          title="Restore vault to this snapshot state"
                        >
                          Restore
                        </button>
                        <button
                          onClick={() => handleDeleteSnapshot(s.id)}
                          className="p-1 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded transition-colors"
                          title="Delete snapshot"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-between items-center gap-4 py-2 border-t border-border mt-2 pt-4">
              <div>
                <p className="font-medium text-foreground">Repair &amp; Tidy Vault</p>
                <p className="text-sm text-muted-foreground">
                  Merges duplicate local dev entries (127.0.0.1 and localhost)
                  and rebuilds the site list on each OAuth provider. Nothing is
                  deleted, and a restore point is saved first.
                </p>
              </div>
              <button
                onClick={handleRepairVault}
                className="flex items-center gap-2 shrink-0 px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 font-medium rounded-md transition-colors border border-border"
              >
                <ArrowRightLeft size={16} />
                Repair
              </button>
            </div>

            <div className="flex justify-between items-center py-2 border-t border-border mt-2 pt-4">
              <div>
                <p className="font-medium text-foreground">Clear Local Vault</p>
                <p className="text-sm text-muted-foreground">
                  Permanently wipe all stored identity mapping data.
                </p>
              </div>
              <button
                onClick={() => {
                  confirmAction({
                    title: 'Clear Local Vault',
                    message: 'Are you sure you want to permanently clear all stored identity and credential data?',
                    confirmText: 'Clear Vault',
                    cancelText: 'Cancel',
                    type: 'destructive',
                    onConfirm: () => {
                      setSavedAccounts([])
                      setReviewItems([])
                      showToast('Local vault data cleared', 'info')
                    }
                  })
                }}
                className="px-4 py-2 bg-destructive/10 text-destructive hover:bg-destructive/20 font-medium rounded-md transition-colors"
              >
                Clear Data
              </button>
            </div>

            {/* The browser opens the website on uninstall, and a web page
                cannot read extension storage. So the only moment a leaving
                user can still export is before they remove the extension —
                this is the door to that page. */}
            <div className="flex justify-between items-center py-2 border-t border-border mt-2 pt-4">
              <div>
                <p className="font-medium text-foreground">
                  Leaving LoginLens?
                </p>
                <p className="text-sm text-muted-foreground">
                  Take your vault with you before you uninstall — uninstalling
                  erases it.
                </p>
              </div>
              <button
                onClick={() =>
                  chrome.tabs.create({
                    url: chrome.runtime.getURL('tabs/uninstall.html')
                  })
                }
                className="flex items-center gap-2 px-4 py-2 border border-border text-muted-foreground hover:text-foreground hover:bg-muted font-medium rounded-md transition-colors"
              >
                <LogOut size={16} />
                Export &amp; Leave
              </button>
            </div>
          </div>

          {reviewItems.length > 0 && (
            <div className="p-6 rounded-xl border border-yellow-500/50 bg-yellow-500/5 shadow-sm space-y-4">
              <div className="flex items-center gap-3 border-b border-yellow-500/20 pb-2">
                <AlertTriangle className="text-yellow-500" size={24} />
                <h3 className="text-lg font-semibold text-yellow-600 dark:text-yellow-500">
                  Needs Review ({reviewItems.length} items)
                </h3>
              </div>
              <p className="text-sm text-muted-foreground">
                These rows were skipped during CSV processing due to missing
                usernames or passwords.
              </p>
              <div className="max-h-64 overflow-y-auto space-y-2 pr-2">
                {reviewItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-background rounded border border-border flex justify-between items-center"
                  >
                    <div className="truncate pr-4">
                      <p className="font-medium text-sm truncate">
                        {item.name || item.url || 'Unknown URL'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.username || '(No Username)'}
                      </p>
                    </div>
                    <span className="text-xs px-2 py-1 bg-red-500/10 text-red-500 rounded font-medium whitespace-nowrap">
                      {item.reason}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Developer */}
      {activeTab === 'developer' && (
        <div className="space-y-6">
          <div className="p-6 rounded-xl border border-border bg-card shadow-sm space-y-4">
            <h3 className="text-lg font-semibold border-b border-border pb-2 flex items-center justify-between">
              <span>Developer & Diagnostics</span>
            </h3>

            <div className="flex justify-between items-center py-2">
              <div>
                <p className="font-medium text-foreground flex items-center gap-2">
                  <Radio size={15} className="text-primary" /> Debug Logging
                </p>
                <p className="text-sm text-muted-foreground">
                  Enable verbose internal logging for tracking complex OAuth
                  redirect chains.
                </p>
              </div>
              <Toggle
                checked={debugMode ?? false}
                onChange={() => setDebugMode(!debugMode)}
              />
            </div>
          </div>

          <div className="p-6 rounded-xl border border-border bg-card shadow-sm space-y-4 flex flex-col h-[500px]">
            <div className="flex justify-between items-center border-b border-border pb-2">
              <h3 className="text-lg font-semibold">System Logs</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    const safe = Array.isArray(logs) ? logs : []
                    const text = safe
                      .map(
                        (l) =>
                          `[${new Date(l.timestamp).toISOString()}] [${l.level}] ${l.message} ${l.data ? JSON.stringify(l.data) : ''}`
                      )
                      .join('\n')
                    try {
                      await navigator.clipboard.writeText(text)
                      showToast('Logs copied to clipboard.')
                    } catch {
                      showToast('Could not access the clipboard.', 'error')
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-muted hover:bg-muted/80 text-foreground transition-colors"
                >
                  <Copy size={14} /> Copy All
                </button>
                <button
                  onClick={async () => {
                    // Clearing the on-screen list before the write lands would
                    // show an empty log that repopulates on the next read.
                    try {
                      await log.clearLogs()
                      setLogs([])
                    } catch {
                      showToast('Could not clear the logs.', 'error')
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                >
                  <Trash2 size={14} /> Clear
                </button>
              </div>
            </div>

            <div
              ref={logContainerRef}
              className="flex-1 overflow-y-auto bg-muted/30 rounded-lg border border-border p-3 space-y-1 font-mono text-[10px]"
            >
              {!Array.isArray(logs) || logs.length === 0 ? (
                <div className="text-center text-muted-foreground mt-20">
                  No logs captured yet.
                </div>
              ) : (
                logs.map((l, i) => (
                  <div
                    key={i}
                    className="flex gap-3 py-1 border-b border-border/40 last:border-0 hover:bg-muted/50"
                  >
                    <span className="text-muted-foreground shrink-0">
                      {new Date(l.timestamp).toLocaleTimeString()}
                    </span>
                    <span
                      className={`shrink-0 w-12 font-bold ${
                        l.level === 'ERROR'
                          ? 'text-red-500'
                          : l.level === 'WARN'
                            ? 'text-yellow-500'
                            : l.level === 'DEBUG'
                              ? 'text-blue-500'
                              : 'text-green-500'
                      }`}
                    >
                      {l.level}
                    </span>
                    <span className="text-foreground break-all">
                      {l.message}
                      {l.data && (
                        <span className="block text-muted-foreground mt-0.5">
                          {JSON.stringify(l.data)}
                        </span>
                      )}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab: About */}
      {activeTab === 'about' && (
        <div className="space-y-6">
          <div className="p-6 rounded-xl border border-border bg-card shadow-sm space-y-4">
            <h3 className="text-lg font-semibold border-b border-border pb-2">
              About LoginLens
            </h3>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Version</p>
                <p className="font-medium text-foreground font-mono">
                  {getExtensionVersion()}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Browser</p>
                <p className="font-medium text-foreground">
                  {getBrowserName()}
                </p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground border-t border-border pt-4">
              LoginLens keeps its records on this device. Nothing is sent
              anywhere unless you turn on encrypted cloud sync or the Google
              favicon lookup, both of which are off until you switch them on.
            </p>
          </div>

          <div className="p-6 rounded-xl border border-border bg-card shadow-sm space-y-1">
            <h3 className="text-lg font-semibold border-b border-border pb-2 mb-3">
              Help & Resources
            </h3>

            {[
              {
                href: DOCS_URL,
                icon: <BookOpen size={16} />,
                label: 'Documentation',
                hint: 'Setup, importing, browsers, and how the vault works'
              },
              {
                href: NEW_ISSUE_URL,
                icon: <Bug size={16} />,
                label: 'Report a problem',
                hint: 'Copy your System Logs from the Developer tab first'
              },
              {
                href: SECURITY_URL,
                icon: <Shield size={16} />,
                label: 'Security policy',
                hint: 'How to report a vulnerability privately'
              },
              {
                href: REPO_URL,
                icon: <Code size={16} />,
                label: 'Source code',
                hint: 'Every line of what runs in your browser'
              },
              {
                href: LICENSE_URL,
                icon: <Scale size={16} />,
                label: 'License',
                hint: 'Apache 2.0'
              }
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg hover:bg-muted transition-colors group"
              >
                <span className="text-muted-foreground">{item.icon}</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-medium text-foreground text-sm">
                    {item.label}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {item.hint}
                  </span>
                </span>
                <ExternalLink
                  size={14}
                  className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                />
              </a>
            ))}
          </div>
        </div>
      )}

      <CSVImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        savedAccounts={savedAccounts || []}
        setSavedAccounts={setSavedAccounts}
        onSuccess={(count) => {
          setIsImportModalOpen(false)
          showToast(`Successfully imported ${count} valid accounts!`, 'success')
        }}
      />

      <ExportWizardModal
        isOpen={isExportWizardOpen}
        onClose={() => setIsExportWizardOpen(false)}
        snapshots={snapshots}
        currentVault={savedAccounts || []}
      />
    </div>
  )
}
