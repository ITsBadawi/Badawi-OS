# Badawi OS — Start Here
Project specification and implementation handoff • English edition 1.1 • 21 October 2026

## One-minute overview
Badawi OS is a personal desktop application for files, projects, lightweight automation, and AI assistance. It is not a replacement operating system. Data and scheduling remain local. Gemini and OpenAI are optional cloud AI providers. Google Drive is the only cloud backup destination. No Docker, n8n subscription, rented server, or permanent backend service is required. Internet access is needed for cloud AI and Drive, not for viewing projects or managing the local queue.

Current status: documentation only; application implementation has not started. New technical choices are proposals, not retroactively attributed decisions from the earlier conversation. This package does not certify unwritten code or guarantee FPS before measurement on the user's hardware.

This edition translates the entire specification into English. It preserves the product requirement for a concise Arabic/RTL interface with LTR paths and technical identifiers. English implementation documents do not automatically change the product's interface language. Communication with the owner should remain brief and in Arabic unless requested otherwise.

## Using this package in Antigravity
1. Create/open your intended Badawi OS project folder in Antigravity.
2. Extract this package into a `docs/badawi-os/` folder inside that project. Keep the English edition there; do not mix English and Arabic versions as competing specifications.
3. Send the exact contents of [16-ANTIGRAVITY-START-PROMPT.md](16-ANTIGRAVITY-START-PROMPT.md) to your coding agent. It tells the agent to read every numbered specification, inspect the actual workspace, and implement M0 only.
4. Sending that launcher is your explicit authorization for M0 in the project you opened. Uploading the documents alone is not authorization. Do not send it until you want implementation to begin in Antigravity.
5. Review the M0 evidence before authorizing M1. Do not ask for the entire application in one pass.

## Package contents
- [Master Prompt](01-MASTER-PROMPT.md)
- [Decisions and scope](02-DECISIONS-AND-SCOPE.md)
- [Product requirements / PRD](03-PRD.md)
- [Architecture and data contracts](04-ARCHITECTURE.md)
- [Local automation engine, modes, and Gaming Mode](05-AUTOMATION-ENGINE.md)
- [Smart Dashboard and user experience](06-SMART-DASHBOARD-UX.md)
- [Files / Projects and authorized Git tools](07-WORKSPACE-AND-GIT.md)
- [Security and permissions](08-SECURITY-AND-PERMISSIONS.md)
- [Gemini and OpenAI provider adapters](09-AI-PROVIDER-ADAPTERS.md)
- [Google Drive backups and restore](10-GOOGLE-DRIVE-BACKUPS.md)
- [Verification and audit](11-VERIFICATION-AND-AUDIT.md)
- [Operational test plan](12-OPERATIONAL-TEST-PLAN.md)
- [MVP backlog and delivery gates](13-MVP-BACKLOG.md)
- [Development strategy and Gemini identity](14-DEVELOPMENT-STRATEGY.md)
- [Official source register](15-OFFICIAL-SOURCES.md)
- [Exact Antigravity launch prompt](16-ANTIGRAVITY-START-PROMPT.md)

## Reading formats
Markdown files are the editable source and the coding agent's input. `Badawi-OS-English-Handbook.html` combines the documents into an offline English handbook with navigation and print styles. The ZIP includes both formats, document validation results, and SHA-256 checksums. No API key or application installation is needed to read it.

## Proposed implementation choices
Windows first; Electron + React + TypeScript; a local Node.js engine and SQLite. Launch at login is disabled initially. The engine starts Stopped on first launch. These choices reduce the number of technologies and simplify implementation, but are to be validated at the M0 gate.

## Edition changes
Edition 1.1 translates the original package, adds explicit Antigravity handoff instructions and a scoped M0 authorization prompt, and clarifies that implementation-document language does not change the Arabic product UI requirement. The original Arabic package remains available separately. No application code is part of either package.
