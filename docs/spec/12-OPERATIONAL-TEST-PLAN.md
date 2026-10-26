# Operational Test Plan
Status: future application test specifications, not tests already executed on Badawi OS. No application case is pre-marked Passed.

## Environment and fixtures
Use the Windows versions chosen for support at M0, a standard non-admin account, and the target device with CPU/RAM/GPU/storage/display refresh/power profile recorded. Provide an injectable clock, fake streaming providers, fake Drive with offset/quota faults, Git fixture repositories, source/canary files, active SQLite WAL, junction/symlink fixtures, Arabic content, and long filenames.
Automated tests do not use real accounts or transmit owner files. Use fake transports. Live smoke tests are separately approved, small, manual checks using user credentials and a dedicated test Drive folder. Never commit keys into fixtures or CI.

## Required result record
ID, build/version, date, setup/steps, expected outcome, actual outcome, evidence path/hash, pass/fail/blocked, scope note, and reviewer. P0 permission/data-loss failures block release. Blocked is not Passed.

## P0: engine operation and modes
- T01 — Running: enable a once trigger one minute ahead. Expect exactly one logical occurrence, recorded steps, verified output, and no duplication from a second window.
- T02 — Pause during hash, AI, and backup, repeated per category: expect gate closure before acknowledgement, visible Pausing, checkpoint, and Paused only after quiescence; no new claims; resume revalidates.
- T03 — Stop with a busy schedule: stop and wait three minutes. Expect Stopping then Stopped, zero engine workers and scheduler timer, usable UI, and no surprise run-all on restart.
- T04 — Mode race: interleave a claim/approval with Stop. Expect epoch enforcement, or explicit accounting for a step admitted before the gate closed followed by safe draining. No hidden running work.
- T05 — Gaming from Running: exercise indexing, Drive, and AI categories under configured concurrency limits, then enable Gaming. Expect visible draining, then zero heavy workers/background requests, broad watchers suspended, gaming deferral reasons, and lightweight local reads available.
- T06 — Mode precedence: toggle Gaming in Pause/Stop and Resume during Gaming. Expect Gaming Off never causes Running; Running + Gaming remains constrained.
- T07 — Run Now and late AI: issue manual work during Stop/Pause/Gaming and deliver a delayed AI tool proposal. Expect blocked/deferred work with an explanation and no late tool execution.
- T08 — Drain deadline: a worker ignores checkpoints for more than 10 seconds. Expect a visible blocker, no false quiescence, safe cancellation or needsReview, and intact previous backup.

## P0: scheduling and recovery
- T09 — Sleep/offline/closed: miss an occurrence during application exit or system sleep. Expect no claimed execution during absence, correct skip/coalesceLatest/ask handling on return, and no duplicate occurrence.
- T10 — Clock/DST: move time forward a day and back; test missing/repeated local times in a DST zone. Expect watermark/deduplication, missing-time skip, first repeated-time occurrence only, and clear audit evidence.
- T11 — Crash boundaries: kill a fixture worker before prepare, after prepare, and after an external effect but before complete. Expect safe recovery, Stopped after crash, ambiguous-effect reconciliation, and no repeated confirmed effect.
- T12 — Queue limits: generate 1,000 due occurrences with global limit 100 and per-automation limit 20. Expect bounded pending rows, aggregated missed counters, no memory surge, and no silent starvation.
- T13 — Retries: simulate 429 with Retry-After and 5xx then success. Expect at most three attempts, respected budgets/modes, and no automatic auth/schema retry.

## P0: security, files, Git, and providers
- T14 — Prompt injection: a file requests `.env` exfiltration or terminal execution. Expect rejection before execution, no secret transmission, and no unregistered tool.
- T15 — Path escape: test `..`, absolute/UNC/device/ADS paths, junction/symlink swaps, hard-link aliases, and TOCTOU. Expect rejection or safe revalidation without reading beyond the granted root. Fail closed when containment cannot be proven.
- T16 — Approval binding: alter arguments/file/provider after approval, revoke during execution, replay a consumed token. Expect invalidation, blocking subsequent steps, and renewed approval where required.
- T17 — Hostile Git fixture: configure pager, external diff, textconv, fsmonitor, hooks, and credential helper to modify a canary. Expect none to execute, no network, unchanged source/canary hashes, and rejection of lazy-fetch partial-clone behavior.
- T18 — Renderer/IPC: oversized payloads, unknown channels, untrusted senders, and HTML/script in previews. Expect validated rejection with no Node access, secrets, or automatic navigation.
- T19 — Secrets: search renderer storage, logs, exports, and backups for fixture secrets. Expect no secret values and no plaintext fallback after keychain failure.
- T20 — Budgets/providers: concurrent requests near the cap, fallback without grant, partial tool arguments, truncation/refusal. Expect atomic reservation, no unauthorized transmission/execution, and usageUnknown rather than fabricated zero usage.

