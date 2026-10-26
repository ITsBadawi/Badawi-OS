# Local condition automations and operational alerts

These features are implemented in the current source/build. The previously delivered 0.3.0 package has not been replaced, and the complete feature-parity goal remains active.

## Condition grammar

An automation trigger can be `{type: "condition", checkEveryMinutes, condition}`. The polling interval is an integer from 1 to 60 minutes. Supported local conditions are:

| Kind | Fields | Source |
| --- | --- | --- |
| `tasks.overdue` | `minCount` 1–1000, optional registered `projectId` | Current local incomplete tasks whose deadline is in the past |
| `tasks.open` | `minCount` 1–1000, optional registered `projectId` | Current local incomplete tasks |
| `backup.stale` | `ageHours` 1–8760, optional registered `projectId` | Age of the latest locally recorded verified Drive copy for the current linked account and selected project |

No verified backup receipt counts as an absent recent copy when an account is linked. An unlinked account, unavailable/archived project or invalid condition is unknown, not a successful condition evaluation. A backup-age observation does not recheck remote existence or Google subscription billing.

The owner can inspect a rule and preview its actual current local value/source time before enabling it. Preview does not change the automation latch or execute its action. The dedicated AI automation drafter and regular chat tools use the same validated grammar. AI drafts stay disabled; unknown project IDs and arbitrary expressions/scripts are rejected. Background AI actions still need their separate selected-source consent and budget.

## Execution semantics

The existing lightweight engine observes conditions while Running, idle, outside Gaming and after its settling period. Stop/Pause/Gaming defer observation. Resumption checks current state; it does not invent or replay transitions that might have occurred while unobserved.

The first matching observation queues one occurrence. A still-matching condition does not repeatedly queue. Another automatic occurrence requires a known false observation followed by a true observation. Unknown observations preserve the previous matching latch and cannot silently rearm it. Observed transitions may be missed between polls; the UI describes observation-based behavior rather than claiming continuous monitoring.

The queued occurrence and matching latch commit in one SQLite transaction. Restart retains the latch and does not repeat a still-true rule. Queue saturation does not consume the matching edge permanently: the next allowed observation can retry admission after space becomes available. This admission retry does not repeat already-executed effects.

Each occurrence binds the reviewed job definition, not merely its condition. The engine rechecks that identity and current local condition before effects. A changed/non-matching/unavailable rule is recorded as skipped with no verified effect. Manual runs also check the condition; an explicit manual run may repeat an action if the condition still matches. Execution checks update the visible observation. Manual false observations count as known false observations when rearming the condition.

Restored backups retain rule definitions disabled and do not restore latches or execution grants. Source code remains read-only. Existing time, event and manual triggers retain their behavior.

## Failure and review alerts

Failed, approval-blocked and interrupted/recovered runs create a durable Inbox alert with a readable explanation. A partial workflow warning tells the owner to inspect completed steps before starting a new run. Skipped conditions do not masquerade as successful execution or generate repetitive failure alerts.

Alert creation and the run's alerted marker are transactional. Duplicate outcome delivery and restart do not repeat the alert or desktop dispatch. Inbox alerts remain available when desktop notifications are disabled. A desktop-host notification exception is recorded without its raw error text and cannot erase or replace the run's receipt. Desktop dispatch is at most once; the persisted Inbox alert remains the reliable record if Windows suppresses a toast or the process stops around dispatch.

This does not implement a general automatic retry policy for every action or safe continuation of every partially completed workflow. Those parts of the full automation acceptance work remain outstanding. Backup upload checkpoints already have their specific resumable-upload safety behavior.

## Current evidence

- `tests/conditions.test.ts`: real local observations, persisted deduplication/rearming, unavailable sources, mode controls, changed rules, skipped effects, queue saturation, and transactional rollback when checkpoint persistence fails.
- `tests/condition-service.test.ts`: actual local reminder through the host, policy-controlled preview, source timestamps, manual recheck, report skipped counts and disabled restoration without a latch.
- `tests/plans.test.ts`: canonicalized conditional AI drafts, safe disabled state and rejected unknown scope.
- `docs/validation/conditions-desktop.json`: four actual Electron checks, including two real timer cycles across restart and no duplicate reminder. No provider/cloud request.
- `tests/automation-alerts.test.ts`: actual failed/blocked host runs, durable deduplication, interrupted recovery, preference handling, safe notification-host failure and no private note content in alerts.
- `docs/validation/automation-alerts-desktop.json`: three actual native recovery/failure/Inbox/restart checks. Legacy interrupted rows are seeded fixtures in an isolated profile; Windows toast display is deliberately not claimed.
- The complete core suite currently passes 163 tests. Source build/type checks pass. The eighteen-check combined native regression and thirty-two-check baseline native regression pass after these changes.

The baseline/combined native scripts no longer use asynchronous `waitForFunction` predicates for host IPC. The installed Playwright implementation treated their Promise as a truthy condition before the host result was known. They now poll awaited host results and assert the actual stored reminder/import state before recording success. This corrects the verification harness; it is not a substitute for the real application observations above.
