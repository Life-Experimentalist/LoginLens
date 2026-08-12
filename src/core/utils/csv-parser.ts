import type { IdentityProfile, DomainEntry } from '../storage/schema'
import { extractDomain } from './domain'
import { fingerprintPassword } from './password-fingerprint'

export interface CsvImportResult {
  validDomains: DomainEntry[]
  reviewNeeded: any[]
}

export function parseCSVLine(text: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"' && text[i + 1] === '"') {
      current += '"'
      i++
    } else if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  result.push(current)
  return result
}

// Fingerprints are keyed HMACs, not bare digests — see core/utils/password-fingerprint.
// Imported passwords must go through the same function the scraper uses, or reuse
// detection would never match an imported account against a captured one.
async function hashPassword(password: string): Promise<string> {
  if (!password) return ''
  return fingerprintPassword(password)
}

/**
 * Column names each exporter uses for the same four fields.
 *
 * Only Chrome/Edge spell them `name,url,username,password`. Matching on those
 * literally meant a Bitwarden export — `login_uri`, `login_username`,
 * `login_password` — parsed as rows with no URL and no username, so every entry
 * landed in the review queue and the import appeared to do nothing. Order
 * matters: the first header present wins.
 */
const COLUMN_ALIASES = {
  name: ['name', 'title', 'item name', 'display name'],
  url: ['url', 'login_uri', 'website', 'web site', 'urls', 'login_url', 'uri'],
  username: [
    'username',
    'login_username',
    'user name',
    'user',
    'login',
    'email',
    'email address'
  ],
  password: ['password', 'login_password', 'pass']
} as const

function findColumn(headers: string[], aliases: readonly string[]): number {
  for (const alias of aliases) {
    const idx = headers.indexOf(alias)
    if (idx !== -1) return idx
  }
  return -1
}

export async function parseEdgePasswordsCSV(
  csvContent: string
): Promise<CsvImportResult> {
  const lines = csvContent
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
  if (lines.length < 1) return { validDomains: [], reviewNeeded: [] }

  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().trim())
  const nameIdx = findColumn(headers, COLUMN_ALIASES.name)
  const urlIdx = findColumn(headers, COLUMN_ALIASES.url)
  const userIdx = findColumn(headers, COLUMN_ALIASES.username)
  const passIdx = findColumn(headers, COLUMN_ALIASES.password)

  if (urlIdx === -1 && nameIdx === -1) {
    throw new Error(
      'CSV must contain a recognisable name or URL column (e.g. "name", "title", "url", "login_uri").'
    )
  }

  const validMap = new Map<string, IdentityProfile[]>()
  const reviewNeeded: any[] = []

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i])
    const rawUrl = urlIdx !== -1 ? row[urlIdx] : ''
    const username = userIdx !== -1 ? row[userIdx] : ''
    const password = passIdx !== -1 ? row[passIdx] : ''
    const name = nameIdx !== -1 ? row[nameIdx] : rawUrl

    // Check for missing username or URL
    if (!username.trim() && !rawUrl.trim()) {
      reviewNeeded.push({
        url: rawUrl,
        username,
        name,
        reason: 'Missing both URL and Username'
      })
      continue
    }

    try {
      let domain = 'unknown-domain'
      if (rawUrl.trim()) {
        if (rawUrl.startsWith('android://')) {
          // Format like android://hash@package/
          const match = rawUrl.match(/@([^/]+)/)
          domain = match ? match[1] : rawUrl.replace('android://', '')
        } else {
          domain = extractDomain(rawUrl)
        }
      } else if (name.trim()) {
        domain = extractDomain(name)
      }

      if (!domain) domain = 'other'

      const passwordHash = await hashPassword(password)

      const profile: IdentityProfile = {
        id: crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).substring(2),
        label: name || domain,
        identities: [username.trim() || 'No Username Recorded'],
        password_hash: passwordHash || undefined,
        login_method: {
          type: 'password'
        },
        updated_at: Date.now()
      }

      if (!validMap.has(domain)) {
        validMap.set(domain, [])
      }
      validMap.get(domain)!.push(profile)
    } catch {
      // If URL parsing fails, fallback to using rawUrl or name as domain
      const fallbackDomain = (name || rawUrl)
        .split('/')[0]
        .replace(/^www\./, '')
      if (fallbackDomain) {
        const passwordHashFallback = await hashPassword(password)
        const profile: IdentityProfile = {
          id: crypto.randomUUID
            ? crypto.randomUUID()
            : Math.random().toString(36).substring(2),
          label: name || fallbackDomain,
          identities: [username.trim() || 'No Username Recorded'],
          password_hash: passwordHashFallback || undefined,
          login_method: { type: 'password' },
          updated_at: Date.now()
        }
        if (!validMap.has(fallbackDomain)) validMap.set(fallbackDomain, [])
        validMap.get(fallbackDomain)!.push(profile)
      } else {
        reviewNeeded.push({
          url: rawUrl,
          username,
          name,
          reason: 'Invalid URL formatting'
        })
      }
    }
  }

  const validDomains: DomainEntry[] = Array.from(validMap.entries()).map(
    ([domain, accounts]) => ({
      domain,
      accounts
    })
  )

  return { validDomains, reviewNeeded }
}
