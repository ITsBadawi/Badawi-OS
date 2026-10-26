# Verification and Audit
## Evidence over assertions
A model response or finished worker does not establish success. Every step defines preconditions, postconditions, possible effects, and a reconciliation strategy. Never mark a task successful because AI says "done."

## Tool-result contract
toolId/version, runId/stepId, argsHash, idempotencyKey, start/end times, outcome(success/failure/unknown), evidenceRefs, postconditionChecks, warnings, verificationStatus(verified/unverified/failed). Only the executor sets verified after actual checks; AI cannot set that flag.

## Verification examples
- Local report: confirm record/file existence in the approved destination, content hash, and references matching the read version. Do not claim complete-project coverage after bounded reads.
- Git read: exit code, output time/size, HEAD fingerprint. In tests, source/canary hashes before/after establish no modification; a preexisting dirty repository is not proof the app changed it.
- Schedule: preview three calculated occurrences, stable occurrenceKey, and transactionally stored enabled/version/grants.
- Backup: complete encrypted parts and manifest; download/decrypt; integrity/hash checks; restore drill. Remote metadata alone does not prove recoverability.
- Stop: no claims after the blocking epoch, zero heavy workers, and no new background AI after quiescence. Count child processes, not just UI counters.

## Audit chain
Event types: PlanProposed, PlanValidated/Rejected, ApprovalGranted/Denied/Expired, PermissionRevoked, ModeRequested/Effective, GamingChanged/Quiescent, RunClaimed/Blocked/Missed, StepPrepared/Checkpointed/Completed/OutcomeUnknown, VerificationPassed/Failed, BackupCompleted, RestoreValidated, BudgetReserved/Settled, RecoveryReconciled.
Every event includes sequence, UTC timestamp, actor(user/scheduler/AI/host), correlationId, runId/stepId, policyVersion, engineEpoch, resource IDs, sanitized reason, previousHash, and eventHash. Sequence order remains authoritative when the wall clock changes.
Write intent before an effect, and result afterward. Failure to record intent prevents a sensitive effect. If an effect occurred but result recording failed, mark needsReview and reconcile rather than retry blindly.

## Error presentation
Show one clear reason and a relevant recovery action; technical detail can be collapsed. Examples: "File changed after approval; review the updated preview," "Upload may have finished; checking before retry," and "Project read permission expired." Do not convert outcomeUnknown to failed just to retry it.

## Audit integrity limits
Use a local hash chain with checkpoints in encrypted backups or exports retained by the owner. It can reveal changes against a trusted reference; it is not an independent signature or protection from someone able to rewrite all local state. Retention truncation records a checkpoint reference and must not claim an intact original history after intentional deletion.
If integrity validation fails, warn and suspend external effects pending review, while preserving local inspection.

## Evidence bundle per application release
Application/dependency versions, OS/hardware, commit if applicable, actual typecheck/build/test output, fault-injection report, fixture hashes, resource/FPS measurements, fixture restore evidence, and untested limitations. Screenshots verify presentation, not data integrity. Remove secrets before sharing reports.

## What is verified in this documentation package
This is documentation, not an implemented application. The model identity was checked against the dated official source. Document existence, local links, structural coverage, encoding, checksums, ZIP round-trip, and static handbook rendering are checked during packaging. All application tests in the next document are planned, not pre-passed. `PACKAGE-VALIDATION.json` records documentation checks only.
