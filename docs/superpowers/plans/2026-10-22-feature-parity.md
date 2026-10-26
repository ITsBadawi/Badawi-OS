# Badawi OS feature parity implementation plan

**Goal:** Implement and verify the full feature list supplied in `C:/Users/ahmu0/Desktop/BADAWI_OS_FEATURES.md`.
**Architecture:** Extend the existing Electron host, validated commands, SQLite records and React UI. Enforce policy in the host; keep project source read-only while allowing reviewed Git operations and scoped work-file management. External integrations must expose real evidence and timestamps.
**Execution:** Native implementation in this session, already authorized by the owner. Preserve the current release and owner data. Do not treat a passing component test as full product completion.

## Constraints and review focus
- Windows desktop; local Node.js scheduler; no Docker, n8n or paid server.
- Google Drive is the only permanent backup destination. Temporary preparation is permitted.
- No AI code edits, unrestricted shell, or new external writes without the appropriate preview/approval.
- Test time zones/DST, fixed deadlines, restart idempotency, stale approvals, path links/aliases and provider/account failures.
- Fixture tests must be identified separately from real account verification. Never ship credentials or owner data.

## Requirements and implementation units
- [ ] Added goal: official Sign in with ChatGPT, OS-encrypted sessions, streaming provider and separate identity/plan consent. Implemented in the working tree with SDK/native fixture evidence; real owner consent/account request still unverified. See `docs/SIGN-IN-WITH-CHATGPT.md`.
- [ ] Dashboard: pinned items, work context, Arabic/English, assistant side panel and command search. Files: `src/ui/main.tsx`, `Dashboard.tsx`, translation module; tests: renderer navigation and persistence.
- [ ] AI: preserve adapters, sources, memory, approved actions and costs; integrate all new bounded tools. Files: `core/assistant.ts`, `chat.ts`, `providers.ts`, UI. Verify independent provider protocols and live credentials when available.
- [ ] Tasks: List/Calendar/Kanban, day/week, flexible scheduling proposals, recurrence, daily overdue review and fixed deadlines. Files: `core/tasks.ts`, `contracts.ts`, `core/service.ts`, `ui/Tasks.tsx`; tests: `tests/task-planning.test.ts` plus native task UI flows.
- [ ] Projects/Git: create/import/clone, metadata and technologies, remote comparison, reviewed Commit/Push, actual evidence. Files: new integration adapters, `core/git.ts`, `Workspace.tsx`; test local bare remote and official API fixtures, then linked accounts.
- [ ] Files: separate managed Files and Projects roots, local index by type/content, folders, reviewed move/rename, classification, logical links and optional intake Inbox. Add scoped host module and UI; test actual temporary files, traversal, links, collisions and unchanged project source.
- [ ] Backups: include/exclude sets, unchanged-content reuse, compressed encrypted snapshots, retention previews/protection, selective restore, Drive capacity/expiry reminders. Extend backup/Drive modules and Settings; test exact bytes, interruption, retention protection and actual Drive round trip.
- [ ] Automation: add conditional rules and new integration/file/backup tools to existing triggers, durable receipts and safe retries; verify missed schedules and app restarts.
- [ ] Engine: preserve modes and safe points; add explicitly configured game process detection and restoration of prior state. Test process transitions without FPS benchmarking (deferred by owner).
- [ ] Policy: explicit read/auto/approval/forbidden registry and owner configuration, scoped grants, invalidation and receipts. Test denial and stale-preview paths.
- [ ] Verification/analytics: acceptance criteria, evidence records, review/unverified/completed distinction, project/task/activity reports with source and verification time. Do not execute arbitrary project test scripts.
- [ ] Integrations: GitHub, Drive, Gemini/OpenAI and optional Vercel/Railway monitoring with protected credentials and bounded adapters. Verify unavailable credentials as blocked live checks rather than fabricated success.
- [ ] Full acceptance: run core/security suite, build, native end-to-end tests, real account checks possible with existing authorization, migration/persistence and package verification. Produce a requirement-by-requirement evidence matrix and new downloadable build. All unchecked requirements keep the goal active.

## Immediate task interfaces
Task scheduling uses `saveTask(store, command, now?)` for transactional saves/completion/recurrence and fixed-deadline enforcement, `taskCalendar(rows, start, days, zone)` for list/calendar grouping and `dueTasks(store, now)` for durable reminders plus daily overdue digest. New fields travel through `taskExtras`, approved AI commands and the editor; existing partial updates preserve them. UI view/date selection is local and does not rewrite task data.

1. Write tests proving recurrence creates one next occurrence, fixed dates require explicit confirmation, partial saves preserve data, reminders are durable and the daily overdue digest does not repeat.
2. Observe expected failures, implement host behavior, run targeted and full tests.
3. Add List/Calendar/Kanban and day/week controls, recurrence/fixed fields and reviewed AI scheduling entry. Build and verify actual renderer interactions.
4. Continue all remaining units above. Package only after the full acceptance audit.

## Working checkpoint — 23 October 2026

Scheduled integration jobs/steps and Dashboard context/pins now have behavioral and actual native UI/restart evidence. See `docs/SCHEDULED-INTEGRATION-MONITORING.md` and `docs/DASHBOARD-CONTEXT-AND-PINS.md`. The complete core suite has 173 passing tests, with a successful source build. These are working-tree changes; all full acceptance boxes remain open until their complete requirement and release evidence is available.

