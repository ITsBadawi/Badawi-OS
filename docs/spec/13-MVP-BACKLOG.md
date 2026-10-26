# MVP Backlog and Delivery Gates
Estimates are relative sizes S/M/L, not promises of days or token cost. Do not start M0 without explicit implementation authorization. The Antigravity launcher supplies M0 authorization when intentionally sent by the owner. Milestones depend on preceding gates, and the owner may stop development after any gate.

## M0 — Foundation and safety boundaries
- B01 [P0/M] Validate the stack, Windows/runtime support, SQLite ABI compatibility, module layout, lockfile, and build/typecheck/test commands. No silent system installation or account connections. Acceptance: a locally runnable build and documented prerequisites.
- B02 [P0/M] Sandboxed renderer, typed IPC, and a secret-store interface. Acceptance: T18/T19-relevant foundation cases using fixture secrets; no renderer disk/general-network authority. Do not claim later full security cases are complete before their features exist.
- B03 [P0/M] SQLite migrations/transactions, EngineState persistence, and initial audit events. Acceptance: migration/recovery/uniqueness checks and initial Stopped state.
M0 gate: a working foundation without API keys; initial RSS/CPU measurements. If shell overhead substantially exceeds the resource budget, review that decision before further construction. A full scheduler or AI/Drive integration is not part of M0.

## M1 — Engine control and scheduling first
- B04 [P0/L] Running/Pause/Stop, epochs, cooperative cancellation, and worker lifecycle. Acceptance: T01–T04/T08 with fixture work, no AI.
- B05 [P0/L] Gaming overlay and precedence in all modes. Acceptance: T05–T07, zero heavy workers after quiescence, and preliminary performance measurements.
- B06 [P0/L] Once/daily/weekly schedules, time zones, missedPolicy, queue bounds, and leases. Acceptance: T09–T13; no unrestricted cron.
- B07 [P0/M] Concise engine UI with draining/deferred/stale state and upcoming time. Acceptance: meaningful transitions, no unexplained spinner or catch-up burst.
M1 gate: demonstrated operation, stopping, and recovery before external providers are introduced.

## M2 — Workspace and Project Manager
- B08 [P0/M] Root picker, permissions, path containment, read limits, and exclusions. Acceptance: T15/T16; removing a root revokes its grant.
- B09 [P1/M] Files/Projects, notes/tasks, bounded search, sanitized previews. Acceptance: T28/T29 and suspended indexing during Gaming.
- B10 [P0/L] Five Git wrappers, hardened environment/config handling, and evidence references. Acceptance: T17; unchanged source hashes, no helpers/network.
M2 gate: a local read-only project report with evidence, without executing project code.

## M3 — Both providers and AI plans
- B11 [P0/M] Provider contract, capabilities, fake transports, and secret references. Acceptance: shared contract suite and correct usageUnknown handling.
- B12 [P0/M per adapter] Gemini then OpenAI as separate mappings; pinned SDKs, bounded streaming/abort/errors. Acceptance: T20 and T32 when account access exists; capability errors are visible rather than bypassed.
- B13 [P0/L] Preview/approval/grants/planHash/tool broker/budget reservation. Acceptance: T14/T16/T20 and no automatic function execution.
- B14 [P1/M] Note-summary and project-report recipes, app Inbox persistence, and evidence. Acceptance: bounded, verified output.
M3 gate: end-to-end success with fake providers, then separately approved small live smoke tests. Both adapters must exist; unavailable live access must be disclosed.

## M4 — Drive backup and restore
- B15 [P0/L] Desktop OAuth/PKCE/drive.file and account/backup-set grants without full-Drive scope. Acceptance: disconnect and clean-device access journey.
- B16 [P0/L] Snapshot/manifest/encryption/recovery kit/staging. Acceptance: T21/T24/T26 and no secrets in backups.
- B17 [P0/L] Resumable upload, reconciliation, checkpoints, verification, retention. Acceptance: T22/T23/T27; no duplicate after timeout or loss of the previous backup.
- B18 [P0/L] Restore to new directories with integrity/schema checks and disabled automations. Acceptance: T25 and a real restore drill before calling backup complete.
M4 gate: snapshot → deliberate interruption → resume → download → decrypt → restore → compare on fixture data.

## M5 — Smart Dashboard and operational readiness
- B19 [P1/M] Aggregate dashboard, approvals, upcoming/deferred work, cost, latest verified backup, and verification. No AI refresh.
- B20 [P0/M] Audit validation/export/redaction and recovery UI. Acceptance: T11/T19/T31.
- B21 [P0/L] Profiling, Gaming/FPS testing, worker/process leak checks. Acceptance: T33 on target hardware with measurements rather than impressions.
- B22 [P1/M] Opt-in tray/startup, installer/update integrity, accessibility, and concise operating/recovery instructions. Acceptance: T29/T30 and no permanent service.
M5 gate: all P0 cases pass, T33 meets targets, known issues are visible, then owner approval for real use. Public distribution is a separate action.

## Shared completion criteria
Small reviewable changes, tests appropriate to the requirement before success claims, no inspected user-repository modifications, no secrets in screenshots, and contract/ADR updates when behavior changes. Never replace a safety mechanism with a TODO.
Trace results to backlog and requirements. Examples: B05 → FR07/NFR02–04 → T05/T06/T07/T33; B17 → FR08/FR12 → T22/T23/T27. Full cross-milestone tests remain planned until the relevant features exist; do not prematurely mark them Passed at M0.

## Risk-driven order
Validate control/performance before dashboard polish, permissions before AI, and restore before backup readiness. Pause/Gaming shape worker/queue architecture and cannot be postponed until the end. If Gemini struggles, reduce the task or request a focused review; never widen permissions or delete failing safety checks to accelerate delivery.
