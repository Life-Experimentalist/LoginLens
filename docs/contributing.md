# Contributing to LoginLens

First off, thank you for considering contributing to LoginLens! We welcome community contributions, bug fixes, and new features.

## Getting Started

To get your local development environment set up:

1. **Fork the repository** on GitHub.
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR-USERNAME/LoginLens
   cd LoginLens
   ```
3. **Install dependencies** (Requires Node.js 20+ and pnpm 8+):
   ```bash
   pnpm install
   ```
4. **Start the development server:**
   ```bash
   pnpm dev
   ```
   This command starts the build process with live reload. Load the unpacked extension from the `build/chrome-mv3-dev/` folder into your browser.

---

## Project Structure

LoginLens is structured to keep UI components separated from core logic. Here is a high-level overview:

```text
src/
├── contents/         # Content scripts (e.g., universal-scraper.ts injected into pages)
├── core/
│   ├── scrapers/     # OAuth Handler registry and individual provider handlers
│   ├── storage/      # Chrome storage schemas, types, and configuration
│   └── utils/        # Shared utilities (Logger, CSV parser)
├── components/
│   ├── ui/           # Reusable UI components (Sidebar, WebsiteCard, AccountModal)
│   └── views/        # Larger page structures for Vault views
├── tabs/             # Full-page tab definitions (e.g., vault.tsx)
└── popup.tsx         # The main extension popup UI
```

---

## Adding a New OAuth Provider

If you want LoginLens to automatically recognize a new OAuth provider (e.g., a specific enterprise SSO provider), you need to update the scraping logic.

### 1. Update the Content Script
Modify `src/contents/universal-scraper.ts`. Locate the `extractOAuthInfo()` function and add a new `else if` block for the provider's domain.

```typescript
// Example inside extractOAuthInfo()
else if (url.includes('example.com/oauth/authorize')) {
  provider = 'Example Provider';
  const urlParams = new URLSearchParams(window.location.search);
  redirectApp = urlParams.get('client_id') || 'Unknown App';
}
```

### 2. (Optional) Create a Custom Handler
For complex providers that require heavy DOM parsing to extract the user's email, create a dedicated handler:
1. Create a new file in `src/core/scrapers/handlers/`.
2. Export a class implementing the `ScraperHandler` interface.
3. Register the handler in the main scraper registry.

---

## Code Style

We enforce strict formatting and linting to maintain codebase quality.
- We use **ESLint** and **Prettier**.
- Before submitting a pull request, ensure your code passes checks:
  ```bash
  pnpm lint
  pnpm format
  ```

---

## Testing

Currently, testing relies on manual verification. 
- Make sure to test your changes with the extension loaded in developer mode.
- If you modify OAuth scraping logic, manually perform an OAuth flow with that provider to verify the banner appears and the data is captured correctly in the Vault.

---

## Pull Requests

When you are ready to submit your changes:
1. Ensure your fork is up to date with the upstream repository.
2. Target the **`main`** branch for your Pull Request.
3. Provide a clear and descriptive PR title.
4. In the PR description, explicitly describe **what** you changed and **why**.
5. Wait for a maintainer to review your code.
