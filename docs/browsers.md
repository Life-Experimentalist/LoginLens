# Multi-Browser Support

LoginLens is designed to work across the modern browser ecosystem using standard WebExtension APIs.

## Supported Browsers

- ✅ **Google Chrome** (v88+, MV3)
- ✅ **Microsoft Edge** (v88+, MV3)
- ✅ **Firefox** (v109+, MV3 via `firefox-mv3` build target)
- ✅ **Opera** (Chromium-based, install the Chrome build)
- ⚠️ **Safari** (Limited — Web Extensions API support varies, not officially packaged)
- ⚠️ **Brave** (Chromium-based, fully functional using the Chrome build)

---

## Building for Each Browser

LoginLens uses a modern build system (powered by Plasmo) to generate browser-specific bundles from the same codebase.

Run these commands from the root of the repository:

```bash
# Build for Google Chrome, Brave, Opera
pnpm build

# Build for Mozilla Firefox
pnpm build --target=firefox-mv3

# Build for Microsoft Edge
pnpm build --target=edge-mv3
```
Build outputs will be generated in the `build/` directory, categorized by target (e.g., `build/firefox-mv3-prod/`).

---

## Firefox Specific Notes

While Chrome and Edge share the Chromium engine, Firefox requires slight adjustments:
- **API Namespace:** Firefox officially uses the `browser.*` namespace instead of `chrome.*`. Fortunately, our build framework handles this abstraction automatically.
- **Development Loading:** To load an unpacked extension in Firefox for testing:
  1. Navigate to `about:debugging`.
  2. Select **This Firefox**.
  3. Click **Load Temporary Add-on...**
  4. Select the `manifest.json` file located in your Firefox build output folder.
- **Release Requirements:** For a public release, Firefox extensions must be signed via the Mozilla Add-on Developer Hub.

---

## Cross-browser Storage

LoginLens heavily utilizes local storage for the Vault. 
- We use `chrome.storage.local` across the codebase.
- When targeting Firefox, this API is seamlessly polyfilled via the `webextension-polyfill` library (managed by Plasmo). The behavior and data persistence remain consistent across all supported browsers.

---

## Known Limitations

**Safari (macOS / iOS)**
Safari supports Web Extensions, but the packaging and distribution process is fundamentally different. 
- Safari requires wrapping the extension inside a native macOS app using Xcode.
- Because of this requirement and minor differences in the WebKit implementation of MV3 background scripts, Safari is **not yet officially supported or released**. Developer testing is possible but requires a Mac environment.
