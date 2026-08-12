# Importing Passwords

You can bring an existing password export into LoginLens so your accounts are
all in one place.

## Read this first: passwords are not stored

LoginLens imports the *shape* of your accounts — which site, which username,
which login method — and **discards the password itself**. What it keeps is a
keyed HMAC-SHA256 fingerprint, computed with a key generated on your machine
that never leaves it.

That fingerprint is enough to tell you "this password is used on four other
sites". It is not enough to get the password back, by you or by anyone else.
LoginLens is a map of your logins, not a password manager, and an import does
not turn it into one. Keep your existing manager.

---

## Supported exports

Any CSV whose header row contains a recognisable name/URL/username/password
column works. Tested against:

| Source | Where to export from | Columns it writes |
| --- | --- | --- |
| Microsoft Edge | `edge://settings/passwords` | `name, url, username, password` |
| Google Chrome | `chrome://password-manager/passwords` | `name, url, username, password` |
| Bitwarden | Web Vault → Tools → Export Vault → `.csv` | `name, login_uri, login_username, login_password` |
| 1Password | Desktop app → File → Export | `Title, Url, Username, Password` |

Recognised aliases, first match wins:

- **name** — `name`, `title`, `item name`, `display name`
- **url** — `url`, `login_uri`, `website`, `web site`, `urls`, `login_url`, `uri`
- **username** — `username`, `login_username`, `user name`, `user`, `login`, `email`, `email address`
- **password** — `password`, `login_password`, `pass`

LoginLens also imports its own `.json` and encrypted `.LLBAK` backups through
the same wizard.

---

## Exporting from each source

### Microsoft Edge
1. Go to `edge://settings/passwords`.
2. In **Saved passwords**, open the **···** menu.
3. **Export passwords**, confirm with your system credentials.

### Google Chrome
1. Go to `chrome://password-manager/passwords`.
2. **Settings** → **Export passwords**.

### Bitwarden
1. Open the [Web Vault](https://vault.bitwarden.com).
2. **Tools** → **Export Vault**.
3. Choose **.csv**, enter your master password, export.

### 1Password
1. Open the desktop app and select the vault.
2. **File** → **Export** → **All Items…**
3. Choose CSV.

> The exported file is plaintext and contains every password you have. Delete
> it as soon as the import finishes.

---

## Importing

1. Open the popup → **Open Vault Dashboard**.
2. **Settings** → **Data** → **Import Wizard**.
3. Pick the file. The wizard previews how many domains, accounts, OAuth entries
   and MFA entries it found before anything is written.
4. Choose a **Vault Source Tag** — e.g. "Microsoft Edge", "Work laptop". This
   becomes the entry's `vault_source`, which is what the provenance badge in the
   vault displays.
5. Confirm.

---

## How duplicates are handled

An incoming account is treated as the same account when it lands on a domain
you already have **and** matches an existing entry by ID, or by having the same
login method and the same primary identity.

When that happens LoginLens merges rather than duplicates:

- Label, password fingerprint, notes, MFA, endpoint and scope are filled in from
  the import where the import has a value.
- The new source tag is appended to `vault_source`, so an account you have in
  two managers ends up showing both.
- `updated_at` is bumped.

Everything else is added as a new account under its domain.

---

## The review queue

A row is skipped only when it cannot be placed at all — no URL *and* no
username, or a URL that cannot be parsed into anything usable. A missing
password is fine and does not send a row to review; knowing the account exists
is most of the value.

Skipped rows appear under **Needs Review** in Settings → Data, with the reason.
Fill in what is missing and save, or discard them.

---

## Provenance badges

Every imported entry carries a badge showing its source tag, so a year later
you can still tell which export a given account came from.
