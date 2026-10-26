# Local-first Automation Engine
## Principle
Node.js manages local timers and a durable queue. AI drafts plans or summarizes content only when needed. No automation subscription, Docker, or remote operating server. The application must remain open, or in the tray by user choice, for scheduled jobs to run. A sleeping or powered-off computer cannot execute jobs.

## Modes
- Running: admit enabled, authorized work within budgets and resource limits. Default heavy concurrency = 1; AI request concurrency = 1. Do not coordinate silently with an independently installed Drive client.
- Pause: immediately close admission; ask in-flight steps to checkpoint at their nearest safe boundary. Keep a lightweight coordinator. Due occurrences become blocked:userPaused. Indivisible work must finish safely or become outcomeUnknown before reporting Paused.
- Stop: immediately close admission, then drain safely, release leases, stop workers, and cancel the scheduler timer. Database and UI remain available. On the next Running transition, compute missed occurrences from lastEvaluatedAt; no hidden scheduling timer continues in Stop.
- Gaming Mode: an independent persisted overlay until the user disables it. Prevent background AI, indexing, compression, heavy hashing/encryption, uploads/downloads, synchronization, and heavy workers. Keep only essential control/events and lightweight local reads. Disable broad watchers and mark the index stale.

Precedence: Stop, then Pause, then Gaming restrictions, then normal Running. Disabling Gaming never changes requestedMode. Automatic game detection is outside the MVP; provide a manual switch and configurable shortcut. Do not change game settings/process priority or close other applications.

## Requested versus effective state
requestedMode = Running | Pause | Stop. effectiveState = Running | Pausing | Paused | Stopping | Stopped, plus gamingEnabled and gamingQuiescing. During transitions show requested and effective state. Do not announce quiescence while a relevant heavy worker is still draining. Show blockers, active count, and elapsed time. A transactional epoch update closes the race among claiming work, approval, and mode changes.

## Defined transitions
1. Running → Pause: close gate, request cooperative cancellation, checkpoint steps, then report Paused. Future work remains blocked.
2. Any mode → Stop: close gate, drain, persist checkpoints, shut down workers; report Stopped only after they stop. Repeated Stop is idempotent.
3. Pause/Stop → Running: recheck permissions, budgets, file fingerprints, and plan validity; summarize missed work and apply missedPolicy without reviving expired approvals.
4. Gaming On while Running: block heavy classes and drain existing heavy work. Lightweight bookkeeping and small local-note reads remain possible. Defer manual AI by default; the user can explicitly disable Gaming and run the requested operation. No silent bypass.
5. Gaming On in Pause/Stop: record the overlay without starting work. Gaming Off restores the current requested mode's policy, not Running.
6. Pause during Gaming: keep Gaming enabled. Resume returns to Running constrained by Gaming.
7. Exit/suspend: checkpoint if time permits; recovery must not assume success after an unclean exit.

## Deadlines and safe boundaries
Normal drain target: at most 10 seconds per step. After 10 seconds, show the blocker and offer waiting or a safe cancellation request. Never blindly kill a writer. A pure CPU worker may be terminated after isolating its temporary output. An ambiguous network effect becomes outcomeUnknown and must be reconciled. Do not promise stable FPS during draining; show what remains.
- Local write: write a temporary file on the same filesystem, flush where needed, then atomic rename. Do not interrupt the commit/result-recording boundary. Never replace project source code.
- SQLite: commit/rollback the short transaction before acknowledging the safe boundary. Do not directly copy an active database file.
- Compression/hash/encryption: bounded chunks, targeting 50–100 ms CPU before yielding; checkpoint at a boundary or discard an isolated partial artifact and rebuild later. Never publish a manifest for partial content.
- Drive: stop sending at a chunk boundary and protect the sessionURI/offset checkpoint. After interrupted requests, query status before retrying a chunk or creating another file. Treat the session URI as a secret.
- AI in progress: abort the local connection; request remote cancellation only if the provider/mode supports it. Ignore late tool proposals. Provider charges may remain; do not start a background replacement request.
- Git reads: bounded output and timeout; terminate only application-owned read processes. Never delete lock files owned by another process.

## Scheduling policy
MVP triggers: manual, once with an explicit UTC instant, daily, and weekly using local wall time plus an IANA zone. Validate date/zone and preview the next three occurrences before saving. No unrestricted cron in the MVP. DST: skip nonexistent local times and record the skip; execute only the first occurrence of repeated wall-clock times. Preview time-zone edits and recompute nextDue without rerunning a previous occurrence.

Use the nearest dueAt timer with reevaluation no less efficiently than a maximum 60-second wake interval while Running; no busy loop. Pause records due work within queue limits; Stop reconstructs missed work when restarted. Use monotonic time for deadlines and UTC for due dates. After a clock jump or resume, recalculate from a watermark with deduplication.

## missedPolicy and bounded queues
- Default skip: record missed counts and reasons; appropriate for reports and summaries.
- coalesceLatest: at most one run representing the latest occurrence within the past 24 hours. Preview the first catch-up following Stop/Gaming. Appropriate for a daily backup, not one backup for each missed hour.
- ask: wait for a decision. Never automatically run all missed occurrences. External effects require a valid grant even when coalesced.
- Proposed bounds: 100 queued/blocked runs globally and 20 per automation. Aggregate overflow as missed counters with explicit reasons; no silent dropping or unbounded backfill after a large clock jump.
On return, admit one heavy worker at a time. A proposed 30-second settling delay precedes deferred heavy work; a Run Now action still obeys the gate. Disabling an automation prevents future occurrences; cancelling an active run is a separate, clearly described action.

## Reliable execution
Local execution intent is at-least-once, not an exactly-once guarantee for external effects. Use stable occurrenceKey, transactional run/budget claims, idempotencyKey per step, checkpoints, and modeEpoch. Before an external effect: prepare record → call → reconcile/verify → complete. A timeout after sending is not proof of failure. Use needsReview if the outcome cannot be queried safely.
Retries: at most three attempts for known transient errors, with exponential backoff/jitter and Retry-After. Freeze retries when mode policy blocks work. No automatic retries for denied permissions, invalid schemas, or unknown effects. Default plan bounds: eight steps, three tool rounds, 120-second AI request timeout, no recursive agent spawning.

## MVP recipes
Selected-note summary: scoped reads → approved AI payload → in-app Inbox output → existence/hash verification.
Project report: bounded reads and Git allowlist → optional AI → evidence-linked report, without executing repository code.
Drive backup: snapshot → manifest → encrypt → upload → verify → mark complete, without AI.
