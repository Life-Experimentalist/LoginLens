# Installation Guide

Welcome to LoginLens! This guide covers everything you need to know to install and configure LoginLens on your browser.

## Prerequisites

LoginLens is built on Manifest V3 (MV3) and supports modern browsers. Ensure your browser meets the following minimum version requirements:
- **Google Chrome**: Version 88 or higher
- **Microsoft Edge**: Version 88 or higher
- **Mozilla Firefox**: Version 109 or higher

---

## Installation from GitHub Releases

For the easiest installation, you can download the pre-compiled version of the extension from our GitHub Releases page.

1. Navigate to the [Releases page](https://github.com/Life-Experimentalist/LoginLens/releases) and download the latest `.zip` file for your browser (Chrome, Edge, Brave, Opera, or Firefox).
2. Extract the downloaded `.zip` file to a folder on your computer.

### Google Chrome
1. Open Chrome and navigate to `chrome://extensions`.
2. Toggle the **Developer mode** switch in the top right corner.
3. Click the **Load unpacked** button.
4. Select the extracted folder containing the extension files.

### Microsoft Edge
1. Open Edge and navigate to `edge://extensions`.
2. Toggle the **Developer mode** switch in the bottom left or top right corner.
3. Click the **Load unpacked** button.
4. Select the extracted folder containing the extension files.

### Mozilla Firefox (For Development)
1. Open Firefox and navigate to `about:debugging`.
2. Click on **This Firefox** in the sidebar.
3. Click the **Load Temporary Add-on...** button.
4. Navigate to the extracted folder and select the `manifest.json` file.

---

## Building from Source

If you prefer to build the extension from source, or want to contribute to the project, follow these steps.

### Prerequisites
- [Node.js](https://nodejs.org/) 22 or newer
- npm (ships with Node.js)

### Build Instructions

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Life-Experimentalist/LoginLens
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the extension** for your browser — `build:chrome`, `build:edge`,
   `build:brave`, `build:opera`, `build:firefox`, `build:firefox-mv2` or
   `build:safari`:
   ```bash
   npm run build:chrome
   ```

4. **Load the extension:**
   Follow the manual installation steps above, but load the generated build
   folder — `build/<target>-prod/`, e.g. `build/chrome-mv3-prod/`.

See [Multi-Browser Support](./browsers.md) for per-browser notes.

---

## First Time Setup

After successfully loading the extension:
1. Click the **puzzle piece icon** in your browser's toolbar to view your extensions.
2. Find **LoginLens** and click the pin icon to keep it visible on your toolbar.
3. Click the LoginLens icon to open the popup.
4. From the popup, click **Open Vault Dashboard** to view your dashboard and begin managing your accounts and API keys.

---

## Permissions Explanation

LoginLens requests certain permissions during installation. **There is no LoginLens server, no account, and no telemetry — nothing is sent to us, ever.** Two things can leave your device, and both are off until you turn them on: fetching real site favicons from Google (Settings → Interface), and cross-device sync, which encrypts the vault with your passphrase and hands the ciphertext to your browser's own sync. See [privacy.md](./privacy.md) for the detail.

Here is why we need each permission:
- **`storage`**: Saves your vault, accounts, and settings locally on your machine.
- **`tabs`**: Detects tab navigation, including single-page-app routing, so an OAuth sign-in can be tied back to the site that started it.
- **`clipboardWrite`**: Powers the one-click "Copy" buttons for usernames and API keys.
- **`alarms`**: Runs the daily check that writes a local restore point when your vault has changed.

LoginLens requests **no host permissions**. Its content scripts are declared
statically in the manifest, which is what the browser describes at install time
as "read and change your data on websites you visit".

See [PERMISSIONS.md](../PERMISSIONS.md) for the full breakdown, including the
permissions LoginLens deliberately does not request.
