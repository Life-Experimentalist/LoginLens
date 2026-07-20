# Privacy & Architecture

LoginLens is built with a privacy-first mindset. This document outlines our architectural decisions and data handling practices.

## Zero-Server Architecture

LoginLens operates on a strict **Zero-Server Architecture**. 
- There is no backend server.
- There is no external database.
- There is no API communication to LoginLens servers.
- There are no analytics or telemetry trackers.

**All data stays entirely local on your machine.** Your credentials never leave your browser.

---

## What Data is Stored

The extension uses `chrome.storage.local` to persist your data. Here is the primary structure of what is stored:

- **`saved_accounts`**: An array of domain entries containing the identity profiles, usernames, and passwords (or OAuth references) you have saved.
- **`oauth_registry`**: A global list categorizing your OAuth identities by provider (e.g., all Google logins).
- **`debug_mode`**: A boolean flag indicating if developer logging is enabled.
- **`always_record_oauth`**: A boolean flag tracking your preference for automatic OAuth detection.
- **`is_recording_oauth`**: A transient boolean flag used to manage active manual recording sessions.

---

## Permissions Justification

To function correctly, LoginLens requires specific browser permissions. Here is exactly why each is needed:

- **`storage`**: Required to read and write your vault data to the local browser storage (`chrome.storage.local`).
- **`tabs`**: Required to monitor tab navigation. This is essential for detecting Single Page Application (SPA) routing, allowing the extension to inject the OAuth scraper at the right time.
- **`clipboardWrite`**: Required to power the UI's "Copy" buttons, allowing you to easily copy passwords and API keys to your clipboard.
- **`host_permissions` (`https://*/*`)**: Required to inject the content script (`universal-scraper.ts`) into the pages you visit. This is strictly used to identify and capture OAuth flows globally across the web.

---

## MV3 Compliance

LoginLens is fully compliant with **Chrome Manifest V3 (MV3)**. 
MV3 introduces strict architectural changes designed to improve user privacy, security, and browser performance.
- We utilize **Service Workers** instead of persistent background pages, ensuring the extension only consumes memory when actively performing a task.
- We adhere to all remote code execution policies (all code is bundled natively).

---

## Data Export and Deletion

You own your data. At any point, you can completely wipe all data stored by the extension:
1. Open the Vault and navigate to **Settings** -> **Data Management**.
2. Click **Clear Local Vault**.
This action will instantly purge all records from `chrome.storage.local`.

---

## Open Source Audit

Trust is earned through transparency. LoginLens is 100% open-source. 
Every single line of code can be reviewed, audited, and verified by the community on our GitHub repository: 
[github.com/krishnalsh2004/LoginLens](https://github.com/krishnalsh2004/LoginLens)
