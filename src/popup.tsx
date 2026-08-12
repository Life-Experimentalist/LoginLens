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
  StopCircle,
  Layout,
  Lock,
  Smartphone,
  Globe
} from 'lucide-react'
import iconUrl from 'url:~/assets/icon.png'
import type { DomainEntry, PendingOAuthCapture } from './core/storage/schema'
import {
  matchesDomain,
  getRootDomain,
  isAppPackageDomain,
  syncBidirectionalDomainLinks
} from './core/utils/domain'
import { safeSendMessage } from './core/utils/runtime'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import '~/style.css'

interface TabContext {
  effectiveDomain: string | null
  isOnOAuthPage: boolean
  currentDomain: string | null
  originDomain: string | null
}

type SpecialPageType =
  | 'vault' // LoginLens vault is open
  | 'extension' // Some other extension page
  | 'new-tab' // Chrome new tab
  | 'chrome-internal' // chrome:// or edge:// pages
  | 'none' // Normal web page

function detectSpecialPage(url: string | undefined): SpecialPageType {
  if (!url) return 'none'
  if (
    url.startsWith('chrome-extension://') ||
    url.startsWith('moz-extension://') ||
    url.startsWith('edge-extension://')
  ) {
    // Our own vault, matched on the host rather than a substring: another
    // extension's page can carry our id in a query string.
    try {
      if (
        typeof chrome !== 'undefined' &&
        chrome.runtime?.id &&
        new URL(url).hostname === chrome.runtime.id
      ) {
        return 'vault'
      }
    } catch {
      // Unparseable extension URL — treat it as somebody else's page.
    }
    return 'extension'
  }
  // Before the generic chrome:// branch below, which would otherwise swallow
  // every new-tab URL and leave the friendlier new-tab copy unreachable.
  if (
    url === 'chrome://newtab/' ||
    url === 'about:newtab' ||
    url === 'edge://newtab/' ||
    url.startsWith('chrome://new-tab-page')
  ) {
    return 'new-tab'
  }
  if (
    url.startsWith('chrome://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:')
  ) {
    return 'chrome-internal'
  }
  return 'none'
}

