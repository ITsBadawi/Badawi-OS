# Scheduled integration monitoring

Implemented 23 October 2026 in the source/build, not the preserved 0.3.0 release.

The owner can select **Inspect GitHub or deployment status** in the automation editor, choose an existing linked project and GitHub/Vercel/Railway, review the exact repository or deployment project/service/environment, and explicitly approve repeated read-only inspections. Workflow steps support the same action and independent consent. Time, event, condition and manual triggers use the existing local engine; Stop/Pause/Gaming gate execution. The app must be running.

Monitoring consent is separate from background AI permission. A SHA-256 grant binds the fixed read capability, registered project, exact source link, local Git root when used, and credential identity. Raw credentials never enter a job, renderer, run receipt or backup. The existing protected integration credential is reused; GitHub public reads can be anonymous, while Vercel/Railway require separately configured credentials.

Before a request and before publishing its result, the host rechecks the current job/step, grant and scope. Replacing/disconnecting credentials or changing linked targets invalidates affected grants and disables rules. Changing a source during a request cancels work. Archiving/relinking a project also revokes relevant grants. Pending assistant approval cards bind credential versions as well as project metadata. Restored definitions remain disabled, without job/step grants or consent flags. The backup payload itself now omits these grants, not merely the restored database.

GitHub uses the existing fixed REST repository/head/compare adapter. Vercel uses fixed GET endpoints. Railway uses fixed read-only GraphQL queries with a project/environment-scoped token; it exposes no mutation or arbitrary query. Adapter limits and official references are in `VERIFICATION-AND-DEPLOYMENTS.md`. No deployment, restart, Git push or source modification is introduced here.

Each completed inspection persists an allowlisted finding, exact target metadata, immutable source reference when available, observed state/status and check time in Inbox and the run receipt. The run label means execution completed. Failed deployment health is shown separately as a warning; missing Git evidence stays unverified. Historical findings do not prove current remote health. The rule notifies on each actual run; condition triggers additionally latch/deduplicate while the condition stays true. No unattended retry or partial-workflow replay has been added in this unit.

## Evidence

- Six behavioral tests in `tests/integration-jobs.test.ts`: independent consent, no requests before permission, failed health versus successful read, credential/target revocation, in-flight changes, workflow ordering, assistant stale approval, draft restrictions, credential isolation, backup grant removal, GitHub unknown comparison and Railway exact scope/read-only queries.
- Four actual Electron checks in `docs/validation/integration-jobs-desktop.json`: native editor and denied consent; a real timer-driven condition inspection; protected credential/grant/receipt persistence and no replay after restart; changed-target revocation before another request. Screenshot inspected in `integration-jobs-desktop.png`.
- The native test uses an isolated synthetic profile and controlled Vercel responses. It does not claim a live owner Vercel/Railway account or new real GitHub acceptance.
- The existing deployment race test now accepts cancellation as well as explicit permission revocation because changing target actively aborts the in-flight request. It still requires no cached old-scope receipt.

The full feature-parity goal remains active. General bounded retries, remaining files/Inbox behavior, reviewed Commit/Push, dashboard/localization, game detection and final release acceptance are still separate unfinished requirements.
