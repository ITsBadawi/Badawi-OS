# Managed workspace restore and reviewed reconnection

Implemented 23 October 2026 in source/build; the preserved owner 0.3.0 application is unchanged.

Full and selected restoration of an archive whose project record has `kind: workfiles` now writes its exact file bytes under:

`<new restore directory>/workspaces/<stable workspace ID>/Files/`

An empty sibling `Projects/` is created. Ordinary code-project archives retain their existing `<restore directory>/projects/<project ID>/` layout. Older snapshots remain readable. The encrypted snapshot format/row IDs are unchanged. Restore receipts and the Backup interface show the resulting managed-workspace directories. These folders are restored artifacts, not a local permanent backup destination.

A full restored database keeps project roots disconnected and AI read, backup and monitoring permissions explicitly false. Automation definitions remain disabled without their grants. It never silently reconnects old absolute source paths, provider credentials or account sessions. Source caches are not restored.

The Files page offers **Reconnect existing or restored file workspace**. The owner enters the parent containing actual Files and Projects directories and requests a preview while the engine is Running and outside Gaming. The host inspects the existing layout without creating/moving files, refuses linked folders and overlapping code/work-file roots, and reports classified paths that are present/missing plus logical links to project IDs that no longer exist.

Only a fresh, one-use, five-minute preview can be applied. It is bound to the project metadata, exact canonical layout and current permitted file manifest. Changed files/layout/metadata/source scope require a new preview. Applying changes only registry state: it preserves the workspace ID, valid tags/classifications/project links and missing-path metadata, removes the reviewed broken project references, clears old source caches, leaves AI/backup/monitoring false and disables related automation definitions/grants for review. It does not change the original or restored file bytes. A normal project-folder relink cannot bypass this managed-workspace review.

This is a review of paths and logical references, not a claim that all original files were restored or cryptographically matched to an earlier backup. Missing/truncated listings are explicit. The owner can re-enable source permissions and review affected rules after reconnecting. Reconnection previews do not survive restart. These commands remain owner-only, outside the assistant tool set.

## Evidence

- Three core/service tests in `workspace-relink.test.ts` and `workspace-relink-service.test.ts` use actual backup bytes/full+selected restore, SQLite, files, a Windows junction, changed manifests, overlapping roots, cancellation, stale/replayed approval, metadata reconciliation, audit verification and disabled grants/rules.
- Four actual Electron checks in `docs/validation/workspace-relink-desktop.json` start from a real restored database, inspect/cancel, refuse a changed preview, reconnect/read exact bytes, preserve valid metadata and missing-path records, and restart without replay or network requests. The screenshot was visually inspected.
- The seven-check controlled Drive/backup native regression and the central-catalog native regression pass after this layout/reconnect integration. No owner cloud copy or source directory was modified.

## Single-file AI scope audit

Selecting one file for a conversation now sends only its actual line-numbered text initially, without sibling listings/Git status. Automatic catalog/list/search/read tools stay within that file unless an independent project AI-read grant exists. Broader file/Git reads require an exact approval card. Selected project conversations can still use their explicitly selected project scope. The policy UI also no longer advertises automatic deployment reads that its host would reject.

`chat-file-scope.test.ts` proves the five tool paths and independently granted broader access through actual chat/service dispatch with controlled provider responses. The seven-check central-catalog native test includes a real file-discussion UI and two controlled provider rounds; indexed sibling names/content do not enter outgoing requests. A selected-file label is shown separately from a project summary. These tests do not claim a live provider account request.

The complete core suite has 181 passing tests, and the source build succeeds. Final combined acceptance, remaining full-scope features and a new versioned release are still unfinished.
