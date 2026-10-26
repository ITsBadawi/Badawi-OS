# Google Drive-only Backups and Restore
## Scope
Drive is the sole cloud backup destination. Local application data remains authoritative; temporary staging is preparation, not a second backup service. No two-way synchronization, OneDrive/Dropbox, or Git-as-backup. Gaming controls the application's Drive worker, not an independently installed Drive desktop client.
Default backup contents: SQLite snapshot, application notes/tasks, nonsecret settings, and manifest. Source-code files require a separate opt-in backup set with explicit roots/exclusions/size preview. Exclude API/OAuth/session secrets, encryption keys, raw logs, caches, node_modules/build, secret files, and content outside approved roots. Never delete the previous valid backup while constructing its successor.

## Authentication and authorization
Real integration requires a Google Cloud project, enabled Drive API, and Desktop OAuth client. Use the system browser, Authorization Code + PKCE/state, and a temporary localhost loopback redirect listener; close it afterward. This is not a permanent operating server. Do not use an embedded login webview. Store refresh tokens in the OS secret store and expose disconnect/revoke.
Public distribution may require consent-screen/verification work depending on project status. Do not assume exemption or indefinitely valid testing tokens.
Proposed scope: `https://www.googleapis.com/auth/drive.file` for a backup folder/files created by the app. Do not request full-Drive access. The broker also restricts account/folderId, since the OAuth scope alone is not a folder boundary.
For restore on another device, the user shares/selects the relevant backup files/manifest through a scope-compatible Picker/access flow. Do not assume the app can list all of Drive. Prove this clean-device journey before release.
References: [Desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app), [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

## Encryption and recovery keys
Encrypt locally with authenticated encryption such as AES-256-GCM through vetted libraries. Use unique nonces per artifact/chunk. Bind backupId, schemaVersion, chunk order, sizes, and hashes in authenticated metadata. Store the random key in the OS secret store; explicitly export an independent recovery kit for the owner to keep outside the backup's Drive location. Do not upload the key or put it in the same encrypted archive.
Before first backup activation, confirm recovery-kit preservation and perform a test decrypt. Losing both the device-bound key and recovery kit means losing restore ability; explain this clearly at setup. Sensitive manifest contents are encrypted. Remote filenames are opaque backup IDs, not personal filenames. Expose only the minimal format/crypto information needed for recovery.

## Pipeline and states
planned → snapshotting → packaging → encrypting → uploading → verifying → complete; side states checkpointed, failed, needsReview. Uploaded is not equivalent to restorable.
1. Preview the backup set, size, disk availability, grant, and effective mode.
2. Create a consistent SQLite snapshot with the Online Backup API or another tested supported mechanism. Never directly copy a live database with WAL. See [SQLite Backup API](https://sqlite.org/backup.html).
3. For source files, hash/stat before and after reading. Changed files get bounded retry or explicit exclusion/incomplete status. Do not claim an atomic snapshot of an externally changing repository. Database consistency is guaranteed by the chosen mechanism; other files are best-effort unless the user freezes changes.
4. Produce bounded chunks and checksums; encrypt into local staging. Disk-full errors preserve the previous backup.
5. Use resumable upload with stable backupId and pending files. Query session state after interruption. If a session expires, reconcile remote file IDs before creating a replacement to avoid duplicate logical backups.
6. Verify remote size/checksum where available and download-verify the first backup, then according to policy. HTTP 200 alone is insufficient. Publish a completion marker bound to manifest/all chunks after their integrity is established. Only label complete-verified after download, authentication/decryption, and manifest/hash checks. Otherwise show "uploaded — restore verification pending" and retain the previous valid backup as the trusted reference.
7. Clean staging only after completion or an explicit isolated-partial cleanup policy. Preserve evidence during needsReview.
Protocol reference: [Drive resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads). Choose protocol-compliant chunks small enough for responsive draining; handle session expiration explicitly.

## Pause/Stop/Gaming during backups
Close admission immediately. Complete the current transaction/chunk or reconcile an ambiguous request, then persist a checkpoint without claiming success. Pause retains resumable work; Stop exits its worker after saving progress. Gaming suspends compression/encryption/upload/heavy verification at the nearest safe boundary.
Resume revalidates local artifact/hash, permission, account, and session. Continue safely or rebuild an incomplete artifact with a new attempt identifier linked to the original. Keep the older valid backup intact.

## Safe restore
Restore only into a new empty user-selected directory in the MVP. Bounded download → ciphertext checks → authenticated decrypt → manifest/schema/hash checks → safe extraction against traversal/symlinks/decompression bombs → SQLite integrity_check → preview → open as a separate workspace.
Do not overwrite a live database or existing project. Never restore credentials or automatically enable restored automations. Restored schedules start disabled and the engine starts Stopped; reconnect API/Drive accounts and regrant access explicitly. A different device needs the correct recovery kit.

## Retention
Proposed policy: retain seven complete-verified backups only after an explicit deletion grant; otherwise no automatic pruning. Protect the last valid and user-pinned backups. Prefer Drive trash where applicable; no automatic permanent deletion. Full quota yields a clear failure without losing the previous backup, expanding scope, or selecting another provider. Record restore, revoke, and deletion actions in audit.
