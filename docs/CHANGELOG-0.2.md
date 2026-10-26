# Badawi OS 0.2

The owner requested a functional audit, real multi-turn AI conversation, and closer alignment with the approved plan. FPS work is explicitly deferred.

- Replaced the one-shot assistant modal with a full conversation page: local conversation list, multi-turn context, one-click send, new/delete, selected attachments, visible pending/failed/cancelled/interrupted states, explicit retry and response cancellation.
- Preserves native Gemini/OpenAI continuation items locally, including signed reasoning items when returned, rather than pretending the last prompt alone is a conversation. No server-side storage or automatic model/provider switching.
- Added selected-file discussion with bounded excerpts and line labels, project evidence, note discussion shortcuts, and local bounded text search with file/line matches.
- Added the missing note-summary recipe. Owner chooses the exact notes, provider, schedule and background grant. Source/profile edits revoke the grant. Revocation while a response is arriving prevents publication as a verified result.
- Added conservative atomic USD reservations based on owner-entered dated prices and daily cap; unknown usage retains its reservation. Background AI requires this configuration. Estimates are not invoices.
- Added AI automation proposals from a conversation. A strict validator accepts only the supported recipes and already selected sources. The owner reviews the disabled draft before saving or enabling it.
- Schema 2 stores conversations; backup format 2 includes them. Legacy format-1 snapshots remain readable. Restored schedules stay disabled and background grants/credentials are not restored.
- Sanitized worker failure codes before persistence. Added actual last-successful-provider timestamps; a stored key is never presented as a successful live connection.

## Live account evidence

On 2026-10-21, Google's model listing accepted the owner-supplied key. Gemini 3.8 Flash was listed, but small synthetic generation requests returned HTTP 503 through both Interactions and generateContent. A separate Gemini 3.7 diagnostic also returned 503. Gemini 2.5 Flash generateContent returned HTTP 200, and an actual Electron conversation test passed two turns with context plus full restart persistence using that explicitly disclosed diagnostic model. The product default remains `gemini-3.8-flash`; no fallback silently changes it.

The key was passed to isolated tests in memory through stdin, stored only through the app's normal OS-encrypted credential path in disposable test workspaces, and omitted from sources, reports, screenshots and archives. The owner should rotate it after testing as planned.

## Decision updates

- ADR15: A normal Send action authorizes the visible typed message and disclosed conversation history/selected attachments to that conversation's provider. A second preview modal is no longer part of ordinary conversation. Separate background automation grants remain mandatory.
- ADR16: Background AI now requires an owner-chosen daily USD cap and dated input/output prices, in addition to request/token limits and single-job admission. Unknown outcomes remain reserved; pricing errors or external billing adjustments cannot be represented as a guaranteed invoice cap.
- ADR17: Native provider history is private host data. The renderer receives display messages only. Revoked source links block future transmission; a changed source cannot be silently retried as the originally approved payload.
- ADR18: Explicitly selected Gemini 2.5 models use generateContent with native model parts. Gemini 3.8 uses Interactions. This is model-specific protocol support, not automatic fallback.
