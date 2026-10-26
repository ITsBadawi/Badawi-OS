# Next implementation unit: local conditions and integration checks

Status: local conditions and operational alerts are implemented with the core/native evidence in `docs/LOCAL-CONDITIONS-AND-ALERTS.md`. Scheduled integration monitoring is also implemented with six behavioral tests and four real Electron timer/restart/revocation checks; see `docs/SCHEDULED-INTEGRATION-MONITORING.md`. The full release and account acceptance gates remain open.

The full feature-parity and official SIWC objective remains unchanged and active. This unit is part of that objective; completing it is not release completion. Preserve the owner profile and previously delivered 0.3.0 package.

## Local condition triggers

Extend the validated trigger union with bounded, declarative conditions, initially local overdue/open-task thresholds and age of local verified Drive receipts. Conditions accept an optional registered project and numeric limits; no expressions, scripts, arbitrary filesystem access, network probes or general terminal commands.

Evaluate conditions inside the existing engine tick, only while Running, outside Gaming, idle and after the settling period. Use a persisted condition observation/latch with a fingerprint of the approved job definition. A false-to-true observation queues one occurrence; a still-true condition does not repeatedly execute. Persist across restart; unknown/unavailable sources must not manufacture a false observation that silently rearms the rule. Bound polling and show the actual last-check time. Stop/Pause/Gaming defer observation; on resume evaluate the current local state rather than replaying every hypothetical offline transition.

Bind queued condition occurrences to the approved job definition. Recheck both identity and current condition before effects. If requirements changed or no longer match, record a skipped run and reason, distinct from succeeded/verified execution. Add skipped status to the existing UI/report aggregates. Backups restore condition definitions disabled without importing the execution latch or grants.

The owner sees a natural-language rule summary and current observation before enabling. The assistant may propose only the validated condition grammar through reviewed job.save. Extend both chat capabilities and the dedicated automation-draft schema; do not leave the latter silently limited to old trigger types.

## Integration monitoring recipes

Add reviewed scheduled/read-only GitHub and Vercel/Railway inspection steps using the existing bounded adapters. Store a source/credential grant fingerprint, reject changed linked repository/service/environment or identity, and preserve independent background-AI consent. Never add deployment/publish/restart mutations as part of monitoring. Keep real account acceptance separate from controlled adapter tests.

## Verification sequence

1. Write behavioral tests for false/true edges, persistent deduplication, unknown sources, source/job changes, canceled/disabled rules, Pause/Stop/Gaming, resume and skipped receipts. Observe expected failures before implementation.
2. Implement contracts, condition module and engine integration; preserve time/event/manual behavior and missed-run policies.
3. Add owner preview/editor controls, source time/reason display, assistant/draft grammar and restored-disabled behavior.
4. Verify actual native creation, preview, activation, a real timer-driven local condition action and restart without duplicate effects. Use an isolated profile and synthetic tasks.
5. Run the complete core suite, build and relevant native regressions; update the feature evidence document. Continue remaining goal requirements, including reviewed Git operations, files/Inbox, dashboard/localization and final release acceptance.

## Integration-monitor implementation seam

- Add a validated `integration` job/step kind with a separate `integration: github|vercel|railway` field (not the AI provider field), registered project and explicit monitoring consent. Review exact links before enabling. Keep background AI grants independent.
- Bind the grant to linked repository/service/environment, local Git root where used, and a credential identity hash; never store credentials or expose arbitrary URLs/queries. Credential replacement, disconnection, relink and target changes must invalidate/disable affected grants and cancel unsafe in-flight work. The current `invalidateGrants` helper only handles summary/workflow/briefing; extend it deliberately for the new kind.
- Extract the existing command's bounded GitHub read into a shared helper usable inside the engine, rather than nesting another `engine.runTask`. Reuse `checkDeployment` for Vercel/Railway. Check grant/source identity before the request and again before publishing the report.
- Persist a timestamped, allowlisted inspection finding in Inbox and its run receipt. Distinguish successful execution of a read from healthy deployment/Git state. Failed/unknown health must be visible and never called a successful deployment. Use no deploy/restart/push mutations in monitoring recipes.
- Extend backup job/step schemas and historical Inbox-evidence shape as needed. Restored monitoring definitions stay disabled and without grants. Include actual project association and observation time for reports.
- Extend owner editor/workflow controls and AI chat/draft grammar, then verify native scheduling/manual monitoring with controlled transport and account acceptance separately. Real Vercel/Railway credentials are not currently configured in the owner app; do not invent live proof.
