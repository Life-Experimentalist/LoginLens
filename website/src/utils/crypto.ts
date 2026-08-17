/**
 * Offline decryptor for LoginLens backups, running entirely in the visitor's
 * browser. Nothing here makes a network call — the file and the passphrase are
 * read, used and dropped in page memory.
 *
 * This file is the third implementation of the same envelope, alongside
 * `src/core/utils/encryption.ts` in the extension and the Python snippet in
 * `src/core/utils/export.ts`. If the payload format changes, all three change
 * together — a decryptor that silently disagrees with the encryptor is worse
 * than no decryptor at all, because it fails at exactly the moment someone has
 * lost their extension and has only the backup left.
 *
 * Envelope, matching `src/core/utils/encryption.ts`:
 *
 *   [0]      magic   0x4C ('L')
 *   [1]      version 0x01
 *   [2..5]   PBKDF2 iterations, uint32 big-endian
 *   [6..21]  salt, 16 bytes
 *   [22..33] AES-GCM IV, 12 bytes
 *   [34..]   AES-256-GCM ciphertext + 16-byte auth tag
 *
 * Pre-1.0 builds wrote a headerless payload (salt | iv | ciphertext at a fixed
 * 100,000 iterations); it is still accepted so old backups keep opening.
 */

const MAGIC = 0x4c;
const VERSION = 1;
const HEADER_BYTES = 6;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const GCM_TAG_BYTES = 16;
const LEGACY_ITERATIONS = 100_000;

export interface VaultAccount {
  id: string;
  label?: string;
  identities: string[];
  login_method: {
    type: string;
    provider?: string;
  };
  mfa?: {
    type: string;
  };
  notes?: string;
}

export interface DomainEntry {
  domain: string;
  domain_notes?: string;
  accounts: VaultAccount[];
}

export interface DecryptedVaultData {
  savedAccounts: DomainEntry[];
  oauthRegistry: any[];
  mfaRegistry: any[];
  /** The decrypted document exactly as written, for the JSON download. */
  raw: any;
}

/**
 * Pulls the three collections out of a backup document.
 *
 * Mirrors `readVaultBundle` in the extension: different LoginLens versions
 * nest the same collections in slightly different places, and a reader that
 * probes only one of them opens an old backup as an empty vault with no error
 * at all — which reads to the user as "my data is gone".
 */
function readVaultBundle(parsed: any): Omit<DecryptedVaultData, 'raw'> {
  const pick = <T,>(...candidates: unknown[]): T[] => {
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate as T[];
    }
    return [];
  };

  return {
    savedAccounts: pick<DomainEntry>(
      parsed?.vault?.savedAccounts,
      parsed?.savedAccounts,
      parsed?.saved_accounts,
      parsed?.data?.savedAccounts,
      parsed?.data,
      parsed
    ),
    oauthRegistry: pick<any>(
      parsed?.vault?.oauthRegistry,
      parsed?.oauthRegistry,
      parsed?.oauth_registry,
      parsed?.data?.oauthRegistry
    ),
    mfaRegistry: pick<any>(
      parsed?.vault?.mfaRegistry,
      parsed?.mfaRegistry,
      parsed?.mfa_registry,
      parsed?.data?.mfaRegistry
    )
  };
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64.trim());
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function parsePayload(payload: Uint8Array) {
  const isVersioned =
    payload.length > HEADER_BYTES && payload[0] === MAGIC && payload[1] === VERSION;

  if (isVersioned) {
    const iterations = new DataView(
      payload.buffer,
      payload.byteOffset
    ).getUint32(2, false);

    // A corrupted header must not be allowed to drive an absurd KDF cost —
    // this runs on the page's main thread and would freeze the tab for minutes.
    if (iterations < 1_000 || iterations > 5_000_000) {
      throw new Error('Backup file is corrupted (invalid key-derivation cost).');
    }

    return {
      iterations,
      salt: payload.slice(HEADER_BYTES, HEADER_BYTES + SALT_BYTES),
      iv: payload.slice(
        HEADER_BYTES + SALT_BYTES,
        HEADER_BYTES + SALT_BYTES + IV_BYTES
      ),
      ciphertext: payload.slice(HEADER_BYTES + SALT_BYTES + IV_BYTES)
    };
  }

  return {
    iterations: LEGACY_ITERATIONS,
    salt: payload.slice(0, SALT_BYTES),
    iv: payload.slice(SALT_BYTES, SALT_BYTES + IV_BYTES),
    ciphertext: payload.slice(SALT_BYTES + IV_BYTES)
  };
}

