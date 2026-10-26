import { test } from "node:test";
import assert from "node:assert/strict";
import { generate } from "../src/core/providers.ts";
test("automation JSON schemas use each provider native structured-output contract", async () => {
  const schema = {
    type: "object",
    properties: { name: { type: "string" } },
    required: ["name"],
    additionalProperties: false,
  };
  for (const [provider, model] of [
    ["gemini", "gemini-3.8-flash"],
    ["gemini", "gemini-2.5-flash"],
    ["openai", "owner-model"],
  ] as const) {
    let body: any;
    const legacy = model === "gemini-2.5-flash";
    await generate(
      {
        provider,
        model,
        prompt: "Make a draft",
        maxTokens: 512,
        outputSchema: schema,
      },
      "fixture",
      new AbortController().signal,
      async (_u, i) => {
        body = JSON.parse(i!.body as string);
        return Response.json(
          legacy
            ? {
                candidates: [
                  {
                    content: {
                      role: "model",
                      parts: [{ text: '{"name":"Draft"}' }],
                    },
                    finishReason: "STOP",
                  },
                ],
              }
            : provider === "openai"
              ? {
                  status: "completed",
                  output: [
                    {
                      type: "message",
                      content: [
                        { type: "output_text", text: '{"name":"Draft"}' },
                      ],
                    },
                  ],
                }
              : {
                  status: "completed",
                  steps: [
                    {
                      type: "model_output",
                      content: [{ type: "text", text: '{"name":"Draft"}' }],
                    },
                  ],
                },
        );
      },
    );
    if (provider === "openai") {
      assert.deepEqual(body.text.format.schema, schema);
      assert.equal(body.text.format.strict, true);
    } else if (legacy) {
      assert.deepEqual(body.generationConfig.responseJsonSchema, schema);
      assert.equal(body.generationConfig.responseMimeType, "application/json");
    } else {
      assert.deepEqual(body.response_format.schema, schema);
      assert.equal(body.response_format.mime_type, "application/json");
    }
  }
});

// Removing native model steps or replacing history with only the last prompt loses context/signatures.
test("Gemini sends earlier user turns and exact signed model steps in a stateless follow-up", async () => {
  let sent: any;
  const signed = {
    type: "thought",
    signature: "fixture-signature",
    content: [],
  };
  const wire = [
    signed,
    { type: "model_output", content: [{ type: "text", text: "Noted." }] },
  ];
  const result = await generate(
    {
      provider: "gemini",
      model: "gemini-3.8-flash",
      prompt: "What was my number?",
      maxTokens: 256,
      history: [
        { role: "user", text: "My number is 37." },
        { role: "assistant", text: "Noted.", wire },
      ],
    },
    "fixture",
    new AbortController().signal,
    async (_url, init) => {
      sent = JSON.parse(init!.body as string);
      return new Response(
        JSON.stringify({
          status: "completed",
          steps: [
            { type: "model_output", content: [{ type: "text", text: "37" }] },
          ],
          usage: { total_input_tokens: 20, total_output_tokens: 1 },
        }),
      );
    },
  );
  assert.deepEqual(sent.input, [
    {
      type: "user_input",
      content: [{ type: "text", text: "My number is 37." }],
    },
    ...wire,
    {
      type: "user_input",
      content: [{ type: "text", text: "What was my number?" }],
    },
  ]);
  assert.equal(sent.store, false);
  assert.equal(result.text, "37");
  assert.deepEqual(result.wire, [
    { type: "model_output", content: [{ type: "text", text: "37" }] },
  ]);
});
test("OpenAI follow-up retains native reasoning and prior user messages", async () => {
  let sent: any;
  const wire = [
    {
      type: "reasoning",
      id: "rs_fixture",
      encrypted_content: "signed",
      summary: [],
    },
    {
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: "Noted." }],
    },
  ];
  await generate(
    {
      provider: "openai",
      model: "owner-model",
      prompt: "Recall it",
      maxTokens: 256,
      history: [
        { role: "user", text: "37" },
        { role: "assistant", text: "Noted.", wire },
      ],
    },
    "fixture",
    new AbortController().signal,
    async (_u, init) => {
      sent = JSON.parse(init!.body as string);
      return new Response(
        JSON.stringify({
          status: "completed",
          output: [
            { type: "message", content: [{ type: "output_text", text: "37" }] },
          ],
        }),
      );
    },
  );
  assert.deepEqual(sent.input, [
    { role: "user", content: "37" },
    ...wire,
    { role: "user", content: "Recall it" },
  ]);
  assert.deepEqual(sent.include, ["reasoning.encrypted_content"]);
});
test("an oversized conversation is refused before any network call", async () => {
  let called = false;
  await assert.rejects(
    generate(
      {
        provider: "gemini",
        model: "gemini-3.8-flash",
        prompt: "hello",
        maxTokens: 256,
        history: [{ role: "user", text: "x".repeat(32000) }],
      },
      "fixture",
      new AbortController().signal,
      async () => {
        called = true;
        throw Error("unreachable");
      },
    ),
    /AI_INPUT_TOO_LARGE/,
  );
  assert.equal(called, false);
});
test("Gemini 2.5 uses native generateContent conversation parts without silently changing models", async () => {
  let url = "",
    sent: any;
  const content = {
    role: "model",
    parts: [{ text: "Noted.", thoughtSignature: "signed-part" }],
  };
  const result = await generate(
    {
      provider: "gemini",
      model: "gemini-2.5-flash",
      prompt: "Recall",
      maxTokens: 256,
      history: [
        { role: "user", text: "37" },
        { role: "assistant", text: "Noted.", wire: [content] },
      ],
    },
    "fixture",
    new AbortController().signal,
    async (u, i) => {
      url = String(u);
      sent = JSON.parse(i!.body as string);
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: { role: "model", parts: [{ text: "37" }] },
              finishReason: "STOP",
            },
          ],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 1,
            thoughtsTokenCount: 0,
          },
        }),
      );
    },
  );
  assert.equal(
    url,
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
  );
  assert.deepEqual(sent.contents, [
    { role: "user", parts: [{ text: "37" }] },
    content,
    { role: "user", parts: [{ text: "Recall" }] },
  ]);
  assert.equal(result.text, "37");
  assert.equal(result.model, "gemini-2.5-flash");
  assert.equal(result.usage!.input, 10);
});
