export type ProviderId = "gemini" | "openai" | "chatgpt";
export type ProviderRequest = {
  provider: ProviderId;
  model: string;
  prompt: string;
  maxTokens: number;
  outputSchema?: Record<string, unknown>;
  history?: { role: "user" | "assistant"; text: string; wire?: any[] }[];
};
export type Generation = {
  text: string;
  model: string;
  usage: { input: number; output: number; thought: number } | null;
  wire: any[];
};
export async function listModels(
  provider: "gemini" | "openai",
  key: string,
  signal: AbortSignal,
  transport: typeof fetch = fetch,
): Promise<string[]> {
  if (!key) throw Error("PROVIDER_NOT_CONFIGURED");
  const combined = AbortSignal.any([signal, AbortSignal.timeout(30000)]);
  const response = await transport(
    provider === "gemini"
      ? "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000"
      : "https://api.openai.com/v1/models",
    {
      signal: combined,
      redirect: "error",
      headers:
        provider === "gemini"
          ? { "x-goog-api-key": key }
          : { Authorization: `Bearer ${key}` },
    },
  );
  if (!response.ok) {
    await response.body?.cancel();
    throw Error(`PROVIDER_HTTP_${response.status}`);
  }
  const body = JSON.parse((await boundedBody(response)).toString("utf8"));
  const names =
    provider === "gemini"
      ? (body.models || [])
          .filter((m: any) =>
            m.supportedGenerationMethods?.includes("generateContent"),
          )
          .map((m: any) => String(m.name).replace(/^models\//, ""))
      : (body.data || []).map((m: any) => m.id);
  return [
    ...new Set<string>(
      names.filter(
        (n: unknown) =>
          typeof n === "string" &&
          /^(gemini-|gpt-|o\d)/.test(n) &&
          !/embedding|audio|tts|image|live|realtime|transcrib/i.test(n),
      ),
    ),
  ]
    .sort()
    .slice(0, 200);
}
export async function boundedBody(response: Response, max = 2 * 1024 * 1024) {
  const reader = response.body?.getReader();
  if (!reader) throw Error("EMPTY_RESPONSE");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) throw Error("RESPONSE_TOO_LARGE");
      chunks.push(value);
    }
  } catch (e) {
    await reader.cancel().catch(() => {});
    throw e;
  }
  return Buffer.concat(chunks);
}
export async function generate(
  req: ProviderRequest,
  key: string,
  signal: AbortSignal,
  transport: typeof fetch = fetch,
): Promise<Generation> {
  if (req.provider === "chatgpt")
    throw Error("CHATGPT_TRUSTED_RUNTIME_REQUIRED");
  if (!key) throw Error("PROVIDER_NOT_CONFIGURED");
  if (
    !/^[\w.\-:/]{1,120}$/.test(req.model) ||
    req.prompt.length > 32000 ||
    req.maxTokens < 128 ||
    req.maxTokens > 4096
  )
    throw Error("INVALID_AI_REQUEST");
  signal.throwIfAborted();
  const openai = req.provider === "openai";
  const legacyGemini =
    req.provider === "gemini" && /^gemini-2\.5-/.test(req.model);
  if (
    (req.history || []).reduce((n, m) => n + m.text.length, req.prompt.length) >
      32000 ||
    JSON.stringify(req.history || []).length > 512000
  )
    throw Error("AI_INPUT_TOO_LARGE");
  const messages = [
    ...(req.history || []),
    { role: "user" as const, text: req.prompt },
  ];
  const conversationInput = req.history
    ? messages.flatMap((m): any[] =>
        m.role === "assistant" && m.wire?.length
          ? m.wire
          : openai
            ? [{ role: m.role, content: m.text }]
            : [
                {
                  type: m.role === "user" ? "user_input" : "model_output",
                  content: [{ type: "text", text: m.text }],
                },
              ],
      )
    : req.prompt;
  const legacyContents = messages.flatMap((m): any[] =>
    m.role === "assistant" && m.wire?.length
      ? m.wire
      : [
          {
            role: m.role === "user" ? "user" : "model",
            parts: [{ text: m.text }],
          },
        ],
  );
  const url = openai
    ? "https://api.openai.com/v1/responses"
    : legacyGemini
      ? `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(req.model)}:generateContent`
      : "https://generativelanguage.googleapis.com/v1beta/interactions";
  const body = openai
    ? {
        model: req.model,
        input: conversationInput,
        ...(req.history ? { include: ["reasoning.encrypted_content"] } : {}),
        max_output_tokens: req.maxTokens,
        store: false,
        ...(req.outputSchema
          ? {
              text: {
                format: {
                  type: "json_schema",
                  name: "badawi_automation",
                  strict: true,
                  schema: req.outputSchema,
                },
              },
            }
          : {}),
      }
    : legacyGemini
      ? {
          contents: legacyContents,
          generationConfig: {
            ...(req.outputSchema
              ? {
                  responseMimeType: "application/json",
                  responseJsonSchema: req.outputSchema,
                }
              : {}),
            maxOutputTokens: req.maxTokens,
            ...(/^gemini-2\.5-flash/.test(req.model)
              ? { thinkingConfig: { thinkingBudget: 0 } }
              : {}),
          },
        }
      : {
          model: req.model,
          input: conversationInput,
          generation_config: { max_output_tokens: req.maxTokens },
          ...(req.outputSchema
            ? {
                response_format: {
                  type: "text",
                  mime_type: "application/json",
                  schema: req.outputSchema,
                },
              }
            : {}),
          store: false,
        };
  let res: Response;
  try {
    res = await transport(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(openai
          ? { Authorization: `Bearer ${key}` }
          : { "x-goog-api-key": key }),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.any([signal, AbortSignal.timeout(120000)]),
      redirect: "error",
    });
  } catch {
    signal.throwIfAborted();
    throw Error("AI_NETWORK_OR_TIMEOUT_USAGE_UNKNOWN");
  }
  if (!res.ok) {
    await res.body?.cancel();
    throw Error(
      res.status === 401 || res.status === 403
        ? "AUTH_INVALID"
        : res.status === 429
          ? "RATE_LIMITED"
          : res.status === 404
            ? "UNSUPPORTED_MODEL"
            : `AI_HTTP_${res.status}`,
    );
  }
  let data: any;
  try {
    data = JSON.parse((await boundedBody(res)).toString("utf8"));
  } catch {
    signal.throwIfAborted();
    throw Error("INVALID_RESPONSE_USAGE_UNKNOWN");
  }
  signal.throwIfAborted();
  if (legacyGemini) {
    if (data.promptFeedback?.blockReason) throw Error("AI_REFUSAL");
    const candidate = data.candidates?.[0],
      parts = candidate?.content?.parts;
    if (!Array.isArray(parts)) throw Error("INVALID_RESPONSE");
    if (parts.some((p: any) => p.functionCall || p.functionResponse))
      throw Error("UNEXPECTED_TOOL");
    if (candidate.finishReason !== "STOP")
      throw Error(
        candidate.finishReason === "MAX_TOKENS"
          ? "AI_INCOMPLETE"
          : "AI_REFUSAL",
      );
    const text = parts
      .filter((p: any) => typeof p.text === "string" && !p.thought)
      .map((p: any) => p.text)
      .join("\n");
    if (!text) throw Error("AI_EMPTY_OR_REFUSAL");
    const u = data.usageMetadata;
    return {
      text: text.slice(0, 100000),
      model: req.model,
      wire: [candidate.content],
      usage:
        Number.isFinite(u?.promptTokenCount) &&
        Number.isFinite(u?.candidatesTokenCount)
          ? {
              input: u.promptTokenCount,
              output: u.candidatesTokenCount,
              thought: u.thoughtsTokenCount || 0,
            }
          : null,
    };
  }
  const steps = openai ? data.output : data.steps;
  if (!Array.isArray(steps)) throw Error("INVALID_RESPONSE");
  if (steps.some((x: any) => /function|tool/.test(x.type)))
    throw Error("UNEXPECTED_TOOL");
  if (data.status !== "completed") throw Error("AI_INCOMPLETE");
  const text: string[] = [];
  for (const step of steps) {
    if (step.type !== (openai ? "message" : "model_output")) continue;
    for (const part of step.content || []) {
      if (part.type === "refusal") throw Error("AI_REFUSAL");
      if (
        part.type === (openai ? "output_text" : "text") &&
        typeof part.text === "string"
      )
        text.push(part.text);
    }
  }
  if (!text.length) throw Error("AI_EMPTY_OR_REFUSAL");
  const u = data.usage;
  const input = openai ? u?.input_tokens : u?.total_input_tokens;
  const output = openai ? u?.output_tokens : u?.total_output_tokens;
  return {
    text: text.join("\n").slice(0, 100000),
    model: req.model,
    wire: steps,
    usage:
      Number.isFinite(input) && Number.isFinite(output)
        ? {
            input,
            output,
            thought: openai
              ? u?.output_tokens_details?.reasoning_tokens || 0
              : u?.total_thought_tokens || 0,
          }
        : null,
  };
}