/**
 * Decrypts a `.llbak` file, or a plain `.json` backup, into its collections.
 *
 * Accepts the whole file text: a `.llbak` is a JSON wrapper whose `payload`
 * field holds the base64 envelope, a `.json` backup is already readable, and a
 * bare base64 string is taken as the envelope itself.
 */
export async function decryptVaultPayload(
  fileText: string,
  password: string
): Promise<DecryptedVaultData> {
  const text = (fileText || '').trim();
  if (!text) {
    throw new Error('There is no backup data to decrypt.');
  }

  let document_: any;
  try {
    document_ = JSON.parse(text);
  } catch {
    // Not JSON — the user pasted the bare base64 envelope.
  }

  let base64Payload: string;
  if (document_ && typeof document_.payload === 'string') {
    base64Payload = document_.payload;
  } else if (document_ && typeof document_ === 'object') {
    // An unencrypted .json backup — no passphrase involved.
    const bundle = readVaultBundle(document_);
    if (
      bundle.savedAccounts.length ||
      bundle.oauthRegistry.length ||
      bundle.mfaRegistry.length
    ) {
      return { ...bundle, raw: document_ };
    }
    throw new Error(
      'That file is valid JSON, but there is no LoginLens vault inside it.'
    );
  } else {
    base64Payload = text;
  }

  if (!password) {
    throw new Error('This backup is encrypted — enter the passphrase you exported it with.');
  }

  let payload: Uint8Array;
  try {
    payload = fromBase64(base64Payload);
  } catch {
    throw new Error(
      'Backup file is not valid — it is corrupted or not a LoginLens backup.'
    );
  }

  const parsedPayload = parsePayload(payload);
  if (parsedPayload.ciphertext.length < GCM_TAG_BYTES) {
    throw new Error('Backup file is truncated or incomplete.');
  }

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: parsedPayload.salt,
      iterations: parsedPayload.iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  let decryptedBuf: ArrayBuffer;
  try {
    decryptedBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: parsedPayload.iv },
      key,
      parsedPayload.ciphertext
    );
  } catch {
    throw new Error(
      'Decryption failed. Incorrect passphrase, or the file is corrupted.'
    );
  }

  const inner = JSON.parse(new TextDecoder().decode(decryptedBuf));
  return { ...readVaultBundle(inner), raw: inner };
}

/**
 * Converts a vault into the `name,url,username,password,note` CSV that Chrome,
 * Firefox, 1Password and Bitwarden all import.
 *
 * The `password` column is always empty, and that is not an oversight:
 * LoginLens never stores a password, so there is nothing to put there. The
 * column stays because those importers reject a file without it.
 */
export function convertVaultToBrowserCSV(savedAccounts: DomainEntry[]): string {
  const escapeCSV = (val: string | undefined): string => {
    if (!val) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headers = ['name', 'url', 'username', 'password', 'note'];
  const rows: string[] = [headers.join(',')];

  for (const domainEntry of savedAccounts) {
    for (const acc of domainEntry.accounts || []) {
      const isOAuth = acc.login_method?.type === 'oauth';
      const isAPI =
        acc.login_method?.type === 'api-key' ||
        acc.login_method?.type === 'api_key';

      const username = acc.identities?.[0] || '';
      let note = '';

      if (isOAuth) {
        note = `LoginLens: Authenticated via ${acc.login_method?.provider || 'OAuth'}`;
      } else if (isAPI) {
        note = 'LoginLens: API Key / Token';
      } else if (acc.mfa) {
        note = `LoginLens: Has MFA Setup attached (${acc.mfa.type})`;
      }

      rows.push(
        [
          escapeCSV(acc.label || domainEntry.domain), // name
          escapeCSV(domainEntry.domain), // url
          escapeCSV(username), // username
          '', // password — never stored, see above
          escapeCSV(note) // note
        ].join(',')
      );
    }
  }

  return rows.join('\n');
}
