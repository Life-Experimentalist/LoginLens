import { Storage } from '@plasmohq/storage'

// ---------------------------------------------------------------------------
// Shared storage instance — chrome.storage.local.
// ---------------------------------------------------------------------------
// Local (not sync) because the vault regularly exceeds the 8KB-per-item and
// 100KB-total limits that chrome.storage.sync imposes. Opt-in cloud sync is
// handled separately, and encrypted, in core/utils/cloud-sync.ts.
//
// NOTE: this module used to monkey-patch Storage.prototype.get so that any
// error whose message merely *contained* the substring "JSON" caused the key to
// be deleted from chrome.storage.local. That silently destroyed user vaults on
// transient or unrelated errors, and it deleted from `local` even for
// sync-area instances. Corrupted values are now handled non-destructively in
// core/storage/native.ts, which reports them and returns undefined without
// touching what is on disk.
// ---------------------------------------------------------------------------

export const extensionStorage = new Storage({
  area: 'local'
})
