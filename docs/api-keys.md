# API Keys Vault

Alongside passwords and OAuth logins, LoginLens has a section for developer
secrets: API keys, bearer tokens, webhook secrets, personal access tokens, and
cloud credential pairs.

## Adding a key

1. Open the LoginLens popup and click **Open Vault Dashboard**.
2. Choose **API Keys** in the sidebar, under **Vault**.
3. Add a new entry and fill in:
   - **Domain** — the service, e.g. `api.openai.com`
   - **Title** — a recognisable name, e.g. "OpenAI production key"
   - **API Key** — the secret itself
   - **Endpoint** *(optional)* — base URL, e.g. `https://api.openai.com/v1`
   - **Scope** *(optional)* — e.g. "Read-only", "Admin", "Billing"
   - **Notes** *(optional)*
4. Save.

---

## Reveal and copy

Key values are masked by default so a screen share or a passer-by does not
collect them. Click the eye icon to reveal a value, and the copy button to put
it on the clipboard — that button is what the `clipboardWrite` permission is
for.

---

## Where the keys actually live

This is the part worth reading carefully, because "stored locally" is only the
default, not the whole story.

**By default:** keys are stored in `chrome.storage.local` on this device, in the
same `saved_accounts` structure as the rest of the vault. Nothing leaves the
machine, and no network request carries them.

**If you turn on encrypted sync** (Settings → Data → Cloud Sync, off by
default): API keys are part of the synced payload. The payload is compressed and
encrypted with AES-256-GCM under a key derived from your sync passphrase
*before* it is written to `chrome.storage.sync`, and only then replicated by the
browser vendor — Google for Chrome, Microsoft for Edge, Mozilla for Firefox.
The vendor stores an opaque blob. Anyone without your passphrase, including the
vendor, cannot read it. If encryption fails or no passphrase is set, the upload
is abandoned rather than sent in the clear.

**Values are not encrypted at rest on the local device.** Anything with access
to your unlocked browser profile — you, another user of the same OS account, or
software running as you — can read `chrome.storage.local`. That is the same
level of protection a browser's own saved-password store gives, and it is worth
knowing before you put a production root credential in here.

---

## Uninstalling

Removing the extension deletes its local storage, including every API key.

It does **not** delete a synced copy, if you turned sync on. To remove that,
use **Settings → Data → Export & Leave** and choose to delete the synced copy
before you uninstall. The [uninstall page](https://loginlens.vkrishna04.me/uninstall)
covers the same ground, because that is the moment people remember to ask.

---

## What to keep here

- **AI providers** — OpenAI, Anthropic keys
- **Payments** — Stripe publishable and secret keys
- **Email** — SendGrid, Resend, SMTP tokens
- **GitHub** — personal access tokens
- **Cloud** — AWS access key ID and secret pairs

For credentials whose compromise would be unrecoverable, prefer a dedicated
secrets manager with hardware-backed keys. LoginLens is designed for the long
tail of developer keys that otherwise end up in a plaintext note.
