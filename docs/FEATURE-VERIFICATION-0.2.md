# Badawi OS 0.2 — functional verification against the plan

Updated: 2026-10-22 (0.2.1). FPS testing is deferred by the owner. This document separates actual local/native behavior, controlled provider fixtures, live account evidence, and remaining release gates. It does not assign an invented completion percentage.

## Changes that close the largest functional gaps

The former one-shot assistant was replaced by a persistent conversation page. Each follow-up sends the prior conversation, including native signed model items where required. Conversations survive a full process restart. Selected notes, project evidence and bounded source excerpts are disclosed before Send; no whole-repository upload occurs. Cancellation and interrupted/failed attempts stay visible and require deliberate retry.

The previously absent note-summary recipe now uses the same scheduler/admission path as reminders, local project reports and Drive backups. Its grant binds selected note content and provider profile. Source/profile changes disable it. A grant revoked during generation cannot publish a verified result. A dated owner-configured daily spend cap and conservative atomic reservation are required for background AI. Failed/unknown outcomes remain reserved.

AI may propose a supported automation from a conversation. The host rejects extra tools, executable commands, unknown fields, invalid schedules and sources not already selected. The UI opens an unsaved disabled draft; the owner reviews and saves/enables it. This is not an unrestricted autonomous agent.

## Requirement map

| Requirement | Actual implementation and evidence | Boundaries / remaining work |
|---|---|---|
| FR01 Smart Dashboard | Actual SQLite state, engine modes, upcoming work, tasks, project links, last verified backup and audit. Native desktop test exercises dashboard and restart. | Advanced aggregate monetary/approval cards are spread across Settings/Automations; stale remote account state cannot be represented as proven availability. |
| FR02 Files/Projects | Native root selection, bounded scans, safe read-only previews, local notes/tasks, filename and bounded text search with file/line evidence. Actual fixture files and source hashes checked in native/core tests. | Text search is deliberately bounded, not a whole-disk or unlimited repository index. |
| FR03 Project Manager | Five fixed read-only Git wrappers against a real fixture repository; local status reports. Selected file/project evidence can be discussed in chat with line labels. | AI explanations are suggestions; line claims are not automatically a formal proof. No project code is executed or modified. Advanced worktrees/configurations remain refused. |
| FR04 Providers | Separate Gemini/OpenAI credentials/models, visible usage/limits/budget, actual last successful connection time. Both mappings have protocol tests. Gemini has live conversation evidence. | Live OpenAI access was not supplied. Gemini 3.8 currently returned 503; success on Gemini 2.5 is not misreported as success on 3.8. Text replies complete as a response; incremental token streaming is not implemented. |
| FR05 Automation | Draft/save/enable, manual/once/daily/weekly with IANA/DST, missed policies, bounded queue, run history, four supported recipes. Actual Node timer executes a once reminder; native test also traverses approved summary → provider fixture → Inbox → verified run. | A general visual multi-step workflow builder is outside these four recipes. |
| FR06 Engine | Running/Pause/Stop, epoch checks, single admitted job, cooperative cancellation/draining; Run Now uses the same gate. Startup Stop and uncertain-run recovery tested. | Extended disk-full/clock-jump/suspend matrix remains a release gate. |
| FR07 Gaming | Existing independent overlay and admission behavior retained and regression tested. | FPS/resource benchmarks deliberately deferred, not claimed passed. |
| FR08 Drive backup | Real OAuth/PKCE/drive.file implementation, native Desktop-client JSON import, AES-GCM logical snapshots, resumable chunks, stable file IDs, download/decrypt/hash/schema verification, fresh-folder restore. Controlled interruption/resume/restore and legacy/new chat snapshot tests pass. | Owner-approved Desktop OAuth is configured and connected. A real synthetic 513,986-byte backup passed first-chunk interruption, reopened-state resume with the same file ID, refresh-token exchange, listing, download/hash/decrypt and restore into a new database. See validation/drive-live.json. Clean-device OAuth/account recovery and real quota/session expiry remain untested. Optional source-code backup sets and retention deletion are absent. |
| FR09 Permissions | Strict IPC, scoped native roots, denylisted secret/link files, explicit chat Send disclosure, separate content/profile-bound background grants, budget admission. Restores strip external grants and credentials. | These are app boundaries, not a kernel sandbox against another malicious process using the same Windows account. |
| FR10 Audit | Hash-linked local events, validation indicator, sanitized JSON export, mutation receipts and unknown-outcome holds. Actual native export verified. Worker errors are reduced to safe codes before storage. | The audit is local evidence; no external trusted checkpoint or tamper-proof guarantee. |
| FR11 Offline | Notes/tasks/search/engine remain local. Provider failures/timeouts are visible and do not fabricate content or automatically replay a paid request. | AI and Drive naturally require network. Network failures are surfaced for deliberate retry, rather than autonomous delayed retransmission. |
| FR12 Recovery | Unique scheduled occurrences, single instance, request receipts, interrupted runs/turns marked for review, no blind replay. Backup restore creates a new database with disabled schedules. | Full destructive fault injection, signed updates and distribution hardening remain release gates. |

## Live Gemini account checks

- The official models endpoint accepted the supplied key and listed `gemini-3.8-flash`.
- Minimal synthetic Gemini 3.8 generation requests returned HTTP 503 through both Interactions and generateContent. A Gemini 3.7 diagnostic also returned 503. These failures are disclosed; there is no silent model substitution.
- A Gemini 2.5 Flash generateContent request returned HTTP 200 with real token usage.
- A real Electron conversation test with that explicitly selected diagnostic model passed: Send → actual Google response → follow-up remembers a previously supplied number → process exit/relaunch → complete transcript persists. See `validation/chat-live.json` for the exact completed checks. The product default stays Gemini 3.8 Flash.
- The extended live suite also passed a real selected-note summary, real usage settlement, an unsaved disabled structured proposal, and an explicitly reviewed save. The report contains 10 successful checks with no errors.

Only synthetic test content was sent. No real project files or personal notes were uploaded during these diagnostics. The key is not included in source/build/report/screenshot artifacts. Test credentials use the normal OS-encrypted path in disposable workspaces.

## Reproduce

`npm test`, `npm run build`, `npm run test:desktop`, `npm run test:chat`. Native diagnostics create isolated workspaces and actual Electron windows; only the slow external transport is replaced in fixture runs. They do not mock the renderer bridge, SQLite or OS secret store. The chat test's brief visible captures avoid stale hidden-window compositor screenshots.

For a live Gemini test, provide `BADAWI_TEST_GEMINI_KEY` in a private process environment and deliberately choose `BADAWI_TEST_MODEL`. Do not write the key to source, command-line arguments or committed files. `BADAWI_PACKAGED_EXE` selects the packaged build. Production uses the real transports; fixture injection exists only inside test scripts.

## Real Drive diagnosis and fix

The first live chunk test exposed a genuine integration defect hidden by constructed Response fixtures: fetch with redirect:error rejects Google HTTP 308 receipts as an unexpected redirect. The adapter now uses redirect:manual, exposing receipts without following any redirect. The regression test uses an actual local HTTP 308 response; it failed before the fix and passed afterwards. The live drill then passed with the unmodified real transport. Cloud test objects were retained, not deleted. Owner notes/code were not uploaded during that drill.
