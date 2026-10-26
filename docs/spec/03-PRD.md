# PRD — Product Requirements
## Problem and intended outcome
The owner needs a simple center for personal files, projects, AI assistance, and lightweight automation without costly operating infrastructure. While gaming, the owner needs background workers to stop consuming substantial resources. Success means knowing what is happening, why a job is delayed, what needs approval, and how to stop work safely.

## Primary user journeys
1. Select a folder using the operating system picker; view its project, tasks, and allowed files without scanning the entire disk.
2. Ask about a project's status; receive a short answer supported by file/line and Git references without changing code.
3. Ask to "summarize my notes every evening"; AI produces a draft automation. Preview time, time zone, sources, provider, outgoing content, and estimated cost before approving and enabling it.
4. Enable Gaming Mode; see what stopped and what is reaching a safe boundary. Later, review deferred jobs without a burst of automatic catch-up work.
5. Connect Drive, select a backup set, and restore a verified backup into a new directory.

## Functional requirements and acceptance criteria
- FR01 Smart Dashboard: show engine/Gaming status, current/upcoming/deferred work, approvals, backup state, and latest verification. Stale information carries a timestamp. Opening the dashboard does not require AI.
- FR02 Files/Projects: explicit roots, bounded filename/text search, safe previews, tasks, notes, and links. Removing a root revokes access and invalidates related pending plans.
- FR03 Project Manager: evidence-based local summaries; status/log/diff through an allowlist; distinguish verified observations from AI suggestions. No source modification or code execution.
- FR04 Providers: independent Gemini/OpenAI setup; provider/model selection per automation; optional connection checks; visible usage, costs, and errors. The product works without any key.
- FR05 Automation: draft/preview/enable/disable; manual, once, daily, and weekly triggers; steps from a limited tool registry; run history, checkpoint recovery, and visible permission impact.
- FR06 Engine: Running/Pause/Stop with waiting reasons and transition states. UI remains usable in Stop. Run Now uses the same admission gate.
- FR07 Gaming: no new heavy background work; safely drain existing work. Once quiescent, no background AI, indexing, backup, or synchronization. Leaving Gaming cannot override Pause/Stop or silently execute all missed jobs.
- FR08 Backup: Google Drive only; encryption before upload; consistent database snapshot; manifests, hashes, and restore testing. Exclude OAuth/API secrets.
- FR09 Permissions: deny by default; grants scoped to resource, action, destination, and validity period. Approval binds the exact plan, not the model's identity or persona.
- FR10 Audit: link proposal, authorization, execution, and verification; export sanitized errors and outcomes.
- FR11 Offline: local projects, notes, search, and engine control remain available. AI/Drive show WaitingNetwork without blocking the UI.
- FR12 Recovery: after a crash, do not automatically repeat ambiguous writes or external effects. Multiple windows must not duplicate jobs.

## Nonfunctional requirements
These are proposed acceptance targets, not measurements already obtained from the owner's device.
- NFR01: acknowledge a visible mode change within 250 ms under normal conditions. Admission closes in a transaction before success is acknowledged, even when worker quiescence takes longer.
- NFR02: after quiescence in Pause/Stop/Gaming, zero heavy workers and zero new background AI requests. Average application CPU at most 1% of total system capacity over five stable minutes; document the hardware.
- NFR03: combined application RSS target at most 350 MiB in Gaming/Stop; hidden UI must not render continuously. If Electron misses the target, measure the cause and review the shell decision before expanding features.
- NFR04: Gaming target: median FPS loss at most 3%, and 1% low FPS loss at most 5%, versus an equivalent baseline after stabilization. These are test-device acceptance limits, not a universal guarantee.
- NFR05: one heavy worker by default; no AI polling. Initial scanning is user initiated, bounded by file/time limits, and cancellable.
- NFR06: UTF-8; persist times in UTC and schedules with an IANA zone. Asia/Baghdad is a proposed editable initial zone.
- NFR07: keyboard access, visible focus, textual status rather than color alone, Arabic/RTL with LTR technical text, 200% zoom, and a 1366×768 display.

## Usable vertical MVP
Three recipes are enough: summarize selected notes into the in-app Inbox; create a read-only project status report with evidence; perform a scheduled Drive backup after appropriate grants. All use the same engine, modes, and audit path. Timers and backups do not require AI.

## Definition of Done
Acceptance criteria and critical tests pass using offline fakes; small live smoke tests run only with the owner's approval and credentials; an actual backup/restore drill succeeds in a dedicated Drive test area; performance is measured; known unresolved issues are documented; and a Windows build runs. A UI mockup or fake integration is not a finished application.
