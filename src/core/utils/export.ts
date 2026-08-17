import type {
  DomainEntry,
  GlobalMFAAuthenticator,
  GlobalOAuthAccount
} from '../storage/schema'
import { encryptData } from './encryption'
import { getRawFingerprintKey } from './password-fingerprint'
import { getExtensionVersion } from './runtime'

/**
 * Offline decryptor for `.llbak` backups, offered from the Export wizard.
 *
 * The point of shipping this is that an encrypted backup must not be readable
 * only by LoginLens. It is kept byte-exact with `core/utils/encryption.ts` —
 * if the payload header ever changes, this changes with it.
 */
export const PYTHON_DECRYPT_SNIPPET = `"""
Copyright 2026 LoginLens

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

LoginLens offline backup decryptor.

Reads a .llbak file exported by the LoginLens extension and writes the vault
back out as plain JSON and CSV. Requires only the 'cryptography' package:

    pip install cryptography
    python loginlens_decrypt.py my_backup.llbak

Backup layout
-------------
The file is JSON:

    {"format": "loginlens_encrypted_vault_v1", "payload": "<base64>", ...}

"payload" base64-decodes to:

    byte  0       magic, 0x4C ('L')
    byte  1       format version, 0x01
    bytes 2-5     PBKDF2 iterations, uint32 big-endian
    bytes 6-21    salt, 16 bytes
    bytes 22-33   AES-GCM nonce, 12 bytes
    bytes 34-     AES-256-GCM ciphertext with a trailing 16-byte auth tag

The key is PBKDF2-HMAC-SHA256(passphrase, salt, iterations) truncated to 32
bytes. Note that LoginLens never stores your passwords, so the decrypted data
contains account identities, labels, notes, and API keys — but no passwords.
"""

import base64
import csv
import getpass
import json
import os
import struct
import sys

MAGIC = 0x4C
VERSION = 1
HEADER_LEN = 6
SALT_LEN = 16
NONCE_LEN = 12
TAG_LEN = 16


def unwrap_payload(payload_b64: str):
    """Split the base64 payload into (iterations, salt, nonce, ciphertext)."""
    blob = base64.b64decode(payload_b64)

    if len(blob) > HEADER_LEN and blob[0] == MAGIC and blob[1] == VERSION:
        iterations = struct.unpack(">I", blob[2:6])[0]
        body = blob[HEADER_LEN:]
    else:
        # Headerless payload written by a pre-1.0 build.
        iterations = 100_000
        body = blob

    salt = body[:SALT_LEN]
    nonce = body[SALT_LEN:SALT_LEN + NONCE_LEN]
    ciphertext = body[SALT_LEN + NONCE_LEN:]

    if len(ciphertext) < TAG_LEN:
        raise ValueError("Backup is truncated.")

    return iterations, salt, nonce, ciphertext


def decrypt_vault(file_path: str) -> int:
    if not os.path.exists(file_path):
        print("Error: file '%s' not found." % file_path)
        return 1

    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
        from cryptography.hazmat.primitives import hashes
    except ImportError:
        print("Error: the 'cryptography' package is missing.")
        print("Install it with:  pip install cryptography")
        return 1

    with open(file_path, "r", encoding="utf-8") as f:
        envelope = json.load(f)

    if "payload" not in envelope:
        print("This file is not an encrypted LoginLens backup.")
        print("Plain .json exports need no decryption — open them directly.")
        return 1

    passphrase = getpass.getpass("Backup passphrase: ")
    iterations, salt, nonce, ciphertext = unwrap_payload(envelope["payload"])

    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(), length=32, salt=salt, iterations=iterations
    )
    key = kdf.derive(passphrase.encode("utf-8"))

    try:
        plaintext = AESGCM(key).decrypt(nonce, ciphertext, None)
    except Exception:
        print("Decryption failed — wrong passphrase, or the file is damaged.")
        return 1

    vault = json.loads(plaintext.decode("utf-8"))

    base = os.path.splitext(file_path)[0]
    json_out = base + "_decrypted.json"
    csv_out = base + "_decrypted.csv"

    with open(json_out, "w", encoding="utf-8") as out:
        json.dump(vault, out, indent=2)

    with open(csv_out, "w", encoding="utf-8", newline="") as out:
        writer = csv.writer(out)
        writer.writerow(
            ["domain", "label", "identity", "method", "provider", "purpose", "api_key", "notes"]
        )
        for entry in vault.get("savedAccounts", []):
            for acc in entry.get("accounts", []):
                method = acc.get("login_method", {}) or {}
                writer.writerow([
                    entry.get("domain", ""),
                    acc.get("label", ""),
                    "; ".join(acc.get("identities", []) or []),
                    method.get("type", "password"),
                    method.get("provider", ""),
                    acc.get("oauth_purpose", "login"),
                    acc.get("api_key", ""),
                    acc.get("notes", ""),
                ])

    print("Decrypted successfully.")
    print("  JSON -> %s" % os.path.abspath(json_out))
    print("  CSV  -> %s" % os.path.abspath(csv_out))
    print("These files are NOT encrypted. Delete them when you are done.")
    return 0


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else input("Path to .llbak file: ").strip()
    sys.exit(decrypt_vault(target))
`

/** Backup envelope identifiers. Read by the import wizard to pick a decoder. */
export const LLBAK_FORMAT = 'loginlens_encrypted_vault_v1'
export const JSON_FORMAT = 'loginlens_json_v1'

