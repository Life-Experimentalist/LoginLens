import { describe, expect, it } from 'vitest'
import { parseCSVLine, parseEdgePasswordsCSV } from '~/core/utils/csv-parser'

/**
 * Column headers as each exporter actually writes them. These strings are the
 * contract with the outside world — the parser is only correct relative to
 * them, so they are spelled out rather than generated.
 */
const CHROME_EDGE_CSV = [
  'name,url,username,password,note',
  'GitHub,https://github.com/login,octocat@example.com,hunter2,',
  'Reddit,https://www.reddit.com,someone@example.com,correcthorse,'
].join('\n')

const BITWARDEN_CSV = [
  'folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp',
  ',,login,GitHub,,,0,https://github.com,octocat@example.com,hunter2,',
  ',,login,Reddit,,,0,https://www.reddit.com,someone@example.com,correcthorse,'
].join('\n')

const ONEPASSWORD_CSV = [
  'Title,Url,Username,Password,Notes',
  'GitHub,https://github.com,octocat@example.com,hunter2,'
].join('\n')

describe('parseCSVLine', () => {
  it('splits plain fields', () => {
    expect(parseCSVLine('a,b,c')).toEqual(['a', 'b', 'c'])
  })

  it('keeps commas that are inside quotes', () => {
    expect(parseCSVLine('a,"b,c",d')).toEqual(['a', 'b,c', 'd'])
  })

  it('unescapes doubled quotes', () => {
    expect(parseCSVLine('a,"say ""hi""",c')).toEqual(['a', 'say "hi"', 'c'])
  })

  it('preserves empty trailing fields', () => {
    // A trailing empty column is how "no password recorded" arrives; dropping
    // it shifts every index after it.
    expect(parseCSVLine('a,b,')).toEqual(['a', 'b', ''])
  })
})

describe('parseEdgePasswordsCSV', () => {
  it('imports a Chrome/Edge export', async () => {
    const { validDomains, reviewNeeded } = await parseEdgePasswordsCSV(
      CHROME_EDGE_CSV
    )

    expect(reviewNeeded).toHaveLength(0)
    expect(validDomains.map((d) => d.domain).sort()).toEqual([
      'github.com',
      'reddit.com'
    ])
  })

  it('imports a Bitwarden export, whose columns are login_* prefixed', async () => {
    const { validDomains, reviewNeeded } = await parseEdgePasswordsCSV(
      BITWARDEN_CSV
    )

    // Before alias support this produced zero domains and two review rows.
    expect(reviewNeeded).toHaveLength(0)
    expect(validDomains.map((d) => d.domain).sort()).toEqual([
      'github.com',
      'reddit.com'
    ])
    expect(validDomains[0].accounts[0].identities).toEqual([
      'octocat@example.com'
    ])
  })

  it('imports a 1Password export with capitalised headers', async () => {
    const { validDomains } = await parseEdgePasswordsCSV(ONEPASSWORD_CSV)
    expect(validDomains.map((d) => d.domain)).toEqual(['github.com'])
  })

  it('never keeps the password itself, only a fingerprint', async () => {
    const { validDomains } = await parseEdgePasswordsCSV(CHROME_EDGE_CSV)
    const serialized = JSON.stringify(validDomains)

    expect(serialized).not.toContain('hunter2')
    expect(serialized).not.toContain('correcthorse')
    expect(validDomains[0].accounts[0].password_hash).toBeTruthy()
  })

  it('gives identical passwords identical fingerprints, and different ones different', async () => {
    const csv = [
      'name,url,username,password',
      'A,https://a.example,me@example.com,samepass',
      'B,https://b.example,me@example.com,samepass',
      'C,https://c.example,me@example.com,otherpass'
    ].join('\n')

    const { validDomains } = await parseEdgePasswordsCSV(csv)
    const byDomain = Object.fromEntries(
      validDomains.map((d) => [d.domain, d.accounts[0].password_hash])
    )

    // This is what the reuse detector keys on; if it stopped holding, reuse
    // warnings would silently never fire for imported entries.
    expect(byDomain['a.example']).toBe(byDomain['b.example'])
    expect(byDomain['a.example']).not.toBe(byDomain['c.example'])
  })

  it('sends rows with neither a URL nor a username to review', async () => {
    const csv = ['name,url,username,password', 'Orphan,,,secret'].join('\n')
    const { validDomains, reviewNeeded } = await parseEdgePasswordsCSV(csv)

    expect(validDomains).toHaveLength(0)
    expect(reviewNeeded).toHaveLength(1)
    expect(reviewNeeded[0].reason).toMatch(/missing/i)
  })

  it('keeps a row that has a URL but no password', async () => {
    // Half the value of the vault is knowing an account exists. Requiring a
    // password to import would discard exactly the entries worth reviewing.
    const csv = [
      'name,url,username,password',
      'Forum,https://forum.example,me@example.com,'
    ].join('\n')
    const { validDomains, reviewNeeded } = await parseEdgePasswordsCSV(csv)

    expect(reviewNeeded).toHaveLength(0)
    expect(validDomains[0].accounts[0].password_hash).toBeUndefined()
  })

  it('groups several accounts on one domain into a single entry', async () => {
    const csv = [
      'name,url,username,password',
      'Work,https://mail.example.com,work@example.com,a',
      'Personal,https://mail.example.com,me@example.com,b'
    ].join('\n')
    const { validDomains } = await parseEdgePasswordsCSV(csv)

    expect(validDomains).toHaveLength(1)
    expect(validDomains[0].accounts).toHaveLength(2)
  })

  it('handles Android app rows exported by Chrome', async () => {
    const csv = [
      'name,url,username,password',
      'Signal,android://hash@org.thoughtcrime.securesms/,me@example.com,x'
    ].join('\n')
    const { validDomains, reviewNeeded } = await parseEdgePasswordsCSV(csv)

    expect(reviewNeeded).toHaveLength(0)
    expect(validDomains[0].domain).toBe('org.thoughtcrime.securesms')
  })

  it('returns empty rather than throwing on an empty file', async () => {
    expect(await parseEdgePasswordsCSV('')).toEqual({
      validDomains: [],
      reviewNeeded: []
    })
  })

  it('rejects a file with no usable columns at all', async () => {
    await expect(
      parseEdgePasswordsCSV('foo,bar\n1,2')
    ).rejects.toThrow(/name or URL column/i)
  })
})
