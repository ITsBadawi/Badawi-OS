# Task evidence, work reports and deployment monitoring

This describes the current source implementation and the separate 0.4.1 local acceptance package, not the previously delivered 0.3.0 Windows package. A live project-scoped Vercel READY read through the packaged app passed; Railway account testing is deferred by the owner.

## Tasks

The task editor accepts up to 20 distinct acceptance criteria. Each has a description and a source: owner review, a local Git commit, a GitHub Actions workflow, or a linked deployment. An optional full commit SHA binds technical checks to the requested revision.

Marking a task completed is a claim. The separate verification state is one of in progress, verified, needs review, or unverified. Technical signals alone do not establish semantic acceptance: the owner must explicitly review the criterion. The AI can propose criteria and a verification action but cannot submit the owner's review.

Reviews bind the task's requirements, dates, subtasks, project association, acceptance criteria, revision and project source links. A change invalidates the previous review and verification. Recurring occurrences retain criteria but start without inherited reviews or proof. Restored backups retain criteria and revision, while dropping trusted review and verification records.

Git evidence uses the restricted local Git reader, without running project tests, scripts, hooks or general shell commands. CI evidence reads GitHub Actions workflow runs for the selected commit, optionally narrowed to a workflow name/path. Unknown, incomplete, skipped or unavailable results never become a success. Private repository tokens require Actions read permission in addition to the existing repository metadata/content permissions. These checks prove source facts at the displayed observation time, not that the code satisfies the criterion.

## Local work reports

The Reports page and read-only `report.read` tool derive current task/project counts from SQLite. They distinguish completion claims from current verified acceptance, show overdue tasks, historical automation outcomes, verified Drive records and inbox alerts. Reports can be filtered to a project and a 7/30/90-day window; the host API also accepts 1–365 days.

The window applies to automation runs, inbox alerts and the bounded activity sample. Task/project totals represent current records, not tasks completed within the selected period. Automation counts read all persisted matching runs, rather than the dashboard's 100-row display. A workflow containing several projects is counted as a whole matching run, not falsely attributed to individual steps. Audit activity is global, drawn from the latest 200 events even for project reports. Overdue detail is capped at 100, alert detail at 20; counters include the remainder.

Reports do not access networks, inspect project files, or poll external services. Their Drive counts describe local historical receipts for the current linked Drive account and exclude trashed copies; they do not re-prove remote existence. Every report includes generation/source times and explicit limits. Owner export writes the actual derived report through the native Save dialog. The AI cannot export files with the report tool. No credentials, absolute project paths, note bodies, provider response payloads or run result bodies are included.

## Deployment adapters

Settings accepts separate protected credentials for Vercel and Railway. Credentials use the existing Windows safeStorage-backed secret service and never enter the renderer snapshot, audit details or backups. Saving a credential is not a successful connection test. A project stores service identifiers in its metadata; the owner checks it from the project's details dialog, or approves a `deployment.check` assistant action.

Vercel requests are fixed GET requests to its official deployment list/detail endpoints, narrowed to the registered Project ID, optional Team ID and Production/Preview target. Detail reads request documented Git repository information. A successful state with a different or unavailable requested commit is unverified. READY is an observed deployment state, not an uptime guarantee or evidence of production alias promotion.

Railway currently accepts environment-scoped Project Tokens. Before reading deployments, it verifies the token's project/environment against the selected Project/Service/Environment IDs. Requests use the documented Project-Access-Token header and fixed read-only GraphQL queries. No arbitrary GraphQL, variables/environment-secret reads, logs, mutations, deploy, restart or delete operations are exposed.

Railway documents deployment metadata as JSON without a stable commit-field contract in the references used here. The adapter therefore proves the reported service state; an exact-commit criterion stays unverified when a SHA cannot be established. It does not infer a match from a guessed metadata property. This limitation is visible in the UI and should be revisited using current official schema/real-account evidence, without declaring a false match.

Changing a project link during a check prevents publishing its old-scope receipt. Disconnecting credentials cancels work and clears the corresponding cached checks. Restart retains historical receipt timestamps, starts the engine stopped, and does not replay requests. New external checks require the engine to be Running with Gaming disabled and existing tool approval rules in force.

## Evidence available

- `tests/task-evidence*.test.ts`: requirement/review invalidation, actual synthetic Git commit reads, restore and recurrence boundaries.
- `docs/validation/task-evidence-desktop.json`: four real Electron UI/SQLite checks.
- `tests/reports.test.ts` and `tests/report-service.test.ts`: aggregation boundaries, account selection, real report bytes exported to a temporary test directory and no external requests.
- `docs/validation/reports-desktop.json`: three native report checks.
- `tests/deployments.test.ts` and `tests/deployment-service.test.ts`: fixed request scopes, source states, revision mismatches, missing proof/auth, cancellation, changed-link race, protected-boundary behavior and snapshot isolation. Remote API replies are controlled test fixtures.
- `docs/validation/deployments-desktop.json`: four native UI/Windows encryption/restart checks with controlled remote replies. It does not prove a live owner deployment.

## Manual account acceptance still needed

1. The 24 October 2026 owner test created a one-hour Vercel token scoped to badawi-card, entered it only in packaged Badawi OS Settings, linked the exact Project ID, Team ID and production target in a synthetic local project, and read verified READY deployment `dpl_L54ixfYdgRrSAEtxSd2yoL2feqMy`. An independent Vercel list matched the ID/state. Restart retained the protected credential and historical result with engine Stop; disconnect cleared the credential and cached result, and the isolated profile was removed. After separate owner confirmation, Vercel reported successful deletion of the temporary token and its row disappeared. The app check did not request an exact commit SHA or test a non-ready state. See `validation/vercel-live-owner-2026-10-24.json`.
2. Add a Railway Project Token for the intended environment, and its exact project/service/environment identifiers. Compare the displayed receipt with Railway. A token for another environment must fail scope validation before deployment reads.
3. For a task tied to a full commit, confirm that a mismatching or unavailable deployment revision remains unverified. Owner acceptance must not turn an unknown technical result into verified evidence.
4. Disconnect each integration and restart. Confirm credentials are removed locally, old cached checks disappear, existing task evidence stays explicitly historical, and no requests replay.

## Official references reviewed

- [GitHub workflow runs](https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-repository).
- [Vercel deployment listing](https://vercel.com/docs/rest-api/deployments/list-deployments).
- [Vercel deployment details and withGitRepoInfo](https://vercel.com/docs/rest-api/deployments/get-a-deployment-by-id-or-url).
- [Vercel API token authentication and team scope](https://vercel.com/docs/rest-api).
- [Railway API authentication and project tokens](https://docs.railway.com/integrations/api).
- [Railway deployment read queries and states](https://docs.railway.com/integrations/api/manage-deployments), including the [official documentation source](https://github.com/railwayapp/docs/blob/main/content/docs/integrations/api/manage-deployments.md).

The requested model name was also checked against [Google's official Gemini 3.8 Flash model page](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash): it lists `gemini-3.8-flash`. Availability in this owner's API account is still determined by authenticated model discovery and an actual connection test; no existing owner model setting is silently changed.
