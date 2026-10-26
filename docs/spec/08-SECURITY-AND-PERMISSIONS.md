# Security and Permissions
## Assets and threats
Assets: files/source code, notes, API/OAuth credentials, backup keys, API credits, device integrity, and execution evidence. Threats include prompt injection in files/model output, manipulated paths, hostile Git configuration, renderer compromise, retry errors, corrupted backups, accidental deletion, and exfiltration. A fully compromised Windows account is outside the promised isolation boundary.

## MVP permissions
- Local reads: a grant for a user-selected root with exclusions, size, and type limits; valid until revoked. Never whole-disk access by default.
- Writes: application database and app-managed outputs only. Export/restore to a new user-selected directory needs action-specific authorization. No source-code writes.
- AI transmission: a separate grant per recipe/session defining sources, fields/content, provider, model or model-change policy, and budget. Permission to read is not permission to transmit.
- Git: only the five constrained tools in the workspace specification. No general shell or extension tool.
- Drive: narrow OAuth scope plus a local backup-set/destination/content/restore/retention grant. An OAuth token is not permission to back up the entire device.
- Scheduling: approve activation of the exact recipe within time/step/resource bounds. Policy or scope changes suspend it pending revalidation.
- Deletion: preview application metadata deletion. Drive backup deletion requires an explicit bounded retention grant; never enable it implicitly on first launch.

## Grant contract
subject(user/automationId), action, rootId/resourceId, include/exclude, destination(provider/account/DriveFolder), maxBytes/maxTokens/maxCost, validUntil, scopeVersion, revokedAt. Deny overrides allow. Broad grants cannot override Gaming/Stop. Only the trusted host creates grant records; neither the renderer nor AI may manufacture grants from free-form fields.

## Approval lifecycle
1. Create a typed bounded plan containing registered tools only.
2. Canonicalize arguments, source identities, and destination; compute planHash, dataScopeHash, and resource fingerprints.
3. Present a clear human preview; the decision comes from trusted UI, not model text.
4. Issue an internal approval token bound to plan/resource/destination/expiry. Never send it to AI.
5. Before execution recheck mode, policy, expiry, fingerprints, and budget. Any relevant change invalidates approval or needs a new version; do not alter approved arguments afterward.
6. Consume once-only tokens once. Recurring recipes use a dedicated recurring grant, not a reused one-time token.
7. Revocation blocks subsequent steps and requests cancellation/draining of in-flight work. It cannot retract data already received by a provider.

## AI and prompt injection
Model output is a proposal. Structured schemas constrain format, not truth, authorization, or safety. No secrets in prompts, no system prompt as the only security barrier, and no SDK automatic tool execution. Sanitize context, track provenance, enforce transmission scopes, and do not expose computer use, code execution, or hosted agents in the MVP.
Do not automatically open model-generated links. Do not provide arbitrary URL fetching/SSRF tools. Network access is restricted to approved official provider/OAuth/Drive endpoints; revalidate redirects and never disable TLS verification.

## Secret storage
Use Windows Credential Manager or DPAPI through a vetted Electron-compatible integration. SQLite stores secretRef only. No localStorage, renderer values, logs, project `.env`, or backup inclusion. If secure storage fails, show an error or offer explicit session-only use; never silently fall back to plaintext. Do not ship a developer-wide shared API key. User chat subscriptions must not be assumed to include API credits.

## Desktop isolation
Local trusted UI; nodeIntegration=false; contextIsolation=true; sandbox where supported; restrictive CSP; no remote code; sender/frame/origin validation for every IPC request; input/output schemas and payload limits. Sanitize rendered Markdown and disable active HTML. Block navigation/window.open by default. Open external URLs only on explicit user action with validated HTTPS destinations or a clear destination warning.
No administrator execution or content telemetry by default. Distribution should use signed builds and verified updates; do not implement an updater that executes an untrusted download.

## Retention and audit
Proposed defaults: audit metadata 30 days, sanitized error details seven days; AI content/results follow the user's local retention setting. Show storage size and allow content-reference removal while retaining a sanitized event. Exports remove tokens/session URIs and optionally sensitive paths. Never copy raw prompts/full files into logs automatically.
A local hash chain can reveal modification relative to a trusted checkpoint. It is not absolute protection from a user/process able to rewrite the entire chain.

## Release security gates
Reject tool injection and path escape; verify Git cannot invoke hooks/helpers; test revocation during execution; ensure secrets do not reach renderer/backup/logs; ensure late AI responses after Stop cannot start work. Any failure blocks MVP readiness.

Technical references: [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security), [Node child_process](https://nodejs.org/api/child_process.html). The remaining policy boundaries are product decisions, not guarantees supplied by those libraries.
