# Badawi OS 0.3.0 — implementation status

Updated 2026-10-22. One integrated functional delivery: app-aware chat with real tools and reviewed effects, personal memory, explicit Workspace paths and complete bounded file browser, rich tasks/reminders, actionable dashboard, native notification/tray/login preferences, multi-step workflows and events, opted-in source monitoring, and selected source/assets in encrypted Drive backups.

Current automated suite: 92 passing unit/security/integration tests. See FEATURE-VERIFICATION.md and validation reports for native UI, real Gemini, real Drive and packaged checks. Build/type checking succeeds. No credentials or owner data are shipped.

Real Gemini 2.5 creates actual tasks/memory only after host approval, receives receipts and recognizes the data in a new conversation. Gemini 3.8 is officially listed but returned 503 during this test. No silent fallback and no live OpenAI claim.

Real Drive backup/resume/download/decrypt/restore passed with synthetic application records plus exact selected source and binary assets. Owner Drive consent and credentials remain local. Google OAuth is External/Testing (reconnect can be needed after seven days); second-computer recovery is untested. Recovery key is in the owner's private working directory, excluded from downloads.

This is an unsigned local Windows build with shortcut installation and reviewed local-package update, not a signed public release. Windows notification banners/login behavior depend on system policy. Full installer/uninstaller, automatic download updates, incremental chat streaming, exhaustive fault matrix and deferred FPS benchmarks are not claimed. Project source remains intentionally read-only. Historical 0.1/0.2 evidence is retained with its original version labels.
