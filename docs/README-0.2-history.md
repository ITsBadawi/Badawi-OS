# Badawi OS 0.2

A working Windows desktop preview of the owner's local-first workspace. Arabic RTL UI, approved light/dark design, embedded local fonts, no Docker or operating server.

## Run the packaged application

Extract the entire Windows ZIP and open **Badawi OS.exe** inside its folder. Keep its companion files. No Node installation or API key is needed for local notes, tasks, projects and deterministic schedules. This is an unsigned local preview, not a public production release.

The engine starts **Stopped** on every launch. Click Running before indexing, Git reads or executing automations. Pause/Stop close admission immediately and abort cooperative work; the UI reports draining until the operation settles. Gaming is an independent overlay, persists across launches, and never resumes Pause/Stop when disabled. No source watchers, local AI models or embeddings run in the background.

## Implemented flows

- Smart Dashboard with actual local state, upcoming jobs, tasks, projects, backup status and audit.
- SQLite migrations, transactional writes, request validation and OS-encrypted secrets.
- Native folder picker, read-only file previews, bounded filename/text searches with file/line evidence, secret/link/hardlink exclusion. Text searches inspect at most 100 files and the first 32,768 characters of each, returning at most 50 matches.
- Tasks and editable notes outside source repositories; search across local workspace records.
- Five constrained read-only Git wrappers; unsafe configurations and advanced worktrees refused.
- Manual/once/daily/weekly schedules with IANA zones, DST gap/overlap handling, occurrence deduplication, skip or reviewed catch-up. Jobs save disabled by default.
- Local reminders and evidence-based project reports in the Inbox. No repository commands/builds are executed.
- Persistent Gemini/OpenAI conversations with native multi-turn history, selected note/project/file attachments, send/cancel/retry, failed/interrupted states and restart persistence. Gemini 3.8 uses Interactions; explicitly selected Gemini 2.5 models use generateContent. OpenAI uses Responses. No automatic model/provider fallback or model tool execution.
- AI note-summary recipes with explicit selected-source/background grants, daily request/output-token limits and owner-configured USD reservations. Source/profile edits revoke grants. AI can propose a strictly validated automation draft; the owner reviews it before saving or enabling.
- Google Desktop OAuth with PKCE/state and drive.file, system browser and temporary loopback listener. AES-256-GCM logical database snapshots, separate recovery kit, resumable 256 KiB uploads, download/decrypt/hash/schema verification, checkpoint/reconciliation, restore into a new folder with jobs disabled and root grants removed. No source-code backup or retention deletion in this version.
- Local audit chain, validity indicator and JSON export; detects content/chain edits but is not a tamper-proof log.

## Account setup

Use Settings to save a Gemini or OpenAI API key and an accessible model ID. Saving a key makes no network call. Open **المحادثة**, create/select a conversation, and send normally. Send authorizes transmission of that conversation's history and disclosed selected attachments to its provider. Notes are sent in full; project evidence contains up to 100 filenames and Git status; a deliberately selected source file contributes at most 12,000 characters with line labels. No other files are automatically attached. Keys are protected by Electron safeStorage / Windows DPAPI in the main process and never returned to the renderer. Requests can still incur provider charges after cancellation.

Background summaries additionally require selecting the exact notes, approving the grant, and choosing a daily USD cap with dated per-million input/output prices in Settings. Estimates conservatively reserve UTF-8 input bytes plus protocol overhead and bounded output. Known usage settles the reservation; unknown/failing outcomes retain it. Pricing settings are estimates, not a guaranteed invoice cap. The application does not invent a daily spend amount for the owner.

Live diagnostic on 2026-10-21: the supplied Google key was accepted; Gemini 3.8 Flash returned HTTP 503 from both advertised generation paths. Gemini 2.5 Flash returned HTTP 200 and passed the real two-turn Electron conversation/restart test. The app default remains Gemini 3.8 Flash. Select a different model deliberately if you want to use one while 3.8 is overloaded. See docs/CHANGELOG-0.2.md and validation/chat-live.json. OpenAI has protocol-fixture verification; a live OpenAI account was not supplied.

