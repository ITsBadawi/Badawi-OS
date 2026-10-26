# Safe automation retries

The owner can enable connection retries in the integration automation editor. It is off for new rules and AI drafts. A saved policy selects two or three total attempts, including the first, with a delay of 15–300 seconds. The integration's independent target/account consent remains mandatory. Existing jobs without a policy still run once.

Only `GITHUB_NETWORK` and `DEPLOYMENT_NETWORK` permit automatic retry. These represent failed bounded read requests. Authentication, permissions, rate limits, invalid responses and approval failures do not. This policy does not automatically repeat AI requests, backups or workflow steps. AI request retries retain their separate explicit review and budget accounting; interrupted Drive uploads use their existing verified checkpoint path.

One occurrence retains a bounded ledger of actual starts, sanitized failures and completion. A failed read waits in `retryWaiting` until its due time; the ordinary local engine timer dispatches it. There is no independent background timer that can bypass Running/Pause/Stop, Gaming Mode or settling time. The run list shows the next attempt, ledger and cancellation control; reports count waiting retries as pending rather than successful.

The retry is bound to the job definition, project root/linked target and credential version. A changed scope cancels it before another request; adapter-level grants are checked again during execution. Starting a new manual inspection supersedes an older waiting retry for that job. A full queue refuses the new request without running an unrelated queued job.

Restart converts a waiting retry into `needsReview`, clears its due time and creates the existing durable operational alert. It does not silently replay the request. Backup/restore carries the validated policy as a disabled definition and strips integration consent/grants. No credentials are added to snapshots.

AI can propose the bounded policy when requested, using the existing reviewed `job.save` tool or disabled automation draft. A new draft's retry checkbox remains off until the owner chooses it. Unknown persisted job kinds fail visibly instead of falling through to a fabricated successful reminder.

Evidence: behavioral engine tests cover due times, cap, excluded failure/classes, controls, source changes, restart, manual supersession and full queues. Service tests cover real adapter dispatch, consent, one inspection receipt, cancellation and restored disabled definitions. Draft tests enforce bounded read-only proposals. `validation/automation-retry-desktop.json` records actual Electron editor/timer/cancellation/restart checks with an isolated profile, Windows secret storage and controlled Vercel transport. It does not prove owner-account availability.

Reviewed continuation of a partially completed workflow is now implemented separately, with bound successful-step receipts, explicit review of remaining steps and acknowledgement of uncertain effects. See `REVIEWED-WORKFLOW-CONTINUATION.md` for its independent evidence. General feature parity, linked-account acceptance and the new packaged release remain open. Work was paused at the owner's request after that unit.
