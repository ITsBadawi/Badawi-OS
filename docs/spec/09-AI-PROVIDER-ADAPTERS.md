# AI Provider Adapters — Gemini and OpenAI
## Verified model identity
On 21 October 2026 the specific [official Google Gemini 3.8 Flash model page](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash) was opened during preparation of the original package. It identified Gemini 3.8 Flash, API model ID `gemini-3.8-flash`, as Stable and documented function calling and structured outputs. This establishes identity, not the owner's account access or successful autonomous delivery of this application. Do not use the informal label "flash3.8" as an API identifier.
This English edition preserves that dated source finding; it is not a new live account check. Revalidate provider documentation and availability when implementation begins.

## Proposed internal adapter contract
Operations: describeCapabilities(profile), validateConfig, estimate(request), generate(request, signal), normalizeError. Normalized events: textDelta, proposedToolCall, usage, completed, failed, cancelledLocal. A result includes provider, model, requestId, status, finishReason, usage, and warnings, not just text.

Request fields: messages with roles/provenance, bounded context, taskIntent, outputSchema, allowedToolDefinitions, token/time/cost limits, traceId, dataScopeHash, runId/stepId, and cancellation signal. Secret values are excluded; the gateway retrieves them just before connection. Provider sampling/thinking parameter names are not assumed identical.

Capabilities include text, streaming, structuredOutputs, functionCalling, supportedSchemaSubset, cancellationMode, retentionControls, contextLimit, usageAvailability. Unknown capabilities must fail closed or use an explicitly disclosed text-only path without execution. Do not enable a capability by guessing. Store versioned capability snapshots and revalidate affected recipes after changes.

## Gemini adapter
For new implementation, evaluate the current [Interactions API](https://ai.google.dev/gemini-api/docs/interactions-overview) and the actual pinned SDK. The documentation reviewed for the original package described stateless operation with `store=false`; prefer it when supported. No previous_interaction_id, server-side background execution, or managed agents in the MVP. Keep bounded conversation state locally and send it explicitly.
If GenerateContent is selected for compatibility, record the decision and isolate it behind a separate tested protocol mapping. Never mix request formats between APIs. Tool proposals go to the broker, not automatic SDK function execution. Preserve protocol-required IDs/response parts within bounded context; do not expose or fabricate private reasoning. Never silently replace model IDs/endpoints with unknown aliases because an HTTP call happened to succeed.

## OpenAI adapter
Use the [Responses API](https://developers.openai.com/api/reference/responses/overview) with a pinned official SDK. Parse output items and function-call IDs; return tool outputs only after broker authorization/execution. Do not assume one text output. Map structured output/function schemas according to the actual API and selected account model; `text.format` is specific to this API path, not a setting to copy blindly across providers. See [Function calling](https://developers.openai.com/api/docs/guides/function-calling).
The owner selects an accessible OpenAI modelId; do not force an expensive model or invent an available model name. Keep state local by default and use `store=false` where supported. This does not imply elimination of all provider retention; review [Data controls](https://developers.openai.com/api/docs/guides/your-data). No hosted tools, hosted vector stores, or background responses in the MVP.

## Errors and limits
- AuthInvalid: disable the affected profile and request a corrected key; no retry loop.
- RateLimited: honor Retry-After/backoff and the three-attempt limit; block work if the issue persists.
- Unavailable/Network: bounded retry before a tool effect; timed-out requests may still incur charges. Never switch providers automatically.
- UnsupportedModel/Schema: show a configuration error. Never silently change the model or weaken strictness and then execute.
- Refusal/Incomplete/Truncated/InvalidOutput: show/save the actual failure; never execute partial arguments or a best guess.
- CancelledLocal: local reading stopped; usageUnknown if no usage arrived. Do not claim cancelledRemote without evidence.

## Cost and privacy
Before enabling background AI, require explicit per-request maxTokens, maxRequests/day, concurrency=1, and a user-chosen daily spend cap. Do not invent a currency amount for the owner. Atomically reserve budget before requests; settle actual usage, or retain a conservative reservation when usage is unknown. Cost/token estimates are not invoices. Store pricing-table date/version; do not hard-code prices as a security assumption. Reaching a cap prevents new requests, not charges already incurred by in-flight work.
Provider fallback is off by default. It requires explicit permission to send content to the second provider and use its budget. Switching models/providers changes neither tool authority nor idempotency. Do not duplicate external effects after AI retries/fallback. Preview outgoing excerpts; do not upload the whole repository.

## Contract tests
Run shared fixtures for both adapters: normal stream, multiple output items, tool proposal, invalid schema, refusal, truncation, 401/429/5xx, midstream disconnect, abort, missing usage, unsupported capability, and tool-allowlist escape. Fakes do not prove account connectivity. A small live smoke test needs separate user approval and credentials. No paid accounts or keys are required to read this package or exercise local-only mode.