/** The three collections that together make up a complete vault. */
export interface VaultBundle {
  savedAccounts: DomainEntry[]
  oauthRegistry: GlobalOAuthAccount[]
  mfaRegistry: GlobalMFAAuthenticator[]
}

/**
 * Both backup builders live here rather than in the export wizard because the
 * exit page writes backups too. When they were written separately the exit
 * page emitted a shape the import wizard could not read — a backup that
 * silently restored as an empty vault, produced at the one moment the user
 * has no second chance to notice.
 *
 * The envelope stays readable JSON even when encrypted, so the importer can
 * identify the file without guessing; everything of substance sits inside
 * `payload`.
 */
export function buildJsonBackup(
  bundle: VaultBundle,
  sliceType = 'all'
): string {
  return JSON.stringify(
    {
      format: JSON_FORMAT,
      version: getExtensionVersion(),
      exported_at: new Date().toISOString(),
      slice_type: sliceType,
      vault: bundle,
      // Duplicated at the top level so older importers, and anyone reading the
      // file by hand, find the collections where they expect them.
      ...bundle
    },
    null,
    2
  )
}

export async function buildEncryptedBackup(
  bundle: VaultBundle,
  passphrase: string,
  sliceType = 'all'
): Promise<string> {
  const inner = {
    ...bundle,
    // Reuse detection compares keyed fingerprints. Without the key a restored
    // vault would recompute different fingerprints for the same passwords and
    // report every account as unique. It only ever travels inside the
    // encrypted blob — never in a plain .json export.
    passwordFingerprintKey: await getRawFingerprintKey()
  }

  return JSON.stringify(
    {
      format: LLBAK_FORMAT,
      version: getExtensionVersion(),
      exported_at: new Date().toISOString(),
      slice_type: sliceType,
      encryption: 'AES-256-GCM / PBKDF2-HMAC-SHA256',
      payload: await encryptData(JSON.stringify(inner), passphrase)
    },
    null,
    2
  )
}

/**
 * The reader half of the two builders above, and the reason they live in the
 * same file: a backup whose collections sit somewhere this function does not
 * probe imports as an empty vault without any error.
 *
 * Backups written by different LoginLens versions nest the same three
 * collections in slightly different places, so every known shape is accepted.
 * `parsed` is untrusted file content — treat every field as possibly absent or
 * of the wrong type.
 */
export function readVaultBundle(parsed: any): VaultBundle {
  const pick = <T,>(...candidates: unknown[]): T[] => {
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate as T[]
    }
    return []
  }

  return {
    savedAccounts: pick<DomainEntry>(
      parsed?.vault?.savedAccounts,
      parsed?.savedAccounts,
      parsed?.saved_accounts,
      parsed?.data?.savedAccounts,
      parsed?.data,
      parsed
    ),
    oauthRegistry: pick<GlobalOAuthAccount>(
      parsed?.vault?.oauthRegistry,
      parsed?.oauthRegistry,
      parsed?.oauth_registry,
      parsed?.data?.oauthRegistry
    ),
    mfaRegistry: pick<GlobalMFAAuthenticator>(
      parsed?.vault?.mfaRegistry,
      parsed?.mfaRegistry,
      parsed?.mfa_registry,
      parsed?.data?.mfaRegistry
    )
  }
}

/** `loginlens_vault_2026-08-09.llbak` */
export function backupFilename(prefix: string, extension: string): string {
  return `${prefix}_${new Date().toISOString().slice(0, 10)}${extension}`
}

export function downloadFile(
  content: string,
  mimeType: string,
  filename: string
): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Escapes a string for CSV compatibility (wrapping in quotes if necessary)
 *
 * Exported because the export wizard writes its own wider CSV and needs the
 * same escaping. It previously wrapped every cell in quotes while only doubling
 * the quotes inside the notes column, so a label like `My "work" account`
 * produced a row no parser could read back.
 */
export function escapeCSV(val: string | undefined): string {
  if (!val) return ''
  const str = String(val)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Converts LoginLens vault data to a standard Browser-Compatible CSV format
 * Chrome/Firefox format: name,url,username,password,note
 */
export function convertVaultToCSV(savedAccounts: DomainEntry[]): string {
  const headers = ['name', 'url', 'username', 'password', 'note']
  const rows: string[] = [headers.join(',')]

  for (const domainEntry of savedAccounts) {
    for (const acc of domainEntry.accounts) {
      const isOAuth = acc.login_method.type === 'oauth'
      const isAPI = acc.login_method.type === 'api-key'
      
      const username = acc.identities?.[0] || ''
      const password = ''
      let note = ''

      if (isOAuth) {
        // The username is already set from identities
        note = `LoginLens: Authenticated via ${acc.login_method.provider || 'OAuth'}`
      } else if (isAPI) {
        note = 'LoginLens: API Key / Token'
      } else {
        if (acc.mfa) {
          note = `LoginLens: Has MFA Setup attached (${acc.mfa.type})`
        }
      }

      const row = [
        escapeCSV(acc.label || domainEntry.domain), // name
        escapeCSV(domainEntry.domain),              // url
        escapeCSV(username),                        // username
        escapeCSV(password),                        // password
        escapeCSV(note)                             // note
      ]
      
      rows.push(row.join(','))
    }
  }

  return rows.join('\n')
}
