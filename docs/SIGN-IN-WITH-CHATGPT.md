# Sign in with ChatGPT in Badawi OS

Implementation working tree, updated 23 October 2026. Real owner account sign-in and request acceptance succeeded in an isolated Windows test profile; the broader feature-parity goal remains open.

## Architecture and security

`src/core/chatgpt-subscription.ts` adapts the official local DevKit to the existing provider layer. The Electron host creates one SDK client with app identity **Badawi OS**, an ephemeral IPv4 loopback callback and a dedicated `userData/chatgpt-subscription` directory. Windows `safeStorage` encrypts/decrypts credential files using its asynchronous APIs. The DevKit handles registration, PKCE, state/nonce/JWT verification, refresh rotation, cancellation and revocation. No passwords, browser cookies, Codex credentials, general HTTP proxy or token getters are used.

Only safe account status and selected model reach the renderer over the existing validated, sender-bound IPC. Gemini keys, OpenAI API keys and the subscription account remain distinct. The subscription branch calls the SDK directly and cannot fall through to the paid-key HTTP adapter. Source read permissions, approved command plans and background source/schedule consent remain enforced by the existing host. Reconnection invalidates previous subscription automation grants. Local request-count limits still apply; USD reservations apply only to separately billed provider connections.

Authentication files are outside logical database backups; the shared file filter also excludes `chatgpt-subscription` and `.chatgpt-auth*`/`chatgpt-auth*` paths if someone attempts to register a containing directory as a project. No SDK credential state is copied into projects, snapshots or exported app state.

## Connection and request flow

1. Settings → ChatGPT Account → **Continue with ChatGPT** opens the official authorization page in the default browser.
2. Sign in personally on OpenAI's page. Identity and optional ChatGPT plan usage are separate permissions on the official consent flow. The DevKit requests its documented scopes; the app never fabricates an identity-only OAuth flow. If identity succeeds without plan permission, the interface shows that usage remains disabled.
3. **تفعيل إذن الاشتراك / إعادة الربط** explicitly requests consent again. Plan eligibility and user/workspace limits are determined by OpenAI. **Manage usage** opens the official ChatGPT usage settings.
4. Read available models, select one and save it. No model identifier is hardcoded for this account. Start the local engine and use **اختبار اتصال ChatGPT** for a real, explicit test request.
5. In Conversation choose **ChatGPT Subscription** for a new conversation. Existing chats keep their original provider. The app sends bounded local history as text and streams reply text to the UI. Proposed tools only execute through the normal approval cards after response validation.
6. Cancel login using the cancel button; cancel a generation with the chat stop button. Disconnect removes renewable local credentials and asks the SDK to revoke the connection. If remote revocation cannot be confirmed, the UI directs the owner to ChatGPT settings.

No paid API fallback occurs. If subscription usage is exhausted, switch provider manually by creating another conversation with a separately configured provider.

## Actual SDK boundaries

The pinned DevKit exposes text input, local account/model management and streamed Responses with `store:false`. Its public `streamResponse` returns text, not token counts or subscription-quota statistics, and does not expose output-token caps, structured-output options or arbitrary tool calls. Badawi therefore keeps local conversation history, validates its own action envelope, reports usage as unavailable, and links to Manage usage. It does not invent a cost, available quota or unsupported SDK options. Existing API-key providers retain their original protocols and budgets.

## Verification

- `tests/siwc-sdk.test.ts`: real upstream SDK, real loopback callback and signed fixture JWTs; controlled remote responses cover wrong-state rejection, PKCE verification, encrypted persistence, restart, refresh, revocation/reauthentication, identity-only permission result, model filtering, SSE, request cancellation, usage limits and reconnect.
- `tests/chatgpt-subscription.test.ts`: adapter context/credential isolation and error sanitization.
- `tests/siwc-backup-security.test.ts`: auth files cannot enter source listings/previews/snapshots.
- `tests/siwc-desktop.mjs`: real Electron IPC, Windows OS encryption, callback, settings model selection, visible incremental text, subscription-only credential and restart. Remote endpoint responses are controlled. See `docs/validation/siwc-desktop.json`.
- The complete existing suite is run separately to detect Gemini/OpenAI, automation, backup and project-permission regressions.

On 23 October 2026 the owner completed actual OpenAI browser consent twice in an isolated Electron profile. The app reported connected status with sharing enabled; actual model discovery returned seven choices. Two explicit test requests returned `OK` from `gpt-6.1-sol`, one before and one after disconnect/reconnect. Restart retained the account, permission and selected model while resetting the engine to Stop. Final disconnect succeeded and the temporary profile was removed. No account identifiers or owner project files were recorded. See `docs/validation/siwc-live-owner-2026-10-23.json`. This proves this account and app flow at that time; it does not guarantee future eligibility or quota.

## Sources, provenance and licensing

Official sources reviewed on 22 October 2026:
- https://developers.openai.com/siwc/quickstart
- https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt
- https://github.com/openai/sign-in-with-chatgpt-devkit
- https://openai.com/policies/sign-in-with-chatgpt-terms/

Vendored `@siwc/local` version 0.1.0 comes from upstream commit `0a36fefeb913055c8c7a1a29b63d82b96b2e841a`. Runtime source is preserved; only the vendored TypeScript config's base path is adjusted and marked. The upstream LICENSE, THIRD_PARTY_NOTICES and compiled notices are preserved in `vendor/siwc-local`. The app uses existing React components; `@siwc/react` is not necessary for this IPC-driven Electron UI.

The DevKit carries the **Sign-in with ChatGPT DevKit Noncommercial License v1.0**; this implementation targets the requested personal local installation. Commercial use of OpenAI's DevKit contribution requires a separate written agreement under that license. Its license does not grant trademarks or service eligibility. Preserve its notices in any noncommercial redistribution; the packaging script copies the license and notices alongside the app.

## Main changed files

`src/contracts.ts`, `src/core/providers.ts`, `src/core/chatgpt-subscription.ts`, `src/core/service.ts`, `src/core/chat.ts`, `src/core/backup.ts`, `src/core/workspace.ts`, `src/desktop/main.ts`, `src/ui/ChatGPTSettings.tsx`, `src/ui/Settings.tsx`, `src/ui/Chat.tsx`, `src/ui/context.tsx`, `package.json`, `package-lock.json`, `vendor/siwc-local`, plus the SDK/security/native tests listed above.
