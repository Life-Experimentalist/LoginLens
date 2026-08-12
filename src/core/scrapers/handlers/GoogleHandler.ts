import { nativeStorage } from '../../storage/native'
import type {
  DomainEntry,
  GlobalOAuthAccount,
  IdentityProfile
} from '../../storage/schema'
import { isHostOrSubdomainOf } from '../../utils/domain'
import { log } from '../../utils/logger'
import { ScraperHandler } from '../HandlerRegistry'

// ─── Linked Apps Scraper (myaccount.google.com/linkedapps) ─────────────────

async function syncLinkedApps() {
  log.info('Google Linked Apps page detected. Initializing scanner...')

  // Get signed-in Google accounts from header/profile elements first (more reliable)
  // then fall back to email regex on full body text
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
  const googleEmails = new Set<string>()

  // Strategy 1: Look for aria-labels on the account picker or profile chips
  const profileElements = document.querySelectorAll(
    '[data-email], [aria-label*="@"], [data-identifier]'
  )
  profileElements.forEach((el) => {
    const email =
      el.getAttribute('data-email') ||
      el.getAttribute('data-identifier') ||
      (el.getAttribute('aria-label') || '').match(emailRegex)?.[0]
    if (email && email.includes('@')) googleEmails.add(email.toLowerCase())
  })

  // Strategy 2: Full body text scan (catches all visible email addresses)
  const bodyText = document.body.innerText
  const matches = bodyText.match(emailRegex)
  if (matches) {
    matches.forEach((m) => {
      // Only keep likely Google accounts (gmail.com, googlemail.com, or Google Workspace)
      googleEmails.add(m.toLowerCase())
    })
  }

  const finalEmails = Array.from(googleEmails).filter((e) => e.includes('@'))
  log.info(`Scraped Google Account Emails: ${finalEmails.join(', ')}`)

  if (finalEmails.length === 0) {
    finalEmails.push('unknown@google.com')
  }

  // Scrape linked app domains from the cards
  const appCards = document.querySelectorAll('div[role="listitem"]')
  const discoveredDomains = new Set<string>()

  appCards.forEach((card) => {
    const links = card.querySelectorAll('a[href]')
    links.forEach((a) => {
      try {
        const href = (a as HTMLAnchorElement).href
        const url = new URL(href)
        if (
          !isHostOrSubdomainOf(url.hostname, 'google.com') &&
          !isHostOrSubdomainOf(url.hostname, 'gstatic.com')
        ) {
          discoveredDomains.add(url.hostname.replace(/^www\./, ''))
        }
      } catch {}
    })

    // Also look for text that looks like domains
    const cardText = card.textContent || ''
    const domainMatches = cardText.match(
      /[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})?/g
    )
    if (domainMatches) {
      domainMatches.forEach((d) => {
        if (
          !d.includes('google') &&
          !d.includes('gstatic') &&
          d.includes('.') &&
          d.length > 4
        ) {
          discoveredDomains.add(d.toLowerCase())
        }
      })
    }
  })

  return { googleEmails: finalEmails, domains: Array.from(discoveredDomains) }
}

async function saveToVault(emails: string[], domains: string[]) {
  try {
    const rawRegistry =
      await nativeStorage.get<GlobalOAuthAccount[]>('oauth_registry')
    const registry = Array.isArray(rawRegistry) ? rawRegistry : []
    const rawVault = await nativeStorage.get<DomainEntry[]>('saved_accounts')
    const vault = Array.isArray(rawVault) ? rawVault : []
    let modifiedRegistry = false
    let modifiedVault = false

    for (const email of emails) {
      const existsInRegistry = registry.find(
        (r) => r.provider === 'google.com' && r.identity === email
      )

      if (!existsInRegistry) {
        registry.push({
          id: crypto.randomUUID?.() ?? Math.random().toString(36).substring(2),
          provider: 'google.com',
          identity: email,
          notes: 'Auto-synced from Google Linked Apps',
          is_manual: false,
          created_at: Date.now(),
          updated_at: Date.now()
        })
        modifiedRegistry = true
      }

      for (const domain of domains) {
        const entryIdx = vault.findIndex((d) => d.domain === domain)

        const newProfile: IdentityProfile = {
          id: crypto.randomUUID?.() ?? Math.random().toString(36).substring(2),
          label: 'Google OAuth',
          identities: [email],
          login_method: { type: 'oauth', provider: 'google.com' },
          updated_at: Date.now(),
          notes: 'Imported via Linked Apps Sync'
        }

        if (entryIdx >= 0) {
          const hasIt = vault[entryIdx].accounts.some(
            (a) =>
              a.login_method.type === 'oauth' &&
              a.login_method.provider === 'google.com' &&
              a.identities[0] === email
          )
          if (!hasIt) {
            vault[entryIdx].accounts.push(newProfile)
            modifiedVault = true
          }
        } else {
          vault.push({ domain, accounts: [newProfile] })
          modifiedVault = true
        }
      }
    }

    if (modifiedRegistry) await nativeStorage.set('oauth_registry', registry)
    if (modifiedVault) {
      await nativeStorage.set('saved_accounts', vault)
      log.info(
        `Synced ${domains.length} apps × ${emails.length} emails to Vault!`
      )
    }
  } catch (e) {
    log.error('Failed to save linked apps', e)
  }
}

export const GoogleHandler: ScraperHandler = {
  name: 'Google Linked Apps',
  domains: ['myaccount.google.com'],
  execute: async () => {
    if (!window.location.pathname.includes('/linkedapps')) return
    if ((window as any).__ll_syncing) return

    const runSync = async () => {
      if ((window as any).__ll_syncing) return
      ;(window as any).__ll_syncing = true
      try {
        const { googleEmails, domains } = await syncLinkedApps()
        if (domains.length > 0) await saveToVault(googleEmails, domains)
      } finally {
        ;(window as any).__ll_syncing = false
      }
    }

    // MutationObserver for SPA navigation within the page
    const observer = new MutationObserver(() => {
      if (!(window as any).__ll_syncing) {
        setTimeout(runSync, 2500)
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })

    // Initial run
    setTimeout(runSync, 2000)
  }
}

declare global {
  interface Window {
    __ll_syncing: boolean
  }
}
