import type { IdentityProfile, DomainEntry } from '../storage/schema';

export interface CsvImportResult {
  validDomains: DomainEntry[];
  reviewNeeded: any[];
}

export function parseCSVLine(text: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && text[i + 1] === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

export function parseEdgePasswordsCSV(csvContent: string): CsvImportResult {
  const lines = csvContent.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 1) return { validDomains: [], reviewNeeded: [] };

  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
  const nameIdx = headers.indexOf('name');
  const urlIdx = headers.indexOf('url');
  const userIdx = headers.indexOf('username');
  const passIdx = headers.indexOf('password');

  if (urlIdx === -1 && nameIdx === -1) {
    throw new Error('CSV must contain at least "url" or "name" column.');
  }

  const validMap = new Map<string, IdentityProfile[]>();
  const reviewNeeded: any[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    const rawUrl = urlIdx !== -1 ? row[urlIdx] : '';
    const username = userIdx !== -1 ? row[userIdx] : '';
    const password = passIdx !== -1 ? row[passIdx] : '';
    const name = nameIdx !== -1 ? row[nameIdx] : rawUrl;

    // Check for missing username or URL
    if (!username.trim() && !rawUrl.trim()) {
      reviewNeeded.push({
        url: rawUrl,
        username,
        name,
        reason: 'Missing both URL and Username'
      });
      continue;
    }

    try {
      let domain = 'unknown-domain';
      if (rawUrl.trim()) {
        if (rawUrl.startsWith('android://')) {
          // Format like android://hash@package/
          const match = rawUrl.match(/@([^/]+)/);
          domain = match ? match[1] : rawUrl.replace('android://', '');
        } else {
          const urlObj = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
          domain = urlObj.hostname.replace(/^www\./, '');
        }
      } else if (name.trim()) {
        domain = name.toLowerCase().trim().replace(/^www\./, '');
      }

      if (!domain) domain = 'other';

      const profile: IdentityProfile = {
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
        label: name || domain,
        identities: [username.trim() || 'No Username Recorded'],
        login_method: {
          type: 'password',
        },
        updated_at: Date.now()
      };

      if (!validMap.has(domain)) {
        validMap.set(domain, []);
      }
      validMap.get(domain)!.push(profile);
    } catch (e) {
      // If URL parsing fails, fallback to using rawUrl or name as domain
      const fallbackDomain = (name || rawUrl).split('/')[0].replace(/^www\./, '');
      if (fallbackDomain) {
        const profile: IdentityProfile = {
          id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
          label: name || fallbackDomain,
          identities: [username.trim() || 'No Username Recorded'],
          login_method: { type: 'password' },
          updated_at: Date.now()
        };
        if (!validMap.has(fallbackDomain)) validMap.set(fallbackDomain, []);
        validMap.get(fallbackDomain)!.push(profile);
      } else {
        reviewNeeded.push({ url: rawUrl, username, name, reason: 'Invalid URL formatting' });
      }
    }
  }

  const validDomains: DomainEntry[] = Array.from(validMap.entries()).map(([domain, accounts]) => ({
    domain,
    accounts
  }));

  return { validDomains, reviewNeeded };
}