Next implementation: complete the Files central catalog and optional Inbox classification workflow using the existing managed Files roots, `fileEntries`, safe listing/index and reviewed move operations. Inspect existing name/type/content filters before adding duplicate mechanisms. Separate work-file navigation from code/project reading without breaking project-linked file navigation or the explicitly registered legacy roots. Never import files from outside an owner-selected source or classify/move bytes without the appropriate review. Verify actual binary/text fixtures, metadata/link consistency, scope revocation, missing files, restart and restored records. Then continue safe retries, reviewed Commit/Push, game detection, localization and full acceptance.

## Working checkpoint — central files and restored workspaces

The central catalog, Inbox classification/move workflow, source/code browser separation and reviewed managed-workspace restore/reconnect now have current behavioral and actual Electron evidence. A selected-file source audit also restricts automatic file tools without reducing independently granted project access. The complete core suite has 181 passing tests and the built renderer loads the catalog/reconnect assets on demand. See `FILES-CENTRAL-CATALOG.md` and `MANAGED-WORKSPACE-RESTORE.md`. The full release remains open.

Next implementation: complete Arabic/English localization across renderer navigation, dialogs, labels and operational feedback, preserving owner note/chat/file content. Persist an explicit owner language setting, update document direction/date formatting and local host-generated messages without translating private content or sending it to a provider. Static module-level label maps must resolve again after changing language. Verify actual language switching/restart, English task/chat/files/backup/permissions flows, Arabic fallback and compact layouts. Continue safe retries, reviewed Commit/Push, configured-game detection and all remaining acceptance/release requirements afterward; no full-scope requirement is removed.

Localization inventory is now authoritative in `docs/validation/localization-source-inventory.json`, generated by `node scripts/localization-inventory.mjs`: 1423 distinct source strings/templates, including 1369 UI keys, 39 core keys and 19 desktop keys (some keys occur in several areas). The installed TypeScript 7 package does not expose `createSourceFile`; the working extractor uses the already installed Prettier TypeScript parser instead. Use this source inventory for complete coverage, then exclude/handle deliberate parser/technical separators rather than silently omitting visible English translations. This inventory was the initial baseline. The subsequent localization implementation and its current evidence are recorded below.

## Working checkpoint — Arabic and English

The persisted owner language setting, full current 1,429-key dictionary, renderer/host localization, LTR/RTL logical layout and locale-aware dates/numbers are implemented. The complete core suite has 186 passing tests and the current build succeeds. Native tests use a separate synthetic profile, verify actual page switching and restart, and preserve original Arabic owner text. See `docs/ARABIC-AND-ENGLISH.md` and `docs/validation/localization-desktop.json`. The earlier packaged release remains unchanged.

Next: bounded safe retry and reviewed partial-workflow continuation, missed-run operational acceptance, reviewed Commit/Push and configured-game detection. The final audit must also remove the legacy desktop updater’s permanent local pre-update database copy to respect Drive-only permanent backups. All full acceptance/release boxes stay open; owner real SIWC eligibility remains unverified.

## Working checkpoint — bounded integration retries

Opt-in, bounded automatic connection retries now run through the existing engine and preserve actual attempt receipts. Full core suite: 195 passing tests; build passes. Four actual Electron editor/timer/cancel/restart checks and the four-check scheduled integration regression pass. See `SAFE-AUTOMATION-RETRIES.md`. Automatic retries deliberately exclude AI, backups and workflow steps; reviewed partial-workflow continuation remains required. The source inventory now has 1,441 current Arabic string/template keys with complete English entries.

Continue with owner-reviewed partial-workflow recovery: bind every reused successful step to its definition/source and actual Inbox/Drive receipt, preserve history, show remaining steps and uncertain effects, require explicit acknowledgement before repeating an uncertain effect, and never replay completed prefixes. Preview/apply must be bounded, expiring, one-use, owner-only and invalidated by scope/receipt changes. Verify actual partial failure, restart, no duplicate successful prefix, revoked grants and native review/cancel. Then continue reviewed Commit/Push, configured-game detection, the updater Drive-only fix and full acceptance/release. Do not substitute the read-retry tests for full workflow recovery.

## Stop checkpoint — reviewed workflow continuation, 23 October 2026

The owner explicitly requested finishing the current unit and then stopping. Reviewed partial-workflow continuation is implemented and verified: unchanged successful prefixes reuse actual bound receipts, remaining steps require a fresh owner-only review, uncertain effects require acknowledgement, and whole-workflow replay requires additional confirmation. Expiring single-use approvals, history, restart/mode gates, bounded assistant run context and truthful Drive session status are covered. See `docs/REVIEWED-WORKFLOW-CONTINUATION.md`.

Evidence at stop: 207 passing core tests, then six targeted passing service tests after a test-only typing correction; successful type-check/build; four actual Electron review/cancel/restart/continuation checks with no renderer errors. Current localization inventory has 1,471 fully covered source keys. Controlled transports and synthetic profiles do not establish live linked-account acceptance.

Work is paused here. No Git Commit/Push implementation, configured-game detection, new implementation phase or packaging was started after the stop request. Remaining scope includes reviewed Commit/Push; configured game detection (FPS benchmarking still deferred); private/empty clone and cancellation acceptance; final scheduled file/backup and missed-run audit; removal of the legacy permanent local pre-update database copy; live provider/SIWC/CI/deployment acceptance; and the combined security, migration, packaging and release audit. Existing owner 0.3.0 executables and data remain unchanged. A new versioned distributable is still required before the owner can use the source additions in the installed program.