import { Storage } from "@plasmohq/storage";

// Create a local storage instance
// By default, Plasmo uses chrome.storage.sync which has an 8KB per-item limit.
// We switch to "local" to support large JSON blobs like 500+ passwords.
export const extensionStorage = new Storage({
  area: "local"
});