Drive requires your Google Cloud project with Drive API enabled and a **Desktop** OAuth client. Enter its client ID/client secret in Backups; connect through your browser. The granted scope is drive.file only. The app creates a backup folder and opaque backup files. Export the recovery key to an independent safe location before enabling backups. The encrypted artifact contains sanitized app records, not source files, account secrets or file grants. Importing a recovery key stores it separately for restore and never replaces a key used by pending uploads. Disconnect revokes tokens where reachable and immediately removes local token access. No live account has been connected during development.

Restore uses a new `Badawi-Restored-...` directory under a native-selected parent. The live workspace remains unchanged. To inspect a restored workspace as the active app, exit Badawi OS and launch it with the `BADAWI_DATA_DIR` environment variable set to that restored directory. This explicit override is also used for isolated diagnostics. Reconnect source folders and accounts; automations remain disabled. Cross-device OAuth access is not verified until a real clean-device restore drill succeeds.

## Data and lifecycle

Default database: `%APPDATA%\Badawi OS\badawi.db`. SQLite WAL is enabled; do not copy a live database manually. The backup implementation exports a consistent **logical** snapshot inside a SQLite read transaction into a versioned, validated format, rather than copying database/WAL files. There are no separate note files to race with the snapshot.

Closing the window exits the app after draining. Suspend stops the engine. There is no startup registration, tray persistence, permanent service, automatic update downloader, telemetry, or renderer network access. All package assets are local. No FPS benchmark is triggered or game settings changed.

## Develop

Prerequisites: Windows x64, Node 24 LTS, npm, and optional Git in its standard installation directory. Electron 45 bundles Node 24 and supports the tested built-in node:sqlite API; no native SQLite ABI addon is needed.

```text
npm ci
node node_modules/electron/install.js
npm test
npm run build
npm run test:desktop
npm run test:chat
npm start
npm run package
```

On npm installations that skip dependency install scripts, the explicit Electron install step above downloads the pinned runtime. All runtime host modules are bundled; the package does not need node_modules. `npm run package` rebuilds only `release/Badawi-OS-0.2.1-Windows` inside this project and preserves earlier 0.1 and 0.2 folders. `BADAWI_BACKGROUND=1` suppresses the window for diagnostics; it does not register a background service.

Version 0.2 upgrades the local database to schema 2 to add conversations; an older 0.1 executable refuses the upgraded schema. It still reads legacy format-1 backups. Exit the older application before opening 0.2; both versions intentionally share the same default workspace and single-instance boundary.

See [implementation evidence and remaining release gates](docs/IMPLEMENTATION-STATUS.md), [operational tests](docs/spec/12-OPERATIONAL-TEST-PLAN.md), and the source references in `docs/spec/15-OFFICIAL-SOURCES.md`.

## Protocol sources

Implementation checked on 2026-10-21 against [Electron security](https://www.electronjs.org/docs/latest/tutorial/security), [Node SQLite](https://nodejs.org/api/sqlite.html), [Gemini Interactions REST](https://ai.google.dev/api/interactions-api), [Gemini 3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash), [OpenAI text generation](https://developers.openai.com/api/docs/guides/text), [desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app), and [Drive resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads). These sources establish protocols, not successful access to the owner's accounts.

## Licenses

IBM Plex Sans Arabic font files are redistributed under SIL OFL; see public/fonts/OFL.txt. Electron's LICENSE and LICENSES.chromium.html accompany the packaged runtime. Dependency versions and licenses are recorded by package-lock.json and package metadata.

## Drive patch 0.2.1 — 2026-10-22

Real Google OAuth, chunked upload, interruption/resume, refresh, download, hash/decrypt and fresh-folder restore passed using synthetic data. HTTP 308 upload receipts are exposed with manual redirects; redirects are never followed. See docs/validation/drive-live.json. Owner account connection is configured locally; OAuth credentials and recovery keys are not distributed. The OAuth app remains private testing; a clean-device OAuth flow is not claimed tested.

Google external/testing refresh tokens expire after seven days for Drive scopes; reconnect when requested. The app was not publicly published. Official policy: https://developers.google.com/identity/protocols/oauth2/
