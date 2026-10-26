# Badawi OS 0.2 — implementation evidence

Updated: 2026-10-22. Status: **locally verified 0.2.1 MVP update with real Gemini and Drive evidence**. This is not a complete public production release.

## Current evidence

- Full unit/security/integration suite: **75 passing tests**, 0 failures. Real SQLite persistence, old-format restore, native provider history, source/grant revocation, cancellation, request/budget admission, exact structured-output protocol mappings, real Git fixture repository, bounded file/text operations, encrypted backup/restore, Drive resume/reconciliation and an actual temporary OAuth callback listener.
- Native Windows desktop suite: **32 checks**. Actual renderer, IPC, SQLite, OS secret encryption, native folder/file pickers, text search, selected-file conversation context, local automation, theme, restart and sanitized export. The external provider is not contacted in this suite.
- Native chat/automation suite: **13 checks** using a controlled external transport. Conversation/restart, visible failed draft, disabled proposal review, approved summary, budget settlement and an actual Node timer executing a once schedule.
- Live Gemini suite: **10 checks** with the owner-authorized key and synthetic test content only. Real Gemini 2.5 conversation and follow-up memory, restart persistence, a selected-note summary into the Inbox, settled real token usage, a structured automation proposal opened for review and saved disabled.
- Build/type checking succeeds. npm audit: **0 known vulnerabilities** at this check.
- Final packaged-build checks are recorded separately in docs/validation; consult those reports for the tested executable and date.

Read docs/FEATURE-VERIFICATION.md for FR01–FR12 traceability and docs/CHANGELOG-0.2.md for decisions. Historical 0.1 evidence remains in IMPLEMENTATION-STATUS-0.1.md and is not represented as a current full-release pass.

## Important live distinction

The official model listing accepted the supplied Google key and listed Gemini 3.8 Flash. Real generation on that model returned HTTP 503 through both Interactions and generateContent; a 3.7 diagnostic also returned 503. Gemini 2.5 Flash succeeded and is the explicitly disclosed live-test model. The product default remains Gemini 3.8 Flash, with no automatic fallback. A stored key or model listing is not a successful generation.

Live OpenAI account access was not supplied. Its adapter is tested against controlled protocol/error fixtures. No Gemini key is sent to OpenAI.

## Drive setup status

Updated 2026-10-22: the owner explicitly approved the Google policy and Desktop OAuth access. The Badawi OS Backups project has Drive API enabled; the Desktop client and private external/testing audience are configured. The owner's installed app completed consent for drive.file only and stores credentials through the OS secret store. Its recovery key was exported to a private local folder outside Drive and outside deliverable archives.

The live Drive drill passed six checks using synthetic content: actual OAuth/offline token, chunk interruption at 256 KiB, state reopen and resume with the same remote ID, real refresh-token exchange, remote listing/download/hash/decrypt, and exact notes restored into a new SQLite database. Restored jobs are disabled, roots cleared, engine Stopped and credentials absent. See validation/drive-live.json. No owner notes/code were uploaded by this drill. Cloud test files remain available; no retention deletion was performed.

The live test found and fixed real HTTP 308 handling in 0.2.1. Regression coverage now uses a real HTTP server response rather than a constructed Response. The final live run used the production adapter's unmodified fetch transport. Clean-device OAuth recovery remains untested.

## Remaining release gates

- Clean-device Google account recovery; live OpenAI smoke test when access exists.
- Extended disk-full/crash/update fault matrix and complete screen-reader/200% accessibility review.
- Optional source-code backup sets, opt-in retention deletion, tray/startup and signed installer/update distribution.
- Incremental token streaming is not implemented; chat is genuinely contextual and persistent, with the completed response displayed after arrival.
- A general arbitrary multi-step workflow builder is not implemented; the four supported recipes are reminder, local project report, selected-note summary and Drive backup.
- Local audit chaining is not an external trusted checkpoint.
- FPS/resource release measurements are explicitly deferred by the owner and are not claimed passed.

## Security and lifecycle

No API/OAuth secret is included in deliverables. Live test credentials are passed privately through stdin to isolated diagnostics, encrypted by the app in disposable workspaces and removed with those workspaces. There is no model tool execution, source modification, automatic provider fallback, permanent server, Docker, startup registration or telemetry.

The application starts Stopped. Explicit chat Send authorizes the disclosed conversation/source context; background AI requires a separate note/profile-bound grant and owner-chosen cap/prices. Unknown outcomes retain their conservative reservation. Source/profile edits disable grants, including a recheck before an arriving summary can be published. Disabling an automation also cancels already queued scheduled occurrences.

Database schema 2 adds conversations and remains compatible with prior local records; older 0.1 executables refuse the upgraded schema. Backup format 2 includes conversations, while format 1 remains readable. Restored schedules/grants/roots/credentials stay disabled or absent.

Google external/testing refresh tokens expire after seven days for Drive scopes; reconnect when requested. The app was not publicly published. Official policy: https://developers.google.com/identity/protocols/oauth2/
