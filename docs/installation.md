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

1. Navigate to the [Releases page](https://github.com/krishnalsh2004/LoginLens/releases) and download the latest `.zip` file for your browser (Chrome, Edge, or Firefox).
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
- [Node.js](https://nodejs.org/) (Version 20+)
- [pnpm](https://pnpm.io/) (Version 8+)

### Build Instructions

1. **Clone the repository:**
   ```bash
   git clone https://github.com/krishnalsh2004/LoginLens
   cd LoginLens
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Build the extension:**
   Depending on your target browser, run one of the following commands:
   - For **Chrome (MV3)**:
     ```bash
     pnpm build
     ```
   - For **Firefox**:
     ```bash
     pnpm build --target=firefox-mv3
     ```
   - For **Edge**:
     ```bash
     pnpm build --target=edge-mv3
     ```

4. **Load the extension:**
   Follow the manual installation steps above, but load the generated build folder (e.g., `build/chrome-mv3-prod/` or the respective browser folder).

---

## First Time Setup

After successfully loading the extension:
1. Click the **puzzle piece icon** in your browser's toolbar to view your extensions.
2. Find **LoginLens** and click the pin icon to keep it visible on your toolbar.
3. Click the LoginLens icon to open the popup.
4. From the popup, click on **Open Vault** to view your dashboard and begin managing your accounts and API keys.

---

## Permissions Explanation

LoginLens requests certain permissions during installation. We value your privacy and security. **All data stays entirely local, and nothing is ever sent to external servers.**

Here is why we need each permission:
- **`storage`**: Used to securely save your vault data, accounts, and settings locally on your machine.
- **`tabs`**: Used to detect tab navigation for single-page applications (SPA) to ensure OAuth captures trigger correctly.
- **`clipboardWrite`**: Allows the extension to provide one-click "Copy" functionality for passwords and API keys.
- **`host_permissions` (`https://*/*`)**: Needed to run the content script across all pages to auto-detect OAuth flows and capture authentication details locally.
