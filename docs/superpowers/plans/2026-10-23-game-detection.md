# Automatic Gaming Mode Implementation Plan

**Goal:** Let the owner list Windows game executables and automatically apply Gaming Mode while any listed process runs, then restore the prior manual Gaming choice without changing Running/Pause/Stop.

**Architecture:** Store an explicit allowlist of executable image names. A lightweight Windows process poller observes only names, never process arguments or game contents. The engine combines a persisted manual choice with a transient automatic overlay; an observation failure preserves the last automatic state.

**Tech Stack:** TypeScript, Electron, Node.js, SQLite settings, React, node:test.

**Spec:** `C:\Users\ahmu0\Desktop\BADAWI_OS_FEATURES.md`, section 8.

## Global Constraints

- Local Windows app; no Docker or paid server.
- Do not alter game processes, process priority, or game files.
- Pause/Stop precedence and safe worker cancellation remain intact.
- Automatic detection must never create a Running state or overwrite a manual Gaming choice.

## Review Focus

- A failed process query retains Gaming while the prior matched game may still be open.
- Editing the list while a scan is pending cannot publish an old match.
- Removing the last game restores only the automatic overlay.
- A case-insensitive executable match is exact, not a substring.
- Restart retains the manual choice but reacquires automatic status from a fresh observation.

---

### Task 1: Engine overlays

**Files:** `src/core/engine.ts`, `tests/game-detection.test.ts`

- [x] Write and run failing tests for automatic/manual precedence, mode preservation, and restart.
- [x] Add `setAutomaticGaming(enabled: boolean)` and snapshot `gamingManual`/`gamingAutomatic`; persist only manual state.
- [x] Run focused tests.

### Task 2: Windows observation and owner list

**Files:** `src/core/game-monitor.ts`, `src/core/service.ts`, `src/contracts.ts`, `tests/game-detection.test.ts`

- [x] Write and run failing tests for exact matching, invalid names, scan failure, and stale observations.
- [x] Implement bounded name validation, tasklist parsing, monitor lifecycle, saved configuration, and IPC contract.
- [x] Run focused tests.

### Task 3: Desktop and UI

**Files:** `src/desktop/main.ts`, `src/ui/Settings.tsx`, `src/ui/Dashboard.tsx`, `src/ui/app.css`, localization catalog.

- [x] Start/stop the monitor with the desktop lifecycle and expose current detection in settings/dashboard.
- [x] Add the owner editable executable list and clear source/status copy.
- [x] Build, run the core suite and a native desktop check.

