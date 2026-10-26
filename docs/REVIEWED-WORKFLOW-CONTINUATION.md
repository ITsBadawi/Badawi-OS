# Reviewed workflow continuation

Implemented in source and the current test build on 23 October 2026. The owner's packaged 0.3.0 application has not been replaced.

In Automations, open a partially completed run and choose **Review continuation**. The review shows historical successful-step receipts and the steps still remaining. Cancel performs no effects. Applying a fresh review queues the same occurrence and preserves its attempt history; successful prefixes are reused rather than executed again.

Every reused step is bound to its definition, applicable source and grant, credential version and actual Inbox or verified Drive receipt. Missing, changed, unbound legacy or non-contiguous proof cannot be reused. Backup receipts describe historical verification, not a fresh cloud availability check. Remaining steps may be edited and freshly reviewed without changing a proven prefix. If all steps are already proven, continuation only finalizes the run.

Reviews are owner-only, expire after five minutes, are single-use and are limited to ten outstanding previews. Source, receipt, definition or engine-state changes invalidate them. There are at most three reviewed continuations per occurrence. Running/Pause/Stop, Gaming Mode, active-work gates and execution-time permissions still apply. Restart never silently replays interrupted work.

An uncertain effect, including an AI request or backup operation, requires an explicit acknowledgement before it may repeat. A known read-only integration network failure can be reviewed without that acknowledgement. AI attempts keep their separate budget accounting, including uncertain prior attempts. Restarting the whole partial workflow requires an additional owner confirmation because it can repeat successful work. The assistant cannot supply that confirmation or invoke the owner-only recovery commands.

The assistant receives bounded recent-run metadata to explain failures and direct the owner to the review; it receives no private receipt bodies through this context. Its Drive connection indicator now reflects an actual configured session rather than a historical account label.

## Verification

- Complete core suite: 207 passing tests. The subsequent test-only typing correction was followed by six passing targeted service tests and a successful type-check/build.
- Behavioral and service coverage includes actual receipt binding, changed/missing proof, uncertain AI accounting, preview expiry/eviction, mode invalidation, one-use approval, cancellation, limits and finalization without replay.
- `validation/workflow-recovery-desktop.json`: four passing actual Electron checks, including review/cancel, full-restart confirmation, SQLite/protected-credential restart, continuation without a duplicated prefix and compact layout. No renderer errors were recorded.
- Native transport used controlled Vercel responses and synthetic data. No owner cloud resources or live AI billing were used; this is not live linked-account acceptance.

The full feature-parity audit, remaining Git/game-detection features, real-account acceptance and a new versioned distributable remain unfinished. Work was paused at the owner's request after completing this unit.
