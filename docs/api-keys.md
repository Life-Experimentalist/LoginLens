# API Keys Vault

LoginLens isn't just for passwords and OAuth logins; it also features a dedicated, secure vault for developers to manage their API Keys and secrets.

## What it Stores

The API Keys section is designed to safely store:
- API Keys
- Bearer Tokens
- Webhook Secrets
- Personal Access Tokens (PATs)
- AWS Credentials
- Any other developer secrets

---

## How to Add an API Key

Adding a new key to the vault is quick and easy:

1. Open the LoginLens extension and click **Open Vault**.
2. Navigate to the **API Keys** section from the sidebar.
3. Click the **"+ Add New Entry"** button.
4. Fill in the required details:
   - **Domain:** The service provider (e.g., `api.openai.com`)
   - **Title:** A recognizable name for the key (e.g., "OpenAI Production Key")
   - **API Key:** The actual secret value (e.g., `sk_live_...`)
   - **Endpoint (Optional):** The base URL for the API (e.g., `https://api.openai.com/v1`)
   - **Notes (Optional):** Any additional context or usage limits.
5. Click **Save**.

---

## Click-to-Reveal

To protect your secrets from prying eyes (shoulder surfing) or accidental screen shares, all API key values are hidden by default, displayed only as asterisks or dots. 
- Click the **"Eye" (Reveal)** button next to the key to view the raw text.
- Click it again to hide the value.

---

## Copy Button

Efficiency is key for developers. Every API key entry includes a one-click **Copy button** allowing you to instantly copy the secret to your clipboard for easy pasting into your `.env` files or terminal.

---

## Security

Your secrets are exactly that—secret. 
- All API keys are stored entirely locally in your browser using `chrome.storage.local`.
- They are **never** transmitted over the internet, synced to external servers, or logged by analytics.
- If you uninstall the extension, the data is removed.

---

## Common Use Cases

Not sure what to store here? Here are some common examples:
- **OpenAI / Anthropic:** AI API keys
- **Stripe:** Publishable and Secret keys for payments
- **SendGrid / Resend:** Email SMTP tokens
- **GitHub:** Personal Access Tokens for CLI operations
- **AWS:** Access Key ID and Secret Access Key pairs
