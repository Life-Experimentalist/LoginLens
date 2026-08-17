import React, { useMemo, useState } from 'react'
import { useStorage } from '@plasmohq/storage/hook'
import { extensionStorage } from '../../core/storage/config'
import { motion } from 'framer-motion'
import {
  Activity,
  ShieldCheck,
  Key,
  Globe,
  BarChart3,
  Filter,
  TrendingUp,
  Calendar
} from 'lucide-react'
import type { DomainEntry } from '../../core/storage/schema'
import { FaviconImage } from '../ui/FaviconImage'

export const StatsView: React.FC = () => {
  const [savedAccountsRaw] = useStorage<DomainEntry[]>(
    { key: 'saved_accounts', instance: extensionStorage },
    []
  )
  const [oauthRegistryRaw] = useStorage<any[]>(
    { key: 'oauth_registry', instance: extensionStorage },
    []
  )
  const [sortBy, setSortBy] = useState<'count' | 'az' | 'za' | 'type'>('count')

  // Normalize to arrays — storage may have corrupted values (strings, objects)
  const savedAccounts = useMemo(
    () => (Array.isArray(savedAccountsRaw) ? savedAccountsRaw : []),
    [savedAccountsRaw]
  )
  const oauthRegistry = useMemo(
    () => (Array.isArray(oauthRegistryRaw) ? oauthRegistryRaw : []),
    [oauthRegistryRaw]
  )

  const stats = useMemo(() => {
    const domainsCount = savedAccounts?.length || 0
    let totalLogins = 0
    let oauthCount = 0
    let passwordCount = 0
    let apiKeyCount = 0
    let passkeyCount = 0
    let missingMfaTotal = 0
    const passwordHashes = new Map<string, number>()
    const mfaByType: Record<string, number> = {
      totp_app: 0,
      hardware_key: 0,
      sms: 0,
      prompt: 0,
      unknown: 0
    }

    // Source breakdown
    const sources: Record<string, number> = {}

    // Per-domain data
    const domainData: Array<{
      domain: string
      total: number
      oauth: number
      password: number
      apiKey: number
      hasMfa: number
      lastUpdated: number
      sources: string[]
    }> = []

    savedAccounts?.forEach((d) => {
      let dOauth = 0,
        dPass = 0,
        dApi = 0,
        dMfa = 0
      let lastUpd = 0
      const dSources: string[] = []

      d.accounts.forEach((acc) => {
        totalLogins++
        const type = acc.login_method.type
        if (type === 'oauth') {
          oauthCount++
          dOauth++
        } else if (type === 'api-key') {
          apiKeyCount++
          dApi++
        } else if (type === 'passkey') {
          passkeyCount++
        } else {
          passwordCount++
          dPass++
        }

        if (acc.mfa && acc.mfa.type !== 'unknown') {
          mfaByType[acc.mfa.type] = (mfaByType[acc.mfa.type] || 0) + 1
          dMfa++
        } else if (type !== 'oauth') {
          missingMfaTotal++
        }
        if (acc.password_hash) {
          passwordHashes.set(
            acc.password_hash,
            (passwordHashes.get(acc.password_hash) || 0) + 1
          )
        }
        if (acc.vault_source) {
          sources[acc.vault_source] = (sources[acc.vault_source] || 0) + 1
          if (!dSources.includes(acc.vault_source))
            dSources.push(acc.vault_source)
        }
        if (acc.updated_at && acc.updated_at > lastUpd) lastUpd = acc.updated_at
      })

      domainData.push({
        domain: d.domain,
        total: d.accounts.length,
        oauth: dOauth,
        password: dPass,
        apiKey: dApi,
        hasMfa: dMfa,
        lastUpdated: lastUpd,
        sources: dSources
      })
    })

    let reusedPasswordsCount = 0
    passwordHashes.forEach((count) => {
      if (count > 1) reusedPasswordsCount += count
    })

    return {
      domainsCount,
      totalLogins,
      oauthCount,
      passwordCount,
      apiKeyCount,
      passkeyCount,
      mfaByType,
      sources,
      domainData,
      oauthPct:
        totalLogins > 0 ? Math.round((oauthCount / totalLogins) * 100) : 0,
      passPct:
        totalLogins > 0 ? Math.round((passwordCount / totalLogins) * 100) : 0,
      apiPct:
        totalLogins > 0 ? Math.round((apiKeyCount / totalLogins) * 100) : 0,
      mfaTotal: Object.entries(mfaByType)
        .filter(([k]) => k !== 'unknown')
        .reduce((s, [, v]) => s + v, 0),
      missingMfaTotal,
      reusedPasswordsCount
    }
  }, [savedAccounts])

  const sortedDomains = useMemo(() => {
    const d = [...stats.domainData]
    if (sortBy === 'count') return d.sort((a, b) => b.total - a.total)
    if (sortBy === 'az')
      return d.sort((a, b) => a.domain.localeCompare(b.domain))
    if (sortBy === 'za')
      return d.sort((a, b) => b.domain.localeCompare(a.domain))
    if (sortBy === 'type') return d.sort((a, b) => b.oauth - a.oauth)
    return d
  }, [stats.domainData, sortBy])

  const mfaEntries = Object.entries(stats.mfaByType).filter(
    ([k, v]) => k !== 'unknown' && v > 0
  )
  const sourceEntries = Object.entries(stats.sources).sort(
    ([, a], [, b]) => b - a
  )

  return (
    <div className="p-8 max-w-6xl mx-auto w-full pb-20">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-bold tracking-tight mb-1">Statistics</h1>
        <p className="text-muted-foreground">
          Detailed analytics and breakdown of your vault data.
        </p>
      </motion.div>

      {/* Top-level stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {[
          {
            icon: <Key size={22} />,
            label: 'Total Credentials',
            value: stats.totalLogins,
            color: 'bg-primary/10 text-primary'
          },
          {
            icon: <Globe size={22} />,
            label: 'Active Domains',
            value: stats.domainsCount,
            color: 'bg-indigo-500/10 text-indigo-500'
          },
          {
            icon: <ShieldCheck size={22} />,
            label: 'OAuth/SSO',
            value: `${stats.oauthPct}%`,
            color: 'bg-green-500/10 text-green-500'
          },
          {
            icon: <Activity size={22} />,
            label: 'MFA-Secured',
            value: stats.mfaTotal,
            color: 'bg-amber-500/10 text-amber-500'
          },
          {
            icon: <Activity size={22} />,
            label: 'Missing MFA',
            value: stats.missingMfaTotal,
            color: 'bg-red-500/10 text-red-500'
          },
          {
            icon: <Key size={22} />,
            label: 'Reused Passwords',
            value: stats.reusedPasswordsCount,
            color: 'bg-red-500/10 text-red-500'
          }
        ].map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="p-6 rounded-xl border border-border bg-card flex flex-col gap-3 shadow-sm group hover:shadow-md transition-shadow"
          >
            <div
              className={`p-3 ${card.color} w-fit rounded-lg group-hover:scale-110 transition-transform`}
            >
              {card.icon}
            </div>
            <div>
              <p className="text-3xl font-bold">{card.value}</p>
              <p className="text-muted-foreground font-medium text-sm mt-0.5">
                {card.label}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Method + MFA + Sources */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Login Methods */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="rounded-xl border border-border bg-card p-6 shadow-sm"
        >
          <h3 className="font-semibold mb-4 flex items-center gap-2 text-foreground">
            <BarChart3 size={16} /> Login Methods
          </h3>
          <div className="space-y-3">
            {[
              {
                label: 'Password',
                count: stats.passwordCount,
                pct: stats.passPct,
                color: 'bg-primary'
              },
              {
                label: 'OAuth / SSO',
                count: stats.oauthCount,
                pct: stats.oauthPct,
                color: 'bg-indigo-500'
              },
              {
                label: 'API Key',
                count: stats.apiKeyCount,
                pct: stats.apiPct,
                color: 'bg-amber-500'
              },
              {
                label: 'Passkey',
                count: stats.passkeyCount,
                pct:
                  stats.totalLogins > 0
                    ? Math.round((stats.passkeyCount / stats.totalLogins) * 100)
                    : 0,
                color: 'bg-purple-500'
              }
            ].map((item) => (
              <div key={item.label}>
                <div className="flex justify-between text-xs mb-1 font-medium">
                  <span className="text-foreground">{item.label}</span>
                  <span className="text-muted-foreground">
                    {item.count} ({item.pct}%)
                  </span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${item.pct}%` }}
                    transition={{ duration: 0.8, delay: 0.6 }}
                    className={`h-full rounded-full ${item.color}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* MFA Breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="rounded-xl border border-border bg-card p-6 shadow-sm"
        >
          <h3 className="font-semibold mb-4 flex items-center gap-2 text-foreground">
            <ShieldCheck size={16} /> MFA Methods
          </h3>
          {mfaEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No MFA data recorded yet. Edit entries to add MFA info.
            </p>
          ) : (
            <div className="space-y-3">
              {mfaEntries.map(([type, count]) => {
                const labels: Record<string, string> = {
                  totp_app: 'Authenticator App',
                  hardware_key: 'Hardware Key (YubiKey)',
                  sms: 'SMS / Email OTP',
                  prompt: 'Device Prompt'
                }
                const colors: Record<string, string> = {
                  totp_app: 'bg-green-500',
                  hardware_key: 'bg-amber-500',
                  sms: 'bg-blue-500',
                  prompt: 'bg-purple-500'
                }
                const pct =
                  stats.mfaTotal > 0
                    ? Math.round((count / stats.mfaTotal) * 100)
                    : 0
                return (
                  <div key={type}>
                    <div className="flex justify-between text-xs mb-1 font-medium">
                      <span className="text-foreground">
                        {labels[type] || type}
                      </span>
                      <span className="text-muted-foreground">
                        {count} ({pct}%)
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.8, delay: 0.7 }}
                        className={`h-full rounded-full ${colors[type] || 'bg-primary'}`}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </motion.div>

        {/* Import Sources */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="rounded-xl border border-border bg-card p-6 shadow-sm"
        >
          <h3 className="font-semibold mb-4 flex items-center gap-2 text-foreground">
            <TrendingUp size={16} /> Import Sources
          </h3>
          {sourceEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No imported entries. Import a CSV from Settings.
            </p>
          ) : (
            (() => {
              const totalImported = sourceEntries.reduce((s, [, v]) => s + v, 0)
              const sourceColors = [
                { bar: 'bg-primary', text: 'text-primary' },
                { bar: 'bg-indigo-500', text: 'text-indigo-500' },
                { bar: 'bg-emerald-500', text: 'text-emerald-500' },
                { bar: 'bg-amber-500', text: 'text-amber-500' },
                { bar: 'bg-purple-500', text: 'text-purple-500' },
                { bar: 'bg-cyan-500', text: 'text-cyan-500' }
              ]
              return (
                <div className="space-y-3">
                  {sourceEntries.map(([source, count], i) => {
                    const pct =
                      totalImported > 0
                        ? Math.round((count / totalImported) * 100)
                        : 0
                    const color = sourceColors[i % sourceColors.length]
                    return (
                      <div key={source}>
                        <div className="flex justify-between text-xs mb-1 font-medium">
                          <span
                            className="text-foreground truncate max-w-[140px]"
                            title={source}
                          >
                            {source}
                          </span>
                          <span className={`${color.text} font-semibold`}>
                            {count}{' '}
                            <span className="text-muted-foreground font-normal">
                              ({pct}%)
                            </span>
                          </span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{
                              duration: 0.8,
                              delay: 0.7 + i * 0.05
                            }}
                            className={`h-full rounded-full ${color.bar}`}
                          />
                        </div>
                      </div>
                    )
                  })}
                  <div className="pt-2 border-t border-border mt-2 flex justify-between text-xs text-muted-foreground">
                    <span>Total imported credentials</span>
                    <span className="font-semibold text-foreground">
                      {totalImported}
                    </span>
                  </div>
                </div>
              )
            })()
          )}
        </motion.div>
      </div>

      {/* OAuth Registry Summary */}
      {oauthRegistry && oauthRegistry.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="rounded-xl border border-border bg-card p-6 shadow-sm mb-6"
        >
          <h3 className="font-semibold mb-4 flex items-center gap-2 text-foreground">
            <Globe size={16} /> OAuth Identity Registry ({oauthRegistry.length}{' '}
            accounts)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {oauthRegistry.map((acc) => (
              <div
                key={acc.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border/50"
              >
                <FaviconImage domain={acc.provider} size={20} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {acc.identity}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {acc.provider}
                  </p>
                </div>
                {acc.is_manual && (
                  <span className="text-[10px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded font-semibold ml-auto shrink-0">
                    Manual
                  </span>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Domain Summary Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="rounded-xl border border-border bg-card shadow-sm overflow-hidden"
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold flex items-center gap-2 text-foreground">
            <Filter size={16} /> All Domains ({stats.domainsCount})
          </h3>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="text-xs px-2 py-1.5 bg-muted border border-border rounded-md focus:outline-none focus:border-primary text-foreground"
          >
            <option value="count">Sort by # Accounts</option>
            <option value="az">Sort A → Z</option>
            <option value="za">Sort Z → A</option>
            <option value="type">Sort by OAuth</option>
          </select>
        </div>

        {stats.domainsCount === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No domains yet. Import a CSV or record an OAuth login.
          </div>
        ) : (
          <div className="divide-y divide-border max-h-96 overflow-y-auto">
            {sortedDomains.map((d) => (
              <div
                key={d.domain}
                className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors"
              >
                <FaviconImage domain={d.domain} size={20} />
                <span className="text-sm font-medium text-foreground flex-1 truncate">
                  {d.domain}
                </span>
                <div className="flex gap-1 items-center">
                  {d.password > 0 && (
                    <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-semibold">
                      {d.password}pw
                    </span>
                  )}
                  {d.oauth > 0 && (
                    <span className="text-[10px] bg-indigo-500/10 text-indigo-500 px-1.5 py-0.5 rounded font-semibold">
                      {d.oauth}oa
                    </span>
                  )}
                  {d.apiKey > 0 && (
                    <span className="text-[10px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded font-semibold">
                      {d.apiKey}key
                    </span>
                  )}
                </div>
                {d.hasMfa > 0 && (
                  <span className="text-[10px] bg-green-500/10 text-green-500 px-1.5 py-0.5 rounded font-semibold">
                    {d.hasMfa} MFA
                  </span>
                )}
                {d.lastUpdated > 0 && (
                  <span className="text-[10px] text-muted-foreground hidden md:block">
                    <Calendar size={10} className="inline mr-0.5" />
                    {new Date(d.lastUpdated).toLocaleDateString()}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  )
}
