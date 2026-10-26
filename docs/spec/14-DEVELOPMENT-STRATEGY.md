# Development Strategy and Gemini Identity
## Official identity check
On 21 October 2026, the [specific official model page](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash) was opened for the original package. It confirmed Gemini 3.8 Flash and API ID `gemini-3.8-flash` as Stable. This is a dated verification, not an assumption based on a marketing label. Do not substitute a newer model automatically. The changing latest-model page is insufficient by itself to identify the requested model.
At implementation time verify the current page, actual model available in the coding environment, and account access. A UI label does not independently prove API access or a precise backend model.

## Can it build Badawi OS?
It is a reasonable implementation candidate for a measured trial with explicit contracts and small milestones. That is engineering judgment, not a benchmark performed here. A provider description cannot prove successful delivery of a secure desktop application. M0/M1 results, change quality, real tests, and handling of Windows/SQLite/OAuth edge cases determine suitability. Avoid a single request to build everything regardless of context-window size.

Model capability is separate from execution-environment capability. A chat-only interface may generate text without building/testing. The implementer needs authorized file and execution tools in the chosen development workspace. If unavailable, it must supply a patch/check plan and report blocked execution, not invent results. Developing Badawi OS itself is distinct from the product's read-only inspection of other repositories.

## Recommended default
Start with one Gemini coding agent, one task and one milestone at a time. This reduces duplicated context/token use, contract drift, conflicting edits, and merge overhead. Cloud inference does not require running the model on the owner's GPU, but IDEs, builds, tests, browsers, and local workers still consume resources. The application's Gaming Mode does not automatically suspend external development tools.

Cycle: read the backlog item and contract → specify acceptance → make the smallest change → run the relevant checks → review diff/security → report concise evidence and resource impact → wait at the next milestone gate. Maintain a short handoff with milestone, verified work, decisions, changed files, and next failing check. Do not rely on a very long chat as the sole project memory.

## When multi-agent helps
After contracts stabilize and M1 passes, use an independent read-only reviewer for changes/tests, especially security, scheduling, and backup/restore. The reviewer does not own production secrets or deployment authority. One implementer remains responsible for merging and passing the gate.
Parallel writing is optional only for genuinely independent tasks, such as Gemini/OpenAI adapters after their shared contract is fixed. A practical upper bound is one implementer plus one reviewer, or two independent implementers with one integration owner when justified. Use separate file ownership/branches, a versioned contract, budgets, and timeouts. Do not concurrently edit engine/policy/storage. Two agents agreeing is not proof of safety, particularly when they share the same model and blind spots.

Multi-agent costs can increase: repeated context, more requests, conflict resolution, and concurrent builds/tests consuming CPU/RAM. Measure rather than assuming speed or quality gains. Using agents to develop the product does not require shipping a multi-agent runtime inside it. The MVP is a local coordinator and bounded steps, not permanent independent agents.

## Escalation rule
If the same item fails twice after a clear diagnosis, stop scope expansion, reduce the problem, recheck the contract, and seek a focused review or another model with owner authorization for cost/data sharing. Do not increase the agent count randomly. Track rough time/cost, review-discovered fixes, and tests that exposed defects to judge whether parallelism is worthwhile.

## Antigravity handoff
The owner plans to create the development project in Antigravity. This package makes no claim about a particular Antigravity version, hidden UI feature, model availability, or automation API. Use whatever file/terminal capabilities the actual project session exposes and report any capability limit accurately.
Put the English specification in `docs/badawi-os/` and send document 16. That launcher explicitly authorizes M0 only, so the agent need not request the same permission again. It stops for review at the M0 gate before M1. The current documentation translation does not itself start coding here.
