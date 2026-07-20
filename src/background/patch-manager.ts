import { storage } from "../core/storage";

const PATCH_URL = "https://raw.githubusercontent.com/krishnalsh2004/LoginLens/main/patches.json";

export async function checkPatches() {
  const lastUpdate = await storage.get<number>("last_patch_update") || 0;
  const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

  if (Date.now() - lastUpdate > ONE_MONTH_MS) {
    try {
      const response = await fetch(PATCH_URL);
      if (response.ok) {
        const patches = await response.json();
        await storage.set("active_patches", patches);
        await storage.set("last_patch_update", Date.now());
        console.log(`Updated to patch version: ${patches.version}`);
      }
    } catch (e) {
      console.log("Failed to fetch patches, keeping current version.");
    }
  }
}
