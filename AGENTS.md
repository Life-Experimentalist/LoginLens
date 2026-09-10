# Working rules for agents in this repo

## Never delete anything under `build/`

`build/edge-mv3-dev` is loaded as an unpacked extension in the user's Edge. It is
not disposable output. Deleting it, even for a moment, has already cost real data
once:

1. Removing the folder makes the manifest vanish, so Edge drops the extension and
   parks it as a dead entry with no Reload button.
2. The only obvious way out of that state looks like Remove and re-add, and
   Remove is what permanently deletes the extension's storage. That storage is
   the user's vault.

So:

- No `rm -rf build/...`, no `Remove-Item -Recurse build\...`, no clearing the
  directory "to get a clean build". Plasmo overwrites in place and the write is
  atomic enough that the extension is never dropped. Just rebuild.
- Do not move or rename `build/edge-mv3-dev`, or any directory above it. An
  unpacked extension's ID is a hash of its absolute path and this manifest has no
  `key`, so a moved folder means a new ID, and a new ID cannot see the old
  vault.
- Never tell the user to click Remove in `edge://extensions`. Reload, the enable
  toggle, restarting the browser and Load unpacked at the same path are all
  non-destructive. Remove is not.
- If a build directory genuinely has to go, say so first and get an explicit yes.

The vault lives at
`%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Local Extension Settings\<id>\`.
Never read, print or copy its contents into a transcript.

## Never kill node by name

```powershell
Stop-Process -Name "node" -Force
```

This machine runs about 25 `node.exe` processes and they include the agent
session itself and its MCP servers. Kill a specific PID, or stop the specific
background task.

## Do not run `npm run dev`

The user keeps a watcher running. Starting a second one fights it. If the build
output is genuinely stale, say so and let the user restart their own watcher.

## Be thorough

- Verify claims against the code or the filesystem before stating them, and cite
  `file:line`. Do not assert a security or storage property you have not read.
- Before any destructive or hard-to-reverse step, look at what you are about to
  overwrite, and prefer moving it aside over deleting it.
- Finish the whole task. If part of it is blocked, do the rest and say plainly
  what was left and why.

## Back the vault up before touching anything that could cost it

```bash
npm run vault:backup
```

Copies the extension's LevelDB store out of the browser profile into
`%USERPROFILE%\LoginLens-vault-backups\<timestamp>\`, keeping the last 10. It
finds the extension by the unpacked path recorded in the browser's
`Secure Preferences`, so it still works when the entry is a stub with no
manifest, which is the state that started the 2026-09-10 incident.

`npm run vault:restore` with no arguments lists the backups and the IDs the
browser currently knows about. `node scripts/vault-restore.mjs --to <id>` puts
a backup back, and `<id>` does not have to be the ID the backup came from: the
store contains no copy of the extension ID, so the folder name is the whole of
the binding. Restore refuses to run while the browser is open, refuses to write
into an ID the browser has never registered, and moves any existing store aside
rather than deleting it.

Restore also reads the target's `manifest.json` and refuses unless
`homepage_url` matches the `homepage` field in `package.json` and the name
contains "LoginLens". Backup discovery deliberately stays loose (it has to find
a stub entry with no manifest at all), but a loose match on the *write* side
would accept any unpacked extension loaded from a folder with "loginlens" in
its path and copy the whole vault into it.

This covers an ID change and an uninstall. It does not cover losing the disk,
and it does not stop a program running as this user from reading either the
store or a backup: `chrome.storage.local` is not encrypted at rest, so both are
plaintext, and both hold the cloud-sync passphrase when cloud sync is on
(`src/core/utils/cloud-sync.ts:24-27`). The off-machine answer, and the only
one that is encrypted, is the `.LLBAK` export
(`src/core/utils/export.ts:232`), openable at
https://loginlens.vkrishna04.me/decrypt.

`.claude/settings.json` asks before `rm -rf build*` and friends. That is a
backstop with holes in it (a `cd build` first slips past a prefix match), so
the rules above are still the actual protection.
