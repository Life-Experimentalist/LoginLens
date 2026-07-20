# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-07-18
### Added
- **Global OAuth Registry**: A centralized registry for managing OAuth identities and linking them to websites.
- **Relational Cascading**: Editing an identity in the Global Registry instantly cascades the update to all connected domains.
- **Google Linked Apps Scraper**: Automatically detects and imports all apps connected to your Google Account.
- **Pluggable Scraper Architecture**: Future-proof handler system to quickly add new OAuth scrapers for different providers (Microsoft, GitHub, etc).
- **MFA & Provenance Tracking**: Keep track of imported passwords (e.g., Edge vs Chrome) and document the exact MFA hardware or app used for a specific account.
- **MDX Documentation**: The landing page now hosts the project documentation using MDX.

### Changed
- Dashboard UI completely redesigned with Framer Motion, dark theme gradients, and responsive grids.
- Added Multi-select and Bulk Delete capabilities.
- Importer deduplicates based on exact identities to avoid redundant entries.

### Fixed
- Chrome grayscale icon issue resolved by binding `chrome.action.onClicked`.
- "Access other apps" Private Network Access warning eliminated by removing HMR WebSocket from the production builds.
