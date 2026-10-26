# Badawi OS 0.3.0 — verification against the accepted plan

Updated 2026-10-22. The owner authorized all functional gaps in one integrated update; FPS benchmarking remains deferred. Historical 0.2 reports are retained separately. No invented completion percentage or public-production claim.

| Requirement | Working implementation | Evidence / practical boundary |
|---|---|---|
| FR01 Smart Dashboard | Actual SQLite state, overdue tasks, pending approvals, engine, backup status, planning and project shortcuts | Native UI and persistence checks; remote availability needs a real connection check |
| FR02 Files/Projects | Explicit Workspace path + native picker, root/relink/remove, folders, text/image/metadata previews, separate export, bounded name/text search | Real temporary source and binary files; secrets/dependencies/links excluded; no source editing |
| FR03 Project Manager | Read-only allowlisted Git and local reports, source evidence in conversation, opted-in change monitoring and event hooks | Real Git/file fixtures; no commit/push/shell/code execution |
| FR04 Providers/AI | Independent Gemini/OpenAI keys, authenticated model discovery, real connection check, persistent app-aware chat, bounded read rounds, exact-command approvals, host receipts, editable memory | Real Gemini actions and cross-chat task/memory recognition; 3.8 returns 503, 2.5 succeeds; OpenAI fixture-only |
| FR05 Automation | Six kinds including up to eight sequential steps; manual/once/daily/weekly/events; reviewed grants, real timers, durable per-step runs and Inbox | Real native timer, workflow effects and source-change event checks; bounded registry, no arbitrary executable steps |
| FR06 Engine | Shared admission, Running/Pause/Stop, epochs, single heavy worker, cancellation/drain, startup Stop, tray controls | Core and native regressions; extended disk-full/clock-jump fault matrix not complete |
| FR07 Gaming | Existing overlay and safe admission preserved | FPS/resource benchmarks deferred by owner |
| FR08 Backups | Drive-only AES-GCM snapshots plus selected source/assets, hashes/exclusion manifest, resumable upload and fresh-folder restore | Real Drive 514,888-byte synthetic round trip, interruption/reopen/refresh/resume, exact restored files; second computer/account-loss drill untested |
| FR09 Permissions | Validated IPC, OS secrets, scoped roots, source/provider-bound plans/grants, source relink invalidation, bounded tools, request/USD caps | Security/core tests; not a kernel sandbox against another process under the same Windows account |
| FR10 Audit | Chained local log, approval/action/receipt/read/notification events, validity and sanitized export | Chain mutation tests; not tamper-proof against same-account filesystem control |
| FR11 Offline | Notes, rich tasks, memories, project metadata, local previews/search/controls and local recipes | No cloud required for local features; remote failures remain visible, uncertain usage not automatically retried |
| FR12 Recovery | Uncertain runs/plans marked for review, no replay, single instance, local update checkpoint, separate restore folder | Process restart and schema migration checks; public signed installer/auto-updater absent |

## Current test evidence

- 92 unit/security/integration checks pass, including approved chat effects and tool reads, project-relink revocation, source capture/restore, monitoring/events, rich tasks, provider discovery, budgets, encryption, SQLite, Git, OAuth listener and Drive receipt handling.
- `validation/complete-desktop.json`: real Electron renderer/IPC/SQLite/filesystem flows, workspace path, images/folders/export, rich task board, approval card, memory, workflow steps, hidden-window reminder timer, persisted preferences, compact layout and restart. Only external AI transport is controlled; diagnostic mode suppresses OS notification/tray/startup/install effects.
- `validation/chat-desktop.json`: 13 native conversation/recipe/timer checks with controlled AI transport.
- Desktop regression suite and final packaged checks recorded in validation files with executable version/date; historical reports remain historical.
- `validation/assistant-live.json`: authenticated Google listing; 3.8 actual generation 503; successful real Gemini 2.5 exact-command task/memory proposal, approval/effects/continuation and new-chat context. Synthetic data only.
- `validation/drive-live.json`: seven real-account checks, synthetic application records plus selected text/binary source. Tokens refreshed, same remote object resumed, downloaded hash matched, recovery key restored exact content. Owner source was not uploaded. Test cloud objects retained, not silently deleted.

## Operational checks for the owner

1. Open Files, add your real Workspace path, read a file, search text and export a separate copy. Original files must remain unchanged.
2. Choose the desired AI model in Settings, start engine, test connection, then ask for a task and memory. Before approval no mutation; afterward verify Tasks/Settings and the receipt. Open a new chat and ask what was saved.
3. Create a near-future reminder; keep engine Running, hide window and check Inbox/Windows. Windows Focus Assist or notification settings may suppress banners. Stop/Pause prevents maintenance; Run resumes checks. Notification preference is independent.
4. Save a two-step workflow, run it, inspect each receipt. Enable a completion event and finish a task. Monitor a test project, modify an allowed source file outside Badawi, verify local alert/event after at most one minute.
5. Approve exact note sources and dated budget for scheduled AI. Editing notes or provider invalidates the grant; no unapproved background generation.
6. Select only desired project backup sets. Run backup; verify status, restore into a new folder and compare source/assets. Secrets must be absent and restored jobs/root grants disabled. Independently retain recovery key.
7. Test tray Exit, optional login launch, shortcut creation and local update on your Windows configuration. App starts Stopped at login by design. Do not treat notification dispatch as proof Windows displayed a banner.

Not claimed: signed/public distribution, automatic online updater, clean second-computer account recovery, exhaustive disk-full/suspend/clock fault testing, live OpenAI account, incremental token streaming, unlimited whole-drive indexing/backup, arbitrary automation tools or writable project code. The integrated app is usable within its explicit capabilities; these external/release boundaries are not presented as completed tests.
