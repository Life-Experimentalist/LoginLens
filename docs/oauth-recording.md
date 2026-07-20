# OAuth Recording Guide

This guide explains how LoginLens seamlessly records and manages your OAuth sign-ins.

## What is OAuth?

OAuth (Open Authorization) is a technology standard that allows you to sign into websites using an existing account (like Google, Apple, or GitHub) without creating a new password. When you click "Sign in with Google" on a new app, you are using OAuth (and often OIDC - OpenID Connect). LoginLens helps you keep track of all the apps you have connected to your various accounts.

---

## Automatic Recording Modes

LoginLens provides two primary modes for capturing your OAuth sign-ins:

### 1. Manual Record Mode
- Open the LoginLens popup and click the **Record** button.
- Proceed to log in via OAuth on the website you are visiting.
- The extension temporarily watches the OAuth flow and captures the identity (your email) and the app you authorized.

### 2. Always-on Mode
- For a seamless experience, enable **"Always Auto-detect OAuth"** in the Vault Settings under General.
- No button clicks are needed! Every time you perform an OAuth flow, LoginLens will automatically detect and capture it in the background.

---

## How it Works Technically

Under the hood, LoginLens uses a robust content script approach:
1. **Universal Scraper:** The extension runs a content script (`universal-scraper.ts`) on all URLs you visit.
2. **Pattern Detection:** When it detects an OAuth URL pattern (e.g., `/o/oauth2/`, `/login/oauth/authorize`), it extracts the `redirect_uri` parameter to identify WHICH app is requesting access.
3. **Identity Capture:** It reads the signed-in email or identifier from specific page attributes (like `data-email`, `data-identifier`) and the DOM text.
4. **Local Storage:** The captured data triplet—`{identity, provider, redirectApp}`—is securely saved to `chrome.storage.local`.
5. **SPA Awareness:** For modern single-page applications (SPAs), the extension intercepts `history.pushState` and `history.replaceState` to detect navigations without a full page reload.

---

## Supported OAuth Providers

LoginLens actively monitors the following providers (and their typical detection URLs):
- **Google**: `accounts.google.com`
- **GitHub**: `github.com/login/oauth`
- **Microsoft**: `login.microsoftonline.com`
- **Apple**: `appleid.apple.com`
- **Discord**: `discord.com/oauth2`
- **Facebook**: `facebook.com/dialog/oauth`
- **LinkedIn**: `linkedin.com/oauth`
- **Twitter/X**: `twitter.com/i/oauth2`
- **Slack**: `slack.com/oauth`
- **Generic**: The scraper also attempts to detect generic OAuth flows on any URL containing `?client_id=` alongside `/oauth` or `/authorize`.

---

## Google Linked Apps Scanner

If you want to retroactively capture apps you've already authorized with Google:
1. Visit [myaccount.google.com/linkedapps](https://myaccount.google.com/linkedapps).
2. LoginLens will automatically scan the page.
3. It imports all currently connected apps directly into your vault, correctly associating them with your logged-in Google email.

---

## Multi-Account Support

LoginLens is built to handle users with multiple accounts. It doesn't just capture the first account it sees; it captures ALL signed-in accounts during the flow. For example, on Google properties, it analyzes the `data-email` attributes on account chip elements to map exactly which identity was used for the authorization.

---

## Recording Banner

Whenever LoginLens is actively recording an OAuth flow, a **blue banner** will appear at the top of the OAuth consent page. If you decide you do not want the extension to capture the current flow, simply click the **Stop** button on the banner to cancel recording immediately.

---

## Troubleshooting

**What if an OAuth isn't detected?**
- Ensure "Always Auto-detect OAuth" is enabled, or that you manually clicked Record.
- Refresh the page and try clicking the OAuth sign-in button again.
- If it's a very niche or custom OAuth provider, it might not match the generic patterns. You can add the entry manually from the Vault interface.
- Check if you are on a Single Page App that hijacked the navigation before the script could initialize. Usually, a refresh resolves this.
