# Architecture and Data Contracts
## Proposed stack
A Windows desktop application using Electron, React, and TypeScript. The bundled Node.js runtime hosts the local engine. SQLite stores state and the durable queue. Select and pin compatible supported versions during implementation, especially SQLite/keychain bindings and Electron ABI compatibility. Do not select a version merely because it is newest. No permanent HTTP server, LAN listener, Redis, or Docker; UI/host communication uses typed IPC.

## Component boundaries
- Renderer: local UI only; no Node, secrets, or tool execution. Displays state but does not authorize actions.
- Preload: a narrow bridge for schema-validated IPC. No generic invoke or raw filesystem capability.
- Main host: application lifecycle, IPC sender validation, policy enforcement, and secret-store access. Keep it lightweight; no large compression or hashing on its event loop.
- Engine coordinator: state machine, admission gate, scheduler, leases, checkpoints, and budgets. AI never makes security decisions.
- Tool broker: the only route to files, Git, Drive, and local outputs; rechecks resource permission and engine policy before each step.
- Worker host: short-lived helper processes for heavy indexing/compression/Git reading, with cancellation and heartbeats. AI has no unrestricted access to workers. Worker threads improve responsiveness; they are not a security sandbox.
- Provider gateway: Gemini/OpenAI adapters, normalized errors/usage/timeouts, and no filesystem or Git authority.
- Backup service: snapshot, manifest, encryption, upload, verification, and restore, invoked through the broker.
- Persistence: SQLite migrations and short transactions; managed outputs and staging outside inspected code repositories.

## Logical flow
User → Renderer → IPC validation → Policy + Engine gate → durable Run/Step → Tool broker → adapter/worker → Verification → Audit + UI events.
Scheduler → the same gate and broker, with no approval bypass.
AI → ProposedPlan only → schema/limits/permissions → preview/approval → executor.

## Proposed module layout
`apps/desktop` for UI/main/preload; `packages/contracts` for shared contracts; `packages/engine` for modes/time/queue; `packages/policy` for permissions; `packages/tools`; `packages/providers`; `packages/storage`; `packages/verification`; `tests/fixtures`; and `docs`. These are design suggestions, not application files created by this documentation delivery.

## SQLite entities
- Project: id, name, rootId, notesRef, createdAt, archivedAt.
- WorkspaceRoot: id, canonicalPath, role(readOnlySource/appManaged), enabled, exclusions, permissionVersion.
- Automation: id, version, enabled, triggerSpec, timezone, nextDueAt, lastEvaluatedAt, missedPolicy, planVersion, grantIds, providerProfileId.
- Run: id, automationId, occurrenceKey, scheduledAt, status, blockedReason, modeEpoch, leaseOwner, leaseExpiresAt, startedAt, finishedAt.
- Step: runId, stepId, toolId, version, argsHash, state, attempt, idempotencyKey, checkpointRef, resultRef, errorCode, verificationStatus.
- Approval: id, planHash, resourceFingerprints, permissionVersion, dataScopeHash, expiresAt, decision, consumedAt.
- Grant: id, subject, actions, resourceScope, providerDestination, constraints, expiresAt, revokedAt.
- EngineState: singleton, requestedMode, gamingEnabled, epoch, lastCleanShutdown, updatedAt.
- AuditEvent: sequence, correlationId, actor, eventType, resourceRef, sanitizedDetails, previousHash, eventHash, createdAt.
- Backup: backupId, formatVersion, state, manifestHash, encryptedArtifactHash, remoteFileId, checkpointRef, verifiedAt.
- ProviderProfile: id, provider, modelId, secretRef, capabilitiesSnapshot, limits, sendScope, configVersion. Never store secret values here.
- BudgetReservation: id, runId, providerId, reservedTokens/cost, state, settledUsage, expiresAt. Atomic reservation prevents concurrent request races.

Constraints: UNIQUE(automationId, occurrenceKey), UNIQUE(runId, stepId), separate attempt history if needed, atomic lease compare-and-set, and enabled foreign keys. Deleting a project must not cascade-delete audit evidence; retain a pseudonymous resource reference after content removal.

## Run and step states
Run: queued → running → succeeded / failed / cancelled / needsReview. A queued/running run may become blocked with a saved checkpoint, then return to queued after revalidation. Blocked reasons: userPaused, engineStopped, gaming, waitingApproval, waitingNetwork, budgetExceeded, permissionRevoked. Cancelled is terminal; needsReview requires reconciliation or an explicit decision before retry.
Step: pending → executing → completedVerified, failed, checkpointed, or outcomeUnknown. A completed API call is not a verified user outcome.

## Conceptual IPC contracts
- Engine.setMode: mode + expectedEpoch → requested/effective state + newEpoch + drainingSteps.
- Engine.setGaming: enabled + expectedEpoch → effective policy + deferredCounts.
- Automation.preview/save/enable: typed trigger + plan + expectedVersion. Saving does not implicitly enable.
- Permission.approve: planHash + fingerprints + expiry; AI-generated "approved" text is not authorization.
- Run.inspect/cancel; Workspace.addFromNativePicker/remove; Project.readStatus; Backup.preview/restoreToNewFolder; Audit.exportSanitized.
All requests carry requestId. A repeated mutation request returns its previous result rather than creating another effect. Renderer requests use rootId plus validated relative paths, not arbitrary absolute paths.

## Concurrency and recovery
Use an application single-instance lock plus database uniqueness/leases; do not rely on a single visible window. Claiming a run, recording modeEpoch, and reserving budget occur transactionally. Mode changes increment epoch and close admission before notifying workers. The broker rejects old-epoch steps; already-started steps reach safe boundaries. Expired leases do not prove external failure: reconcile first.
After an unclean shutdown, start Stopped with a recovery banner even if previously Running. Clean restart preserves Pause/Stop. Returning to Running requires an explicit action or a previously enabled, clearly explained resume setting.

## Window and process lifecycle
Closing the window requests graceful application/engine exit by default. Continuing in the tray is an explicit opt-in. Stop shuts down engine workers while leaving the shell for files/settings. Exit terminates the application after draining. No permanent Windows service, automatic wake-up, or launch-at-login without user choice.

## Trust boundaries
Project files, Git output, model responses, and Drive input are untrusted data. SQLite is not a secret store. A compromised Windows account or another malicious process running as the same user is outside the claimed isolation guarantee. Do not describe a local audit hash chain as absolutely tamper-proof.
