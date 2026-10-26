# Dashboard context and pinned items

Implemented 23 October 2026 in source/build; the preserved 0.3.0 package is unchanged.

The owner can choose Today/priorities, one registered project, or Review. These are display preferences, available even while the engine is stopped. They change the task/project/automation/alert selection while preserving page structure and every source record, schedule and permission. Project context includes directly linked jobs and workflow/condition scopes. If the focused project is removed or archived, the dashboard explicitly shows it as unavailable and does not broaden to all projects.

Open tasks sort by overdue state, priority, due date and stable ID. Review includes overdue tasks and completed claims without current verified evidence. Evidence is compared against the task's present project context and fingerprint; changing task meaning invalidates the prior accepted result. The dashboard shows the distinction in its task list.

Attention findings use actual overdue tasks and cached GitHub/deployment receipts, with their original check time or an explicit never-checked state. They do not initiate requests or infer live remote health. The backup card selects a verified receipt for the currently connected Drive account and selected project, rather than displaying a different account's historical copy.

Up to 20 unique task/project/note/automation references can be pinned. Titles resolve from current records, and the owner can preview the exact item's content and open its section. Pins remain visible across contexts, as stated in the interface. Deleted/archived targets become unavailable references with an unpin control. The local SQLite settings preserve pins/context across restart; no source file is copied or changed. These display settings are not currently included in backup exports.

The assistant receives bounded dashboard metadata (context, up to ten pin titles and attention findings), never pinned note bodies merely because they were pinned. Context is not a new read grant. Dashboard preference commands are owner-only and cannot be proposed/executed as assistant tools.

## Verification

- Four behavioral tests in `tests/dashboard.test.ts` cover scoped data, real priority sorting, non-mutating reads, missing targets, idempotent/bounded pins, evidence freshness, current Drive account selection, historical source timestamps, no note-body disclosure and denial of AI preference writes.
- Four actual Electron checks in `docs/validation/dashboard-desktop.json` cover project filtering, exact note preview, review of unverified completion, restart persistence, unavailable project handling, unpin, compact-width layout and absence of provider/cloud requests. Screenshot visually inspected.
- The five-check native side-assistant regression passes after the context metadata integration.

Full English localization and the remaining feature-parity/release requirements remain unfinished. This document does not claim full Dashboard acceptance or an updated installed release.
