# Badawi OS 0.4.1 — local acceptance build

## Download for Windows

Get the Windows x64 ZIP from [GitHub Releases](https://github.com/ITsBadawi/Badawi-OS/releases/tag/v0.4.1). Extract the complete archive and run `Badawi OS.exe`. The release also includes source code and SHA-256 checksums. This build is unsigned; the account acceptance limits are documented below.

Badawi OS is a local Windows work hub for tasks, projects, files, an approved AI assistant, automation and encrypted Google Drive backups. It is an Electron and Node.js desktop application. The 0.4.1 local acceptance build passed the operational audit and actual owner-profile upgrade; installed shortcuts now open this version. The preserved 0.3.0 package remains available. Deferred account checks are recorded below.

## Start safely

Extract the entire Windows ZIP and open **Badawi OS.exe**. Keep its companion folders. The download contains no owner database, API keys, OAuth credentials or recovery key. For a separate test profile, set `BADAWI_DATA_DIR` to a new empty directory before launching. The application always starts with its engine Stopped; press Run only when you want its background work or AI requests. Existing 0.3.0 user data has not been migrated by preparing this build. Local update uses a reviewed version/hash selection and relaunch; it no longer leaves a permanent local pre-update database copy.

## Working capabilities

- Arabic and English interface, light/dark themes, a context-aware dashboard, pinned items, full and side chat, and quick commands.
- Independent Gemini API, OpenAI API and official Sign in with ChatGPT connections. The owner selects the provider/model; background AI requires separate approval and limits. Real ChatGPT subscription sign-in, permission, request, restart and reconnect passed in an isolated profile. An earlier real Gemini 2.5 request passed; no live OpenAI API key test has been supplied.
- Rich tasks with List/Calendar/Kanban views, recurring tasks, overdue review, AI day/week plans, criteria, owner reviews and source evidence. A real ChatGPT subscription request read synthetic tasks, proposed one flexible-date move, waited for review and left a fixed deadline unchanged. A real private synthetic GitHub Actions run was verified for its exact commit.
- Explicit Workspace with separate Files and Projects roots, bounded content index/catalog, Inbox, classification and links to projects. Project source remains read-only to the assistant; there is no unrestricted shell or AI code-writing agent.
- Registered projects, restricted Git reads, reviewed Clone, selected-file local Commit, separate reviewed GitHub Push and remote confirmation. Private and initially empty synthetic repositories passed live Clone/Commit/Push checks. The assistant may propose file selection only after scoped read and owner approval; it cannot commit or push.
- Google Drive-only permanent backups with compression, encryption, selected project sources/exclusions, resumable upload, verified versions, selective restore and owner-reviewed retention. Real-account synthetic upload/restart/download/decrypt/restore checks passed. Keep the recovery key outside Drive. New compressed copies require this newer reader; 0.3.0 cannot restore them.
- Local scheduled/event/condition automations with durable receipts, explicit grants, bounded read retries, reviewed partial-workflow continuation, missed-run policy, Inbox alerts and Running/Pause/Stop/Gaming gates. Automatic Gaming can watch an owner-set list of Windows executable names.
- Read-only Vercel and Railway deployment adapters. One project-scoped Vercel READY read passed through the packaged app; Railway owner-account acceptance is deferred. No deployment is initiated by Badawi OS.

## Current acceptance boundary

The latest full core suite passed **220/220**. Current Electron runs passed the 32-check baseline, 18-check integration regression, 16 feature-specific operational scripts, live private GitHub publishing and CI, and controlled cancellation/uncertain-network checks. The packaged app also saved a short-lived, project-scoped Vercel token through Settings, read the matching real production READY deployment, retained the result across restart and cleared it on disconnect. A shutdown error found during that run was repaired and source/packaged exit checks passed. See [the current status](docs/FEATURE-PARITY-WORKING-STATUS.md), [the original feature list](docs/BADAWI_OS_FEATURES.md) and `docs/validation/` for exact evidence and remaining gates. Railway account testing is deferred at the owner's request. The final packaged operational audit passed 21 checks across backups, checkpoints, monitoring and workflow continuation. The actual owner-profile upgrade preserved user-record bytes and connected ChatGPT and updated both installed shortcuts. Railway remains deferred, no OpenAI API key is configured, and unexercised live negative-state/commit/retention cases remain explicit coverage limits. Full live feature-parity acceptance is not claimed.

This is an unsigned local build. Windows may warn on first launch. No public installer, automatic online updater, signed distribution or deferred FPS benchmark is claimed. Windows x64 is required.

## Development

With Node.js 24 and npm: `npm ci`, `npm test`, `npm run build`, `npm run test:desktop`, `node tests/complete-desktop.mjs`, `npm run package`. Packaging writes a new version-named directory and refuses to overwrite an existing package. `BADAWI_BACKGROUND=1` is diagnostic mode: SQLite, IPC, timers and filesystem operations remain real, while visible OS notifications, tray, startup and shortcut side effects are suppressed. `BADAWI_DATA_DIR` selects an isolated data directory.
