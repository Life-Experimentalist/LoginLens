/**
 * The running extension's version, read from the manifest.
 *
 * Always read it from here rather than typing a literal — hardcoded version
 * strings drift the moment package.json is bumped, and they end up stamped
 * into exported backups and telemetry where the wrong value is misleading.
 */
export function getExtensionVersion(): string {
  try {
    return chrome.runtime.getManifest().version
  } catch {
    return '0.0.0'
  }
}

/**
 * Safely checks if the Chrome extension context is still valid.
 * Returns false if the extension has been reloaded/invalidated.
 */
export function isExtensionContextValid(): boolean {
  try {
    // Accessing chrome.runtime.id throws if the context is invalidated
    return typeof chrome !== 'undefined' && !!chrome.runtime?.id
  } catch {
    return false
  }
}

/**
 * Wraps chrome.runtime.sendMessage with full error handling for:
 * - Extension context invalidated (hot reload during dev)
 * - No background listener (service worker sleeping)
 * - Any other runtime error
 *
 * Returns null on any failure instead of throwing.
 */
export function safeSendMessage<T = any>(
  message: Record<string, unknown>,
  onResponse?: (response: T | null) => void
): void {
  if (!isExtensionContextValid()) {
    onResponse?.(null)
    return
  }

  try {
    chrome.runtime.sendMessage(message, (response: T) => {
      // Check for runtime errors without throwing
      if (chrome.runtime.lastError) {
        // Suppress the error — it's expected during dev hot-reloads
        onResponse?.(null)
        return
      }
      onResponse?.(response)
    })
  } catch {
    // "Extension context invalidated" ends up here when the SW is gone
    onResponse?.(null)
  }
}
