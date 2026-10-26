# Functional parity and real AI conversation Implementation Plan

> **For agentic workers:** Execute tasks in this session. The owner has explicitly requested implementation and verification; no additional approval gate is needed for local changes or the supplied Gemini test credential.

**Goal:** Replace the one-shot assistant with persistent conversations, close the core AI recipe gap, and document evidence against every PRD requirement.

**Architecture:** Keep the local SQLite/validated IPC boundary and the existing scheduler. Add a focused conversation module with provider-native history, explicit user sends, durable failed/interrupted turns, cancellation, and selected-source context. AI suggestions become validated, disabled drafts; only owner-approved recipes may run on a schedule.

**Tech Stack:** Existing Electron, React, TypeScript, SQLite, direct Gemini Interactions and OpenAI Responses REST adapters.

**Spec:** docs/spec/03-PRD.md, docs/spec/08-SECURITY-AND-PERMISSIONS.md; latest owner instruction replaces the one-shot preview UX with normal chat and defers FPS work.

## Global Constraints
- Local-first; no Docker, permanent server, source modification, arbitrary shell, or automatic code execution.
- Gemini and OpenAI independently configurable; API keys never in delivered source, screenshots, reports, or audit.
- Running/Pause/Stop remain enforced. FPS profiling is excluded by the owner's latest instruction.
- Google Drive is the only remote backup destination; live verification needs a configured Google Desktop OAuth client/account.
- Preserve existing owner data and the original 0.1 distribution; package this update separately.

## Review Focus
- A follow-up must receive prior user and model messages after restart, including signed native reasoning items where required.
- Failed/cancelled/interrupted turns must never be displayed as a successful response or retried automatically.
- Changing provider credentials or revoking a note/project invalidates affected approvals and background grants.
- Restores must preserve conversations while disabling schedules and removing root/background permissions.
- Live-provider failures must be reported honestly; fixture transport tests do not prove a real account or Drive works.

### Task 1: Baseline and live account diagnosis
- [x] Run the existing suite and capture failures before changes.
- [x] Check the supplied key only against Google's official endpoints using synthetic content; retain sanitized evidence only.

### Task 2: Provider conversation contract
Files: src/core/providers.ts; tests/conversation.test.ts.
- [x] Write failing tests for native role history, cancellation, usage and refusal handling.
- [x] Add bounded history plus provider-native continuation steps without server storage.
- [x] Verify both adapter mappings and the full suite.

### Task 3: Persistent chat domain
Files: src/core/chat.ts, store.ts, service.ts, contracts.ts, requests.ts; tests/chat.test.ts.
- [x] Write failing tests for real SQLite restart, two-turn context, failed turn recovery, cancellation, profile changes and source revocation.
- [x] Add chats, safe snapshots, send/retry/cancel, attachments and durable pending state.
- [x] Verify local state and sanitized audit/receipts.

### Task 4: Conversation UI
Files: src/ui/Chat.tsx, main.tsx, Settings.tsx, context.tsx, app.css; tests/chat-desktop.mjs.
- [x] Write a failing Electron flow for send, reply, follow-up, new conversation and restart persistence.
- [x] Implement a full chat page with transcript, conversation list, composer, selected-source disclosure, status and retry/cancel.
- [x] Verify desktop behavior and inspect screenshots in light/dark/compact layouts.

### Task 5: AI recipes and reviewed drafts
Files: contracts.ts, service.ts, src/core/plans.ts, Automations.tsx, Chat.tsx.
- [x] Test note-summary recipes and strict structured draft validation before implementation.
- [x] Add explicit selected-note grants, provider/profile binding and fixed prompt; revoke on edits/disconnect/restore.
- [x] Allow conversation answers to propose disabled automation drafts; preview and explicit save/enable stay necessary.
- [x] Verify scheduler → provider → Inbox → run/audit, including missed/failed/revoked jobs.

### Task 6: Backup compatibility and evidence
Files: backup.ts; tests/backup-chat.test.ts; docs/FEATURE-VERIFICATION.md.
- [x] Test old snapshot compatibility, new chat round-trip and disabled restored AI grants.
- [x] Update logical snapshot schema safely.
- [x] Run full unit/integration, real Electron and authorized small live Gemini multi-turn tests.
- [x] Map FR01–FR12 to evidence, partial gaps and external blockers; no blanket production-ready claim.

### Task 7: Deliver update
- [x] Build and package a separate 0.2 Windows/source archive; do not overwrite a running 0.1 executable.
- [x] Test the packaged build.
- [ ] Scan final delivered archives for the supplied credential after archive creation.
- [x] Open the new version for review; verify schema upgrade preserves owner records.
- [ ] Deliver download links and the remaining external setup explicitly identified.
