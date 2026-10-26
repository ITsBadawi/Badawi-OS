# Official Sources and Limits of Inference
Original source review date: 21 October 2026, Asia/Baghdad. The following primary sources were opened while preparing the original Arabic package. This English edition translates the record; it does not claim a fresh API/account check. External documentation changes, so verify SDK protocols and account model availability during implementation. Internal contracts here do not override provider wire formats.

- S01 [Gemini 3.8 Flash model page](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash): model name/ID/stability. The reviewed page displayed a 2 September 2026 update. It does not prove account access or successful project delivery.
- S02 [Gemini Interactions API overview](https://ai.google.dev/gemini-api/docs/interactions-overview): Google integration path and stateless option. This does not require cloud agents or server-side background execution in this product.
- S03 [Gemini function calling](https://ai.google.dev/gemini-api/docs/function-calling): model/tool protocol. Broker authorization remains Badawi OS responsibility.
- S04 [OpenAI Responses overview](https://developers.openai.com/api/reference/responses/overview): OpenAI adapter reference, not proof of a particular accessible model or subscription entitlement.
- S05 [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling): tool calls/results. Local execution remains constrained by product policy.
- S06 [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data): provider retention boundaries. Local-first and store=false do not establish zero external retention.
- S07 [Google Desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app): native OAuth/PKCE/redirects without requiring a permanent remote operating server.
- S08 [Google Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth): narrow drive.file access. Application grants additionally restrict the backup set.
- S09 [Drive upload guide](https://developers.google.com/workspace/drive/api/guides/manage-uploads): resumable sessions, including interruption and expiry considerations.
- S10 [SQLite Online Backup API](https://sqlite.org/backup.html): consistent snapshots of active databases, not atomic snapshots of every externally changing project file.
- S11 [Electron security](https://www.electronjs.org/docs/latest/tutorial/security): renderer/IPC isolation practices, not automatic security guarantees.
- S12 [Node.js child_process](https://nodejs.org/api/child_process.html): subprocess APIs. Argument arrays/shell:false alone do not neutralize hostile Git configuration.
- S13 [Git documentation](https://git-scm.com/docs/git): CLI/configuration reference. The allowlist and helper/filter restrictions are additional product requirements.

## Decision evidence
S14: referenced conversation ID `6ad89a6b-8bc0-83eb-8d7b-4b8b2f9fd674`, five retrieved turns, some assistant bodies unavailable. S15: the owner's explicit package request named required components and constraints. S16: the owner subsequently requested the full English translation and an exact Antigravity start prompt. Do not attribute detailed decisions to missing source text.

## Package-authored recommendations
The Electron/SQLite choice, numeric resource/deadline/queue limits, missed/DST policy, conservative Git scope, encryption/retention design, and backlog sequence are engineering proposals. They are not requirements imposed by Google/OpenAI or quotations from their documentation. Single-agent-first development is practical judgment for this project, not a claimed comparative benchmark.
