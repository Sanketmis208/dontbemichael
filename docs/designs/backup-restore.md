# Back up everything, restore it on a new computer

Owner request, 2026-11-19: "build an ability to take a full back up so that a business owner can restore the setup and content as it is to a brand new computer".

## Decisions (owner, 2026-11-19)

| Question | Answer |
|---|---|
| Saved passwords and keys (locked to this Mac's Keychain) | In the backup, sealed with a backup password the owner sets; re-locked to the new Mac on restore. |
| Which businesses | Everything on this Mac in one backup: every business and the app's own settings. |
| The team's working folders (the business's documents) | Included. |

## What a backup holds

One `.dbmbackup` file (src/main/backupArchive.ts): a gzip stream with a manifest line and each file as a header line plus its bytes, written and read as a stream, so a large documents folder never sits in memory. Node's own zlib, no archive library, the same on every platform.

| Root | What | Restored to |
|---|---|---|
| The app's data folder | config.json, every business's place (`offices/`), knowledge, journals, approvals, dock keys, pasted images, the window's saved state, the old config copy. The list follows factoryReset.ts's own lists (`USER_DATA_ITEMS`), so a new app file is never forgotten. Not: the secrets file, caches, scratch check folders, opened attachments, logs. | The new computer's data folder |
| The database | A consistent snapshot (better-sqlite3 `backup`) taken while the app runs. | harness.db |
| Each office folder | The hive (team, tasks, log, memory), the palace, roster, office.json, Research's desk. Not sockets, links or `.DS_Store`. | The same place under the new home folder |
| Each business and team folder | The documents the team works in; a folder inside another is carried once. Not `node_modules`. | The same place under the new home folder; a file already there is kept |
| The team's Claude conversations | ~/.claude/projects for each agent's folder, so their sessions resume. | Under the folder's new name |
| Saved passwords and keys | Decrypted on this Mac, sealed with the backup password (scrypt, AES-256-GCM: src/main/backupSecrets.ts). | Re-locked to the new Mac (safeStorage) |

## Restore

- From the first setup screen of a new computer ("Moving from another computer?"), or Settings, General, Backup.
- The owner picks the file and sees when it was made and its businesses, then gives the backup password. The password is checked before anything stops: a wrong one changes nothing.
- The office stops (as a reset does), every file goes back, and when the username differs every path under the old home folder moves to the new one: in the app's own JSON files (config, office.json, the registry, the roster) and in the database's office column (`movePathPrefix`). Then the app reopens on the restored office.

## What cannot move

The Claude sign in (the Keychain) and its connectors (the claude.ai account). After a restore the owner signs in to Claude again, and Gmail, QuickBooks and the rest come back with the account.

## Not covered

- A restore onto a computer of another kind (a Mac backup onto Windows): paths are moved only under the home folder.
- Merging a backup into a computer that already has businesses: restoring replaces what is there (the screen says so).
- Files that change while a backup runs are stored as they were when read.

## Tests

test/backup-restore.test.cjs (7 cases: the format round trip with times; a crafted or cut file; the sealed passwords, wrong password and changed file; moving paths; what the app data part carries; a whole computer backed up and restored under another username; the wiring and copy). test/pulse-office-id.test.cjs moves the database's folder keyed rows under Electron's Node.
