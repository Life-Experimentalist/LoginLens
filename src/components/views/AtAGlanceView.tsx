import React, { useMemo } from 'react'
import { useStorage } from '@plasmohq/storage/hook'
import { extensionStorage } from '../../core/storage/config'
import { motion } from 'framer-motion'
import {
  Key,
  Globe,
  Shield,
  Activity,
  Database,
  Clock,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Zap,
  AlertTriangle,
  RefreshCw
} from 'lucide-react'
import type { DomainEntry } from '../../core/storage/schema'
import { analyzePasswordHashes, classifyReuseGroups } from '../../core/utils/password-inference'
import { useWeakFingerprints } from '../../core/hooks/useWeakFingerprints'
import { PendingCapturesSection } from './PendingCapturesSection'
import { FaviconImage } from '../ui/FaviconImage'
import iconStarrySkyUrl from 'url:~/assets/ui/icon-starry-sky.png'

const StatCard: React.FC<{
  icon: React.ReactNode
  label: string
  value: string | number
  color: string
  delay?: number
}> = ({ icon, label, value, color, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4, delay }}
    className={`p-6 rounded-xl border border-border bg-card flex flex-col gap-3 shadow-sm group hover:shadow-md transition-shadow`}
  >
    <div
      className={`p-3 ${color} w-fit rounded-lg transition-transform group-hover:scale-110`}
    >
      {icon}
    </div>
    <div>
      <p className="text-3xl font-bold tracking-tight">{value}</p>
      <p className="text-muted-foreground font-medium text-sm mt-0.5">
        {label}
      </p>
    </div>
  </motion.div>
)

