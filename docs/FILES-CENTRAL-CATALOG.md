# Central file catalog and Inbox classification

Implemented 23 October 2026 in source/build, not the preserved 0.3.0 release.

`file_catalog` is an additive local SQLite cache beside the existing text `file_index`. It contains only permitted file metadata from currently registered roots. It is not an application-record table and never enters backup exports. Name/catalog refresh uses the existing protected scanner; text indexing keeps its existing 1000-file/16-MiB/32,768-character-per-file limits. Linked paths, secrets, dependencies and files above the scanner's 8-MiB file limit are excluded; a large-file-limited catalog is explicitly marked limited.

The central search distinguishes Files workspaces, Projects code readers and all registered sources. It filters paths/names, extension, current classification, exact tags, linked project and Inbox membership. Classification/project links come from the live `fileEntries` registry, not a second copied metadata store. Source/result pagination covers all registered sources rather than presenting a bounded page as an exhaustive search: ten source roots per page and up to 100 results per command (UI uses 50). Source selection can address any registered root directly.

Content matches carry actual indexed line/snippet and a separate text-index timestamp. They require the metadata manifest's modification stamp to match the text cache's stamp. Missing/mismatched indexes are counted as unindexed, and partial text indexes are labeled. Both metadata and text are historical caches, not proof that a file still exists or has unchanged current content. Refreshing the catalog removes deleted entries. Opening a result binds its catalog timestamp/current root and then uses the existing actual safe preview; stale catalogs/changed roots are refused. Missing files show an actionable refresh message and do not leave old preview content displayed as a successful new read. Late UI responses are discarded after source/filter changes.

Refresh requires Running and no Gaming, shares the existing engine/cancellation gate and publishes the requested metadata batch only after all source grants are rechecked. Cancellation/source revocation preserves prior complete catalogs. Existing file moves invalidate catalog and content cache; their logical classification/project links follow the reviewed destination. Content-index publication also now rechecks its source scope before committing.

The native Inbox workflow is **Organize Inbox → search unclassified Inbox files → open real preview → save classification/tags/project links → optionally preview and confirm a move**. No file is automatically moved, copied into a project or sent to AI. Projects open through a separate read-only browser selection; work-file mutation controls appear only for managed Files. Existing explicitly registered legacy roots remain readable.

The assistant's read-only `files.catalog` searches only selected or AI-authorized roots during automatic read rounds. Results add each examined source to durable chat grant provenance, so later revocation blocks resending its earlier evidence. An owner may change the tool's policy; refreshing/indexing remains outside assistant tools. Pinning/classifying a file never grants AI read access. Source-code writes/general shell remain forbidden.

## Evidence

- `tests/file-catalog.test.ts`: real text/binary fixtures, file/code scope separation, exclusion, metadata filters, Inbox, indexed snippets, cancellation/revocation, changed roots, deleted files, source/result paging and stale text refusal.
- `tests/file-catalog-service.test.ts`: actual service/engine gate, real two-round chat dispatch through controlled provider transport, denied-root exclusion, durable read provenance, revocation before another provider call, cache exclusion from backups, stale-preview refusal and deleted-file error.
- `docs/validation/file-catalog-desktop.json`: seven actual Electron checks for refresh gating, real Inbox classification, reviewed move preserving exact bytes/metadata, filtered new path, indexed content, read-only code, restart and actual missing-file handling. The screenshot was visually inspected.
- Existing six-check `workfiles-desktop.mjs` and eighteen-check `complete-desktop.mjs` regressions passed. The complete core suite has 181 passing tests and the source build succeeds. Existing upstream lucide-react directive warnings remain.

All native evidence uses isolated synthetic profiles/files; it does not touch owner project files or claim a live AI/cloud request. Managed backup/relink reconciliation is now implemented with evidence in `MANAGED-WORKSPACE-RESTORE.md`. Full English localization and final release/feature acceptance remain unfinished.
