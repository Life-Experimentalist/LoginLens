# Password Importing Guide

LoginLens allows you to import your existing passwords from popular browsers and password managers so you can consolidate your digital identity in one place.

## Supported Formats

We currently support importing `.csv` (Comma Separated Values) files from the following sources:
- **Microsoft Edge** (.csv) — exported from `edge://settings/passwords`
- **Google Chrome** (.csv) — exported from `chrome://settings/passwords`
- **Bitwarden** (.csv) — exported from your Web Vault
- **1Password** (.csv) — exported from the 1Password desktop app

---

## How to Export from Each Browser/Manager

Follow these steps to generate the `.csv` file you'll need for importing.

### Microsoft Edge
1. Open Edge and navigate to `edge://settings/passwords`.
2. Look for the "Saved passwords" section.
3. Click the **three dots (···)** next to the "Add password" button.
4. Select **Export passwords** and confirm with your system credentials.

### Google Chrome
1. Open Chrome and navigate to `chrome://settings/passwords` (or `chrome://password-manager/passwords`).
2. Click the **three dots (···)** or settings icon in the passwords list.
3. Select **Export passwords** and follow the prompts.

### Bitwarden
1. Log in to your Bitwarden Web Vault at [vault.bitwarden.com](https://vault.bitwarden.com).
2. Go to **Tools** from the top navigation.
3. Select **Export Vault**.
4. Choose **.csv** as the File Format.
5. Enter your master password and click **Export**.

### 1Password
1. Open the 1Password desktop application.
2. Select the vault you want to export.
3. Go to **File** -> **Export** -> **All Items...**
4. Select the `.csv` format and complete the export.

---

## Import Steps in LoginLens

Once you have your `.csv` file ready, follow these steps to bring your data into LoginLens:

1. Open the LoginLens extension popup and click **Open Vault**.
2. Navigate to **Settings** -> **Data Management**.
3. Click the **Import CSV** button.
4. A file picker will appear. Select the exported `.csv` file from your computer.
5. Enter a **Source Label** (e.g., "Microsoft Edge", "Personal Bitwarden"). This label becomes the `vault_source` tag, helping you identify where the data originated.
6. The import will process, and your entries will seamlessly appear in the Vault.

---

## Deduplication

To keep your Vault clean, LoginLens uses smart deduplication during import. 
- If an imported entry shares the exact same **domain** and **username** as an existing entry in your vault, LoginLens will **not** create a duplicate.
- Instead, it appends the new source tag (e.g., `Microsoft Edge`) to the existing entry's notes or tags.

---

## Review Queue

Occasionally, exported CSVs contain incomplete data. If an entry is missing crucial information (like a missing username or password), LoginLens will skip standard import for that item.
- These skipped items are sent to the **"Needs Review"** section in your Vault.
- You can manually review these items, fill in the missing details, and save them, or discard them if they are obsolete.

---

## Source Provenance Badges

Every entry imported into the Vault will feature a visual **source badge**. This badge displays the source label you provided during import (e.g., `Google Chrome`), ensuring you always know the provenance of your credentials.
