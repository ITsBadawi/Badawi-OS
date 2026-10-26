# Badawi OS 0.1 — implementation evidence

Date: 2026-10-21. Status: **working local Windows preview; not a fully accepted production release**.

The owner explicitly asked Codex to build the program after reviewing the standalone design. This authorizes this implementation beyond the earlier Gemini-only M0 launcher. Existing documentation packages and the standalone HTML remain separate deliverables.

## Actual checks

- `npm test`: **42 passing tests**, including real SQLite persistence/rollback/recovery, future-schema refusal, audit corruption, mode epochs/draining/Gaming, queue caps and deduplication, timezone/DST/missed schedule policy, path/secret/hardlink/junction denial, cooperative scan cancellation, a real fixture Git repository, both provider protocol fixtures, ciphertext/wrong-key rejection, validated new-directory restore, interrupted Drive chunk reconciliation, and durable request replay after restart.
- `npm run build`: TypeScript checks, Vite renderer build, bundled main and sandbox-compatible preload pass. Electron 45 actually reports Node 24.22.0 and exposes the built-in SQLite APIs used here. No SQLite ABI addon is required.
- `npm run test:desktop`: **28 passing checks** in a real hidden Electron window, not a mocked browser bridge. Covers initial Stop, real engine controls, Gaming precedence, actual local notes/tasks/project picker/file previews/reminder output, restart persistence, theme, keyboard search, all pages, IPC validation, renderer isolation, actual Windows secret encryption and absence of plaintext keys in SQLite/WAL. No renderer runtime errors.
- The same **28 checks also pass against the assembled `Badawi OS.exe`**, with its bundled resources and no runtime `node_modules`. The test harness disables background throttling solely for reliable screenshots of its hidden test window; this setting is not changed in the distributed application or the separate idle-resource diagnostic.
- `npm audit` and `npm audit --omit=dev`: **0 known vulnerabilities** at this check. Exact dependency versions and the lockfile are included; an override pins tsx's esbuild to the patched version.
- Screenshots of light/dark and compact layouts were captured and inspected in `test-results/`. Screenshots contain fixture records; the distributed program starts with an empty database, not those records.

The renderer build emits two upstream `use client` directive notices from lucide-react. This is a client-only React/Electron application; there is no server-component boundary to preserve. These notices are not suppressed and do not fail the build.

## Short resource diagnostic

`npm run test:resources` launched a fresh empty workspace with the window hidden, waited five seconds in each condition and sampled the aggregate application processes. Hardware acceleration is disabled to avoid competing with a game's GPU workload; the app has no continuous animations.

| Condition | Sum of working-set RSS | Aggregate sampled CPU |
| --- | ---: | ---: |
| Stopped | 329.94 MiB | 0.000% |
| Running idle | 333.38 MiB | 0.059% |
| Gaming after quiescence | 337.08 MiB | 0.071% |

These are **short diagnostics, not T33 acceptance**. An earlier full-navigation/screenshot session reached about 404 MiB. Shared pages can be counted in multiple process working sets, but the documented 350 MiB target has not been silently redefined. Sustained memory, median FPS and 1% lows during a real game remain unmeasured. No game was launched, modified or benchmarked. Do not claim this preview meets the complete Gaming/FPS release gate.

## Working feature coverage and remaining gates

| Area | Implemented in this preview | Remaining before full specification acceptance |
| --- | --- | --- |
| Foundation / B01–B03 | Local SQLite, migrations, sandbox, CSP, narrow validated IPC, DPAPI secrets, startup Stop, durable mutation receipts | Extended crash/disk-full fault injection, update integrity/distribution review |
| Engine / B04–B07 | One admitted job, cooperative abort/draining, epochs, independent Gaming, no Stop timer, manual/once/daily/weekly, DST, reviewed catch-up | Sustained load/clock-jump/suspend fault matrix, long-running drain blocker UX and target-device profiling |
| Workspace / B08–B10 | Native grants, read-only previews, bounded scans, exclusions, tasks/notes, five fixed Git read wrappers, revocation, restored-root relinking | Adversarial TOCTOU stress, complete Git configuration/reparse-point fuzzing, larger data performance |
| AI / B11–B14 | Both text-only REST adapters, no tools, exact single-use approval, output-token and request-count limits, actual Inbox persistence | Live smoke tests for each owner account, complete provider error/streaming matrix, monetary reservations and background grant system. Background AI remains disabled |
| Backup / B15–B18 | Desktop OAuth code/PKCE/state, drive.file, logical transactional snapshots, AES-GCM, recovery kit, resumable chunks, stable file IDs, reconciliation, download/decrypt/hash/schema checks, new-folder restore | Real Google account OAuth/upload/restore, clean-device access proof, quota/session-expiry/disk-full testing and owner recovery-key drill. No retention deletion or source-code backup |
| Dashboard / B19–B22 | Actual state, schedules, projects, tasks, Inbox, verification/audit UI, light/dark, local Windows folder build | Complete screen-reader/200% accessibility matrix, T33 game measurements, signed installer/update integrity; optional tray/startup are absent and off |

## Deliberate implementation decisions

- **ADR07:** Codex builds the app under the owner's new explicit instruction; the old M0-only Gemini launcher does not limit this chat's authorization.
- **ADR08:** Built-in node:sqlite instead of an ABI-sensitive native addon. Database schema version 1; newer versions fail closed.
- **ADR09:** A bounded logical snapshot is used rather than raw SQLite/WAL copying. Records are exported in a single SQLite transaction, strictly validated at restore, and secrets/root grants/history of external authorization are excluded. Restore creates a fresh integrity-checked database with automations disabled. Artifact bound: 16 MiB.
- **ADR10:** Direct, small REST protocol adapters implement a text-only subset. There are no SDK automatic tools, hosted agents, streaming tool loops, automatic retries or provider fallback. Provider fields are mapped separately against official docs. A manual user request with explicit content approval is the only route to AI.
- **ADR11:** Current lightweight work is cooperative in the host process with bounded filesystem/Git/network operations; no permanent workers or watchers exist. General heavy CPU/indexing/source packaging workers are not enabled. This is narrower than the future worker architecture in the design package.
- **ADR12:** Daily request reservations count failed/unknown requests conservatively. Token/request limits do not pretend to implement an invoice currency cap; background AI is not enabled before that future budget system exists.
- **ADR13:** Incoming recovery keys are stored separately for restoration, preventing a key import from stranding an in-progress upload encrypted with the current device key.
- **ADR14:** Persistent mutation request receipts return completed results after restart and hold interrupted pending requests as uncertain instead of executing them again. They do not establish exactly-once effects at external providers. Audit hash chaining is local evidence, not tamper-proof storage or an external trusted checkpoint.

## Unverified external state

No real Gemini/OpenAI keys, Google Cloud client, Google account, paid model request, real Drive upload or game benchmark was used during development. Protocol/Drive tests use explicitly controlled fixture transports. Settings show a saved key as saved, not as proven live account access. The packaged app must not be described as a complete P0/M5 or backup-release pass until these remaining gates are exercised.

## Reproduction

Run the commands in README.md. Each desktop diagnostic uses a newly created temporary workspace and cleans up that workspace after exit. It never launches scripts or installers inside an inspected user's project. Existing unrelated running applications are left alone.