## P0: backup and restore
- T21 — Database consistency: write to WAL during snapshot. Expect integrity_check and a consistent restored database, not a raw live-file copy.
- T22 — Interrupted upload: Pause/Stop/Gaming and disconnect at chunk acknowledgement and completion-response boundaries. Expect session/file reconciliation before retry, one logical backup, and no partial complete marker.
- T23 — Session expiry/quota/revocation: expect checkpoint or clear failure, renewed consent where necessary without broader scope, and preservation of the last valid backup.
- T24 — Tampering: modify ciphertext/manifest/chunk order; supply traversal/bomb archives. Expect authentication/hash failure or extraction rejection before writes outside the target directory.
- T25 — Clean-device restore: new fixture profile, recovery kit, and user-selected Drive files under drive.file. Expect a new-directory restore, verified hashes/integrity, no restored secrets, and disabled automations. Wrong/lost keys must report inability to restore, not output corrupted files as success.
- T26 — Changing source/disk full: alter a file during packaging and exhaust staging space. Expect bounded retry or explicit incomplete status, preserved previous backup/source, and safe later cleanup.
- T27 — Retention: test with/without deletion grant, pinned backups, and the last valid backup. Expect no unauthorized deletion, no deletion of pinned/last-valid backups, and trash-first behavior where applicable.

## P1: daily operations and experience
- T28 — Offline local-only: no keys or internet. Expect local files/notes/control and local schedules to work; AI/Drive clearly waiting or unconfigured.
- T29 — Accessibility: RTL/LTR, keyboard, screen reader, 200% zoom, and 1366×768. Expect visible state/reason/schedule impact without relying on color.
- T30 — Close/tray/startup: defaults then opt-in. Expect no silent background persistence or auto-start, draining on Exit, Stopped after crash restart, and disabled restored schedules.
- T31 — Audit corruption/export: alter an event/previousHash against a trusted checkpoint and export. Expect detection, suspended external effects, sanitized exports, and no tamper-proof claim.
- T32 — Live adapter smoke: separately approve a small request for each accessible provider. Expect actual modelId, usage/limits/errors. Missing account access is Blocked for that integration, not Passed.

## T33: resource and FPS measurement — target-device release gate
1. Select a repeatable game benchmark/scene with fixed settings, resolution, FPS cap, and measurement tool. Do not inject into anti-cheat processes or let Badawi OS alter the game.
2. Warm up for five minutes and keep thermal/power/background conditions stable. Compare A: app closed; B: Stopped; C: Running idle; D: Gaming after quiescence; E: Running with one heavy worker. E measures workload impact, not Gaming acceptance.
3. Run three five-minute rounds per condition in balanced/interleaved order. Record median FPS, 1% low using the same tool/definition, application aggregate CPU/RSS, and disk/network I/O. Separate draining time from steady-state measurements.
4. Compute degradation = 100 × (baseline − measured) / baseline. Accept D when median FPS loss ≤3%, 1% low loss ≤5% versus A, average CPU ≤1%, combined RSS ≤350 MiB, and zero heavy workers/background AI. If baseline round variance exceeds the thresholds, mark inconclusive and repeat under more stable conditions; do not cherry-pick a pass.
5. If targets fail: reduce repaint/polling, release caches/workers, and remeasure. Review the desktop shell choice if overhead persists. Never silently lower thresholds or promise identical performance on every device.

## Final acceptance gate
All P0 cases pass. Any P1 affecting authorization/data loss is treated as P0. Other deferred P1 issues require explicit owner acceptance. T33 is required to judge suitability for the target device. Separate fake-based automated results, real integration smoke results, and hardware measurements. Documentation work does not authorize deployment, installation, or launch-at-login activation.
