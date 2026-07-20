import React, { useEffect, useState } from 'react'
import { useStorage } from '@plasmohq/storage/hook'
import { extensionStorage } from './core/storage/config'
import { ThemeProvider } from 'next-themes'
import {
  Search,
  ExternalLink,
  Shield,
  Copy,
  Check,
  ArrowRight,
  Video,
  StopCircle
} from 'lucide-react'
import iconUrl from 'url:~/assets/icon.png'
import type { DomainEntry, PendingOAuthCapture } from './core/storage/schema'
import { matchesDomain, getRootDomain } from './core/utils/domain'
import { safeSendMessage } from './core/utils/runtime'
import './style.css'

interface TabContext {
  effectiveDomain: string | null
  isOnOAuthPage: boolean
  currentDomain: string | null
  originDomain: string | null
}

function PopupContent() {
  const [savedAccounts] = useStorage<DomainEntry[]>(
    { key: 'saved_accounts', instance: extensionStorage },
    []
  )
  const [tabContext, setTabContext] = useState<TabContext | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useStorage<boolean>({ key: "is_recording_oauth", instance: extensionStorage }, false)
  const [alwaysRecordOauth] = useStorage<boolean>({ key: "always_record_oauth", instance: extensionStorage }, false)
  const [pendingCaptures] = useStorage<PendingOAuthCapture[]>({ key: "pending_oauth_captures", instance: extensionStorage }, [])

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.tabs) return

    // Ask background service worker for the authoritative tab context.
    // Background has the full navigation history and knows the OAuth referrer chain.
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0]
      if (!tab?.id) return

      safeSendMessage(
        { type: 'GET_TAB_CONTEXT', tabId: tab.id },
        (response: TabContext | null) => {
          if (response) {
            setTabContext(response)
          } else {
            // Background unavailable — fall back to parsing the current tab URL directly
            if (tab.url) {
              try {
                const hostname = new URL(tab.url).hostname.replace(/^www\./, '')
                setTabContext({
                  effectiveDomain: hostname,
                  isOnOAuthPage: false,
                  currentDomain: hostname,
                  originDomain: hostname
                })
              } catch {
                /* ignore */
              }
            }
          }
        }
      )
    })
  }, [])

  const effectiveDomain = tabContext?.effectiveDomain ?? null
  const isOnOAuthPage = tabContext?.isOnOAuthPage ?? false
  const currentDomain = tabContext?.currentDomain ?? null
  const originDomain = tabContext?.originDomain ?? null

  const filteredDomains = savedAccounts?.filter((item) => {
    if (!item.domain) return false
    const query = searchQuery.toLowerCase().trim()
    if (query) {
      return (
        item.domain.toLowerCase().includes(query) ||
        item.accounts.some((acc) =>
          acc.identities.some((id) => id.toLowerCase().includes(query))
        )
      )
    }
    if (effectiveDomain) {
      return matchesDomain(item.domain, effectiveDomain)
    }
    return true
  })

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  const openVault = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.create({ url: './tabs/vault.html' })
    }
  }

  const siteDomains =
    !searchQuery && effectiveDomain
      ? (savedAccounts ?? []).filter(
          (item) => item.domain && matchesDomain(item.domain, effectiveDomain)
        )
      : []

  const searchDomains = searchQuery
    ? (savedAccounts ?? []).filter((item) => {
        if (!item.domain) return false
        const q = searchQuery.toLowerCase()
        return (
          item.domain.toLowerCase().includes(q) ||
          item.accounts.some((acc) =>
            acc.identities.some((id) => id.toLowerCase().includes(q))
          )
        )
      })
    : []

  const otherDomains = !searchQuery
    ? (savedAccounts ?? []).filter(
        (item) =>
          item.domain && !matchesDomain(item.domain, effectiveDomain ?? '')
      )
    : []

  const DomainCard = ({
    domainMap
  }: {
    domainMap: (typeof savedAccounts)[0]
  }) => (
    <div
      key={domainMap.domain}
      className="p-2.5 rounded-lg border border-border bg-card shadow-sm space-y-2"
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold text-xs text-foreground truncate max-w-[180px]">
          {domainMap.domain}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
          {domainMap.accounts.length}
        </span>
      </div>
      {domainMap.accounts.map((acc) => (
        <div
          key={acc.id}
          className="flex items-center justify-between p-2 rounded bg-muted/30 text-xs border border-border/50"
        >
          <div className="flex flex-col gap-1 overflow-hidden pr-2">
            <span className="truncate font-semibold text-foreground">
              {acc.identities[0]}
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {acc.login_method.type === 'oauth' ? (
                <span className="text-[9px] px-1.5 py-0.5 rounded-sm bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-medium border border-indigo-500/20 whitespace-nowrap">
                  via {acc.login_method.provider || 'OAuth'}
                </span>
              ) : (
                <span className="text-[9px] px-1.5 py-0.5 rounded-sm bg-primary/10 text-primary font-medium border border-primary/20 whitespace-nowrap">
                  Password
                </span>
              )}
              {acc.vault_source && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-sm bg-muted text-muted-foreground font-medium border border-border whitespace-nowrap truncate max-w-[100px]" title={acc.vault_source}>
                  {acc.vault_source}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => handleCopy(acc.identities[0], acc.id)}
            className="p-1.5 shrink-0 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-colors self-start mt-0.5"
            title="Copy identity"
          >
            {copiedId === acc.id ? (
              <Check size={14} className="text-green-500" />
            ) : (
              <Copy size={14} />
            )}
          </button>
        </div>
      ))}
    </div>
  )

  return (
    <div className="w-80 p-4 bg-background text-foreground font-sans min-h-[380px] flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
          <div className="flex items-center gap-2.5">
            <img
              src={iconUrl}
              alt="LoginLens"
              className="w-6 h-6 object-contain rounded"
            />
            <span className="font-bold text-base tracking-tight">
              LoginLens
            </span>
          </div>
        </div>

        {/* Pending Alerts */}
        {pendingCaptures && pendingCaptures.length > 0 && (
          <div className="mb-3 p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-xs flex items-start gap-2 cursor-pointer hover:bg-indigo-500/20 transition-colors" onClick={openVault}>
            <Shield size={14} className="text-indigo-500 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <span className="font-semibold text-indigo-600 dark:text-indigo-400 block mb-0.5">
                {pendingCaptures.length} Pending Capture{pendingCaptures.length !== 1 ? 's' : ''}
              </span>
              <span className="text-muted-foreground text-[10px]">
                Click to review in vault
              </span>
            </div>
            <ArrowRight size={12} className="text-indigo-500/50 mt-1" />
          </div>
        )}

        {/* OAuth Context Banner */}
        {isOnOAuthPage && originDomain && currentDomain && (
          <div className="mb-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs flex items-center gap-2">
            <ArrowRight size={13} className="text-amber-500 shrink-0" />
            <div className="min-w-0">
              <span className="text-muted-foreground">Logging into </span>
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                {originDomain}
              </span>
              <span className="text-muted-foreground"> via </span>
              <span className="font-semibold text-foreground">
                {getRootDomain(currentDomain)}
              </span>
            </div>
          </div>
        )}

        {/* Search Bar */}
        <div className="relative mb-3">
          <Search
            size={14}
            className="absolute left-3 top-2.5 text-muted-foreground"
          />
          <input
            type="text"
            placeholder="Search saved logins..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-muted/50 border border-border rounded-lg focus:outline-none focus:border-primary text-foreground placeholder:text-muted-foreground transition-colors"
          />
        </div>

        {/* Scrollable Accounts Area */}
        <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
          {/* Search results mode */}
          {searchQuery &&
            (searchDomains.length > 0 ? (
              searchDomains.map((d) => (
                <DomainCard key={d.domain} domainMap={d} />
              ))
            ) : (
              <div className="text-center py-6 text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                <Shield
                  size={20}
                  className="mx-auto mb-2 text-muted-foreground/40"
                />
                No results for "{searchQuery}"
              </div>
            ))}

          {/* Normal mode: site-specific first, then others */}
          {!searchQuery && (
            <>
              {/* Current site logins */}
              {effectiveDomain && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5 mb-1.5">
                    {isOnOAuthPage
                      ? `Logins for ${originDomain}`
                      : `This site · ${effectiveDomain}`}
                  </p>
                  {siteDomains.length > 0 ? (
                    siteDomains.map((d) => (
                      <DomainCard key={d.domain} domainMap={d} />
                    ))
                  ) : (
                    <div className="text-xs text-muted-foreground border border-dashed border-border rounded-lg p-3 text-center mb-1">
                      No saved logins for{' '}
                      <span className="font-semibold">{effectiveDomain}</span>
                    </div>
                  )}
                </div>
              )}

              {/* All other vault logins */}
              {otherDomains.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5 mb-1.5 mt-2">
                    Other Saved Logins
                  </p>
                  {otherDomains.map((d) => (
                    <DomainCard key={d.domain} domainMap={d} />
                  ))}
                </div>
              )}

              {/* Completely empty vault */}
              {!effectiveDomain &&
                otherDomains.length === 0 &&
                siteDomains.length === 0 && (
                  <div className="text-center py-8 text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                    <Shield
                      size={24}
                      className="mx-auto mb-2 text-muted-foreground/40"
                    />
                    Vault is empty. Import a CSV in Settings.
                  </div>
                )}
            </>
          )}
        </div>
      </div>

      {/* Footer CTA */}
      <div className="pt-3 border-t border-border mt-3 space-y-2">
        {!alwaysRecordOauth && (
          <button
            onClick={() => setIsRecording(!isRecording)}
            className={`w-full py-2 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm ${
              isRecording 
                ? 'bg-red-500 hover:bg-red-600 text-white' 
                : 'bg-indigo-500 hover:bg-indigo-600 text-white'
            }`}
          >
            {isRecording ? <StopCircle size={14} /> : <Video size={14} />}
            {isRecording ? 'Stop Recording OAuth' : 'Record OAuth Login'}
          </button>
        )}
        <button
          onClick={openVault}
          className="w-full py-2 bg-muted text-foreground hover:bg-muted/80 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm"
        >
          Open Vault Dashboard
        </button>
      </div>
    </div>
  )
}

export default function Popup() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <PopupContent />
    </ThemeProvider>
  )
}