function PopupContent() {
  const [savedAccounts, setSavedAccounts] = useStorage<DomainEntry[]>(
    { key: 'saved_accounts', instance: extensionStorage },
    []
  )
  const [tabContext, setTabContext] = useState<TabContext | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useStorage<boolean>(
    { key: 'is_recording_oauth', instance: extensionStorage },
    false
  )
  const [alwaysRecordOauth] = useStorage<boolean>(
    { key: 'always_record_oauth', instance: extensionStorage },
    false
  )
  const [pendingCaptures] = useStorage<PendingOAuthCapture[]>(
    { key: 'pending_oauth_captures', instance: extensionStorage },
    []
  )
  const [specialPage, setSpecialPage] = useState<SpecialPageType>('none')

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.tabs) return

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0]
      if (!activeTab?.url) return

      const isSpecial = detectSpecialPage(activeTab.url)
      setSpecialPage(isSpecial)

      if (isSpecial !== 'none') return

      try {
        const urlObj = new URL(activeTab.url)
        const host = urlObj.hostname.replace(/^www\./, '').toLowerCase()

        safeSendMessage(
          { type: 'GET_TAB_OAUTH_CONTEXT', tabId: activeTab.id },
          (res: any) => {
            const currentDom = res?.currentDomain
              ? res.currentDomain.replace(/^www\./, '').toLowerCase()
              : null
            const origDom = res?.originDomain
              ? res.originDomain.replace(/^www\./, '').toLowerCase()
              : null
            const effDom = res?.effectiveDomain
              ? res.effectiveDomain.replace(/^www\./, '').toLowerCase()
              : host

            setTabContext({
              effectiveDomain: effDom,
              isOnOAuthPage: !!res?.isOnOAuthPage,
              currentDomain: currentDom,
              originDomain: origDom
            })
          }
        )
      } catch {
        setTabContext({
          effectiveDomain: null,
          isOnOAuthPage: false,
          currentDomain: null,
          originDomain: null
        })
      }
    })
  }, [])

  const effectiveDomain = tabContext?.effectiveDomain ?? null
  const isOnOAuthPage = tabContext?.isOnOAuthPage ?? false
  const currentDomain = tabContext?.currentDomain ?? null
  const originDomain = tabContext?.originDomain ?? null

  // Detect app-package domains in the active site
  const isAppDomain = effectiveDomain
    ? isAppPackageDomain(effectiveDomain)
    : false

  const handleCopy = async (text: string, id: string) => {
    // Clipboard writes reject when the popup has lost focus, which happens
    // easily here. Flipping the label to "Copied" before knowing that tells
    // the user their identity is on the clipboard when it is not.
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      return
    }
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  const openVault = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.create({ url: './tabs/vault.html' })
    }
  }

  const handleLinkMirrorDomain = (targetDomain: string, newMirrorDomain: string) => {
    if (!savedAccounts) return
    const updated = savedAccounts.map((d) => {
      if (d.domain !== targetDomain) return d
      return {
        ...d,
        accounts: d.accounts.map((acc) => {
          const current = new Set(acc.linked_domains || [])
          current.add(newMirrorDomain)
          return { ...acc, linked_domains: Array.from(current) }
        })
      }
    })
    setSavedAccounts(syncBidirectionalDomainLinks(updated))
  }

  const siteDomains =
    !searchQuery && effectiveDomain
      ? (savedAccounts ?? []).filter(
          (item) =>
            item.domain && matchesDomain(item.domain, effectiveDomain, true)
        )
      : []

  const rootDomain = effectiveDomain ? getRootDomain(effectiveDomain) : null

  const relatedDomains = !searchQuery && effectiveDomain
    ? (savedAccounts ?? []).filter((item) => {
        if (!item.domain) return false
        if (matchesDomain(item.domain, effectiveDomain, true)) return false
        const itemRoot = getRootDomain(item.domain)
        if (rootDomain && itemRoot === rootDomain) return true
        if (
          item.accounts.some(
            (a) =>
              (a.linked_domains || []).includes(effectiveDomain) ||
              (rootDomain && (a.linked_domains || []).includes(rootDomain))
          )
        )
          return true
        if (
          rootDomain &&
          rootDomain.split('.')[0].length >= 4 &&
          itemRoot.split('.')[0] === rootDomain.split('.')[0]
        )
          return true
        return false
      })
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
          item.domain &&
          !matchesDomain(item.domain, effectiveDomain ?? '', true) &&
          !relatedDomains.some((rd) => rd.domain === item.domain)
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
              {(acc.pinned || acc.auto_pinned) && (
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded-sm font-medium border whitespace-nowrap ${
                    acc.pinned
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                      : 'bg-muted text-muted-foreground border-border/50'
                  }`}
                >
                  {acc.pinned ? '★ Pinned' : '⊙ Auto'}
                </span>
              )}
              {acc.vault_source && (
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded-sm bg-muted text-muted-foreground font-medium border border-border whitespace-nowrap truncate max-w-[100px]"
                  title={acc.vault_source}
                >
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

  // ---- Special page renderers ----

  if (specialPage === 'vault') {
    return (
      <div className="w-80 p-4 bg-background text-foreground font-sans min-h-[280px] flex flex-col">
        <div className="flex items-center gap-2.5 mb-4 border-b border-border pb-3">
          <img
            src={iconUrl}
            alt="LoginLens"
            className="w-6 h-6 object-contain rounded"
          />
          <span className="font-bold text-base tracking-tight">LoginLens</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 py-6">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Layout size={28} className="text-primary" />
          </div>
          <div className="text-center">
            <p className="font-bold text-foreground mb-1">Vault is Open</p>
            <p className="text-xs text-muted-foreground">
              The LoginLens vault dashboard is already open in this tab.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (specialPage === 'extension') {
    return (
      <div className="w-80 p-4 bg-background text-foreground font-sans min-h-[280px] flex flex-col">
        <div className="flex items-center gap-2.5 mb-4 border-b border-border pb-3">
          <img
            src={iconUrl}
            alt="LoginLens"
            className="w-6 h-6 object-contain rounded"
          />
          <span className="font-bold text-base tracking-tight">LoginLens</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 py-6 text-center">
          <Shield size={28} className="text-muted-foreground/40" />
          <p className="font-semibold text-foreground">Extension Page</p>
          <p className="text-xs text-muted-foreground">
            LoginLens doesn't track credentials for browser extension pages.
          </p>
          <button
            onClick={openVault}
            className="mt-2 text-xs text-primary hover:underline flex items-center gap-1"
          >
            <ExternalLink size={12} /> Open Vault Dashboard
          </button>
        </div>
      </div>
    )
  }

  if (specialPage === 'chrome-internal' || specialPage === 'new-tab') {
    const isNewTab = specialPage === 'new-tab'
    return (
      <div className="w-80 p-4 bg-background text-foreground font-sans min-h-[280px] flex flex-col">
        <div className="flex items-center gap-2.5 mb-4 border-b border-border pb-3">
          <img
            src={iconUrl}
            alt="LoginLens"
            className="w-6 h-6 object-contain rounded"
          />
          <span className="font-bold text-base tracking-tight">LoginLens</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 py-6 text-center">
          <Lock size={28} className="text-muted-foreground/40" />
          <p className="font-semibold text-foreground">
            {isNewTab ? 'New Tab' : 'Browser Page'}
          </p>
          <p className="text-xs text-muted-foreground">
            {isNewTab
              ? 'Navigate to a website to see your saved logins for it.'
              : 'LoginLens only works on regular websites, not browser system pages.'}
          </p>
          {/* Show search over all saved accounts */}
          <div className="w-full mt-2">
            <div className="relative">
              <Search
                size={13}
                className="absolute left-3 top-2.5 text-muted-foreground"
              />
              <input
                type="text"
                placeholder="Search all logins..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-muted/50 border border-border rounded-lg focus:outline-none focus:border-primary text-foreground placeholder:text-muted-foreground"
              />
            </div>
            {searchQuery && (
              <div className="mt-2 space-y-2 max-h-[160px] overflow-y-auto pr-1">
                {searchDomains.length > 0 ? (
                  searchDomains.map((d) => (
                    <DomainCard key={d.domain} domainMap={d} />
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No results for "{searchQuery}"
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="pt-3 border-t border-border">
          <button
            onClick={openVault}
            className="w-full py-2 bg-muted text-foreground hover:bg-muted/80 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            Open Vault Dashboard
          </button>
        </div>
      </div>
    )
  }

  // ---- Normal web page ----

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

        {/* App Domain Banner */}
        {isAppDomain && effectiveDomain && (
          <div className="mb-3 p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/30 text-xs flex items-center gap-2">
            <Smartphone size={13} className="text-purple-500 shrink-0" />
            <div className="min-w-0">
              <span className="text-muted-foreground">App bundle ID: </span>
              <span className="font-semibold text-purple-600 dark:text-purple-400">
                {effectiveDomain}
              </span>
            </div>
          </div>
        )}

        {/* Pending Alerts */}
        {pendingCaptures && pendingCaptures.length > 0 && (
          <div
            className="mb-3 p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-xs flex items-start gap-2 cursor-pointer hover:bg-indigo-500/20 transition-colors"
            onClick={openVault}
          >
            <Shield size={14} className="text-indigo-500 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <span className="font-semibold text-indigo-600 dark:text-indigo-400 block mb-0.5">
                {pendingCaptures.length} Pending Capture
                {pendingCaptures.length !== 1 ? 's' : ''}
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
                      : isAppDomain
                        ? `App · ${effectiveDomain}`
                        : `This site · ${effectiveDomain}`}
                  </p>
                  {siteDomains.length > 0 ? (
                    siteDomains.map((d) => (
                      <DomainCard key={d.domain} domainMap={d} />
                    ))
                  ) : relatedDomains.length > 0 ? (
                    <div className="space-y-2 mb-2">
                      <div className="text-xs text-muted-foreground border border-dashed border-border rounded-lg p-2.5 text-center">
                        No exact logins for <span className="font-semibold">{effectiveDomain}</span>
                      </div>
                      <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg space-y-2">
                        <p className="text-xs font-bold text-blue-500 dark:text-blue-400 flex items-center gap-1.5">
                          <Globe size={13} /> Logins for {relatedDomains.map((d) => d.domain).join(', ')}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          These belong to the root or mirror domain of <strong>{effectiveDomain}</strong>. Link as Mirror Domain?
                        </p>
                        <div className="space-y-2 pt-1">
                          {relatedDomains.map((d) => (
                            <div
                              key={d.domain}
                              className="p-2 rounded bg-background/80 border border-border space-y-1.5"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-foreground">
                                  {d.domain}
                                </span>
                                <button
                                  onClick={() =>
                                    handleLinkMirrorDomain(
                                      d.domain,
                                      effectiveDomain
                                    )
                                  }
                                  className="text-[10px] px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded transition-colors shadow-sm"
                                >
                                  + Link Mirror
                                </button>
                              </div>
                              {d.accounts.map((acc) => (
                                <div
                                  key={acc.id}
                                  className="text-[11px] font-mono text-muted-foreground pl-1 truncate"
                                >
                                  • {acc.identities[0]} ({acc.label})
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
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
          <>
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
            {/* Recording reads identities off every page, so the fact that it
                turns itself off is worth saying out loud rather than leaving
                as a surprise. */}
            {isRecording && (
              <p className="text-[11px] text-muted-foreground text-center leading-snug">
                Stops on its own after 15 minutes. A badge on the page shows
                while it is on.
              </p>
            )}
          </>
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
      {/* Without this a render error leaves the popup blank, which is
          indistinguishable from the extension being broken or uninstalled. */}
      <ErrorBoundary>
        <PopupContent />
      </ErrorBoundary>
    </ThemeProvider>
  )
}