const ReuseGroupItem: React.FC<{
  group: any
  onLink: (accounts: any[]) => void
}> = ({ group, onLink }) => {
  const [selected, setSelected] = React.useState<Set<string>>(
    new Set(group.accounts.map((a: any) => a.accountId))
  )

  const toggleSelect = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const selectAll = () =>
    setSelected(new Set(group.accounts.map((a: any) => a.accountId)))
  const deselectAll = () => setSelected(new Set())

  return (
    <div className="p-3 rounded-lg bg-background border border-border">
      <div className="flex items-center justify-between mb-3 border-b border-border pb-2">
        <div className="flex items-center gap-2">
          <RefreshCw size={12} className="text-red-400" />
          <span className="text-xs font-semibold text-red-400">
            {group.accounts.length} distinct usages of this password
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={
              selected.size === group.accounts.length ? deselectAll : selectAll
            }
            className="text-[10px] text-muted-foreground hover:text-foreground underline"
          >
            {selected.size === group.accounts.length
              ? 'Deselect All'
              : 'Select All'}
          </button>
          <button
            onClick={() =>
              onLink(
                group.accounts.filter((a: any) => selected.has(a.accountId))
              )
            }
            disabled={selected.size < 2}
            className="text-[10px] px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Link Selected ({selected.size})
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        {group.accounts.map((acc: any) => (
          <label
            key={acc.accountId}
            className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-md bg-muted/50 border border-border text-foreground cursor-pointer hover:bg-muted transition-colors"
          >
            <input
              type="checkbox"
              checked={selected.has(acc.accountId)}
              onChange={() => toggleSelect(acc.accountId)}
              className="rounded border-border accent-red-500 cursor-pointer"
            />
            <span>
              {acc.identity}{' '}
              <span className="text-muted-foreground">@ {acc.domain}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}

export const AtAGlanceView: React.FC = () => {
  const [savedAccountsRaw, setSavedAccounts] = useStorage<DomainEntry[]>(
    { key: 'saved_accounts', instance: extensionStorage },
    []
  )

  const [autoResolveLeftovers] = useStorage<boolean>(
    { key: 'auto_resolve_leftovers', instance: extensionStorage },
    true
  )

  const weakFingerprints = useWeakFingerprints()
  const [oauthRegistryRaw, setOauthRegistry] = useStorage<any[]>(
    { key: 'oauth_registry', instance: extensionStorage },
    []
  )

  // Normalize to arrays — storage may have corrupted values
  const savedAccounts = useMemo(
    () => (Array.isArray(savedAccountsRaw) ? savedAccountsRaw : []),
    [savedAccountsRaw]
  )
  const oauthRegistry = useMemo(
    () => (Array.isArray(oauthRegistryRaw) ? oauthRegistryRaw : []),
    [oauthRegistryRaw]
  )

  const handleLinkAccounts = (
    groupAccounts: Array<{
      domain: string
      identity: string
      accountId: string
    }>
  ) => {
    if (!savedAccounts) return
    const allDomains = Array.from(new Set(groupAccounts.map((a) => a.domain)))

    const updated = savedAccounts.map((entry) => {
      if (!allDomains.includes(entry.domain)) return entry
      return {
        ...entry,
        accounts: entry.accounts.map((acc) => {
          const inGroup = groupAccounts.some((ga) => ga.accountId === acc.id)
          if (!inGroup) return acc
          const currentLinked = new Set(acc.linked_domains || [])
          allDomains.forEach((d) => {
            if (d !== entry.domain) currentLinked.add(d)
          })
          return { ...acc, linked_domains: Array.from(currentLinked) }
        })
      }
    })
    setSavedAccounts(updated)
  }

  const stats = useMemo(() => {
    const domainsCount = savedAccounts?.length || 0
    let totalLogins = 0
    let oauthCount = 0
    let passwordCount = 0
    let apiKeyCount = 0
    let mfaCount = 0
    let pinnedCount = 0
    let sourcedCount = 0

    // Domain breakdown with method tallies
    const domainBreakdown: Array<{
      domain: string
      count: number
      oauthCount: number
      passCount: number
      apiCount: number
    }> = []

    savedAccounts?.forEach((d) => {
      let dOauth = 0,
        dPass = 0,
        dApi = 0
      d.accounts.forEach((acc) => {
        totalLogins++
        if (acc.login_method.type === 'oauth') {
          oauthCount++
          dOauth++
        } else if (acc.login_method.type === 'api-key') {
          apiKeyCount++
          dApi++
        } else {
          passwordCount++
          dPass++
        }
        if (acc.mfa && acc.mfa.type !== 'unknown') mfaCount++
        if (acc.pinned) pinnedCount++
        if (acc.vault_source) sourcedCount++
      })
      domainBreakdown.push({
        domain: d.domain,
        count: d.accounts.length,
        oauthCount: dOauth,
        passCount: dPass,
        apiCount: dApi
      })
    })

    domainBreakdown.sort((a, b) => b.count - a.count)

    const oauthPercent =
      totalLogins > 0 ? Math.round((oauthCount / totalLogins) * 100) : 0
    const mfaPercent =
      totalLogins > 0 ? Math.round((mfaCount / totalLogins) * 100) : 0

    // Recently added (last 7 days)
    const recentDomains =
      savedAccounts?.filter((d) =>
        d.accounts.some(
          (acc) =>
            acc.updated_at &&
            Date.now() - acc.updated_at < 7 * 24 * 60 * 60 * 1000
        )
      ) || []

    return {
      domainsCount,
      totalLogins,
      oauthCount,
      passwordCount,
      apiKeyCount,
      mfaCount,
      pinnedCount,
      sourcedCount,
      domainBreakdown,
      oauthPercent,
      mfaPercent,
      recentDomains
    }
  }, [savedAccounts])

  const oauthRegistryCount = oauthRegistry?.length || 0

  // Health score calculation
  const healthScore = Math.min(
    100,
    Math.round(
      stats.oauthPercent * 0.4 +
        stats.mfaPercent * 0.4 +
        (Math.min(stats.domainsCount, 10) / 10) * 20
    )
  )

  const getHealthColor = () => {
    if (healthScore >= 75) return 'text-green-500'
    if (healthScore >= 50) return 'text-amber-500'
    return 'text-red-500'
  }

  const getHealthLabel = () => {
    if (healthScore >= 75) return 'Strong'
    if (healthScore >= 50) return 'Moderate'
    return 'Needs Attention'
  }


  return (
    <div className="w-full pb-20 relative overflow-hidden">
      {/* ------------------------------------------------------------------ */}
      {/* Hero Banner — Icon Showcase + animated background                   */}
      {/* ------------------------------------------------------------------ */}
      <div className="relative overflow-hidden">
        {/* Hero content */}
        <div className="relative px-8 pt-10 pb-8 flex items-center gap-8">
          {/* Icon showcase — showing the full detailed icon */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8, rotate: -5 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className="relative shrink-0 hidden md:block"
          >
            {/* Glow ring */}
            <motion.div
              className="absolute inset-0 rounded-3xl bg-gradient-to-br from-indigo-500/40 to-violet-600/40 blur-xl"
              animate={{ opacity: [0.4, 0.7, 0.4], scale: [1, 1.1, 1] }}
              transition={{ duration: 4, repeat: Infinity }}
            />
            {/* Icon — use the detailed starry sky variant for more visual depth */}
            <motion.img
              src={iconStarrySkyUrl}
              alt="LoginLens"
              className="relative w-28 h-28 rounded-3xl shadow-2xl object-contain ring-1 ring-white/10"
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>

          {/* Heading */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <p className="text-xs font-bold uppercase tracking-widest text-primary/70 mb-1">
              Security Dashboard
            </p>
            <h1 className="text-4xl font-black tracking-tight mb-2">
              At a Glance
            </h1>
            <p className="text-muted-foreground text-sm max-w-md">
              Your full identity and login security posture — locally analyzed,
              never shared.
            </p>
          </motion.div>
        </div>

        {/* Subtle bottom border */}
        <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent mx-8" />
      </div>

      <div className="p-8 max-w-6xl mx-auto w-full">
        <PendingCapturesSection
          savedAccounts={savedAccounts}
          setSavedAccounts={setSavedAccounts}
          oauthRegistry={oauthRegistry}
          setOauthRegistry={setOauthRegistry}
        />

        {/* Main stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            icon={<Database size={22} />}
            label="Total Domains"
            value={stats.domainsCount}
            color="bg-primary/10 text-primary"
            delay={0}
          />
          <StatCard
            icon={<Key size={22} />}
            label="Total Credentials"
            value={stats.totalLogins}
            color="bg-indigo-500/10 text-indigo-500"
            delay={0.1}
          />
          <StatCard
            icon={<Globe size={22} />}
            label="OAuth Accounts"
            value={oauthRegistryCount}
            color="bg-purple-500/10 text-purple-500"
            delay={0.2}
          />
          <StatCard
            icon={<Shield size={22} />}
            label="MFA Secured"
            value={stats.mfaCount}
            color="bg-green-500/10 text-green-500"
            delay={0.3}
          />
        </div>

        {/* Health Score + Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Health Score */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.35 }}
            className="lg:col-span-1 rounded-xl border border-border bg-card p-6 flex flex-col items-center justify-center gap-4 shadow-sm"
          >
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Security Score
            </p>
            <div className="relative w-36 h-36">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="8"
                  className="text-muted/30"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${healthScore * 2.513} 251.3`}
                  className={getHealthColor()}
                  style={{ transition: 'stroke-dasharray 1s ease' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-4xl font-black ${getHealthColor()}`}>
                  {healthScore}
                </span>
                <span className="text-xs text-muted-foreground font-medium">
                  / 100
                </span>
              </div>
            </div>
            <div
              className={`flex items-center gap-2 font-bold text-lg ${getHealthColor()}`}
            >
              {healthScore >= 75 ? (
                <CheckCircle2 size={20} />
              ) : (
                <AlertCircle size={20} />
              )}
              {getHealthLabel()}
            </div>
            <div className="text-xs text-muted-foreground text-center leading-relaxed">
              Based on OAuth usage ({stats.oauthPercent}%), MFA coverage (
              {stats.mfaPercent}%), and vault size.
            </div>
          </motion.div>

          {/* Login Method Distribution */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="lg:col-span-2 rounded-xl border border-border bg-card p-6 shadow-sm"
          >
            <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <Activity size={16} /> Login Method Breakdown
            </h3>
            <div className="space-y-4">
              {[
                {
                  label: 'Password',
                  count: stats.passwordCount,
                  color: 'bg-primary',
                  textColor: 'text-primary'
                },
                {
                  label: 'OAuth / SSO',
                  count: stats.oauthCount,
                  color: 'bg-indigo-500',
                  textColor: 'text-indigo-500'
                },
                {
                  label: 'API Keys',
                  count: stats.apiKeyCount,
                  color: 'bg-amber-500',
                  textColor: 'text-amber-500'
                }
              ].map((item) => {
                const pct =
                  stats.totalLogins > 0
                    ? Math.round((item.count / stats.totalLogins) * 100)
                    : 0
                return (
                  <div key={item.label} className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-foreground">
                        {item.label}
                      </span>
                      <span className={`font-bold ${item.textColor}`}>
                        {item.count}{' '}
                        <span className="text-muted-foreground font-normal">
                          ({pct}%)
                        </span>
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.8, delay: 0.5 }}
                        className={`h-full rounded-full ${item.color}`}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-6 pt-4 border-t border-border grid grid-cols-2 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground">
                  {stats.pinnedCount}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Pinned Entries
                </p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground">
                  {stats.sourcedCount}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Imported (with Source)
                </p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Recent Activity + Top Domains */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recently Added */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="rounded-xl border border-border bg-card p-6 shadow-sm"
          >
            <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <Clock size={16} /> Recently Active (Last 7 Days)
            </h3>
            {stats.recentDomains.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">
                No recent activity. Start logging in to sites!
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {stats.recentDomains.slice(0, 8).map((d) => (
                  <div
                    key={d.domain}
                    className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <FaviconImage domain={d.domain} size={20} />
                    <span className="text-sm font-medium text-foreground flex-1">
                      {d.domain}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {d.accounts.length} login
                      {d.accounts.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>

          {/* Top Domains */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55 }}
            className="rounded-xl border border-border bg-card p-6 shadow-sm"
          >
            <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <TrendingUp size={16} /> Top Domains by Accounts
            </h3>
            {stats.domainBreakdown.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">
                No data yet. Import a CSV or log in somewhere!
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {stats.domainBreakdown.slice(0, 8).map((d, i) => (
                  <div
                    key={d.domain}
                    className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-xs font-bold text-muted-foreground w-5 text-right">
                      {i + 1}.
                    </span>
                    <FaviconImage domain={d.domain} size={20} />
                    <span className="text-sm font-medium text-foreground flex-1 truncate">
                      {d.domain}
                    </span>
                    <div className="flex gap-1 items-center">
                      {d.passCount > 0 && (
                        <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-semibold">
                          {d.passCount}pw
                        </span>
                      )}
                      {d.oauthCount > 0 && (
                        <span className="text-[10px] bg-indigo-500/10 text-indigo-500 px-1.5 py-0.5 rounded font-semibold">
                          {d.oauthCount}oa
                        </span>
                      )}
                      {d.apiCount > 0 && (
                        <span className="text-[10px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded font-semibold">
                          {d.apiCount}key
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>

        {/* Password Reuse Warnings — shown only if hashes exist */}
        {stats.totalLogins > 0 &&
          (() => {
            const reuseResult = analyzePasswordHashes(
              savedAccounts ?? [],
              weakFingerprints
            )
            const activeGroups = classifyReuseGroups(reuseResult.reuseGroups, autoResolveLeftovers).activeGroups
            
            if (activeGroups.length === 0) return null
            return (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.65 }}
                className="mt-6 rounded-xl border border-red-500/30 bg-red-500/5 p-6 shadow-sm"
              >
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <h3 className="font-semibold text-red-500 flex items-center gap-2 text-base">
                    <AlertTriangle size={18} /> Password Reuse Detected (
                    {activeGroups.length}{' '}
                    {activeGroups.length === 1 ? 'group' : 'groups'})
                  </h3>
                  <button
                    onClick={() => {
                      window.location.hash = '#security-review'
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white font-bold text-xs rounded-lg hover:bg-red-600 transition-colors shadow-sm"
                  >
                    Review & Link Mirror Domains (
                    {activeGroups.length})
                  </button>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Accounts sharing the same password across domains. Click
                  "Review & Link Mirror Domains" to mark mirrors or resolve
                  security threats.
                </p>
                <div className="space-y-3">
                  {activeGroups.slice(0, 3).map((group, i) => (
                    <ReuseGroupItem
                      key={i}
                      group={group}
                      onLink={handleLinkAccounts}
                    />
                  ))}
                </div>
                {activeGroups.length > 3 && (
                  <div className="mt-4 pt-3 border-t border-red-500/20 text-center">
                    <button
                      onClick={() => {
                        window.location.hash = '#security-review'
                      }}
                      className="text-xs font-semibold text-red-500 hover:text-red-600 underline"
                    >
                      + {activeGroups.length - 3} more password reuse
                    groups... Review All
                    </button>
                  </div>
                )}
              </motion.div>
            )
          })()}

        {/* Security Tips */}
        {stats.totalLogins > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="mt-6 rounded-xl border border-border bg-card p-6 shadow-sm"
          >
            <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <Zap size={16} /> Security Tips
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {stats.oauthPercent < 50 && (
                <div className="p-3 rounded-lg bg-indigo-500/5 border border-indigo-500/20 text-sm">
                  <p className="font-semibold text-indigo-400 mb-1">
                    Use More OAuth
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Only {stats.oauthPercent}% of your logins use OAuth.
                    Consider signing in with Google/GitHub where available.
                  </p>
                </div>
              )}
              {stats.mfaPercent < 50 && (
                <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-sm">
                  <p className="font-semibold text-amber-400 mb-1">
                    Enable MFA
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Only {stats.mfaPercent}% of your accounts have MFA recorded.
                    Protect critical accounts with 2FA.
                  </p>
                </div>
              )}
              {stats.oauthPercent >= 50 && stats.mfaPercent >= 50 && (
                <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/20 text-sm">
                  <p className="font-semibold text-green-400 mb-1">
                    Great Security Posture!
                  </p>
                  <p className="text-muted-foreground text-xs">
                    You're using OAuth and MFA extensively. Keep it up!
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
