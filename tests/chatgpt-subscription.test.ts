import { test } from "node:test";
import assert from "node:assert/strict";
import { ChatGPTSubscriptionProvider } from "../src/core/chatgpt-subscription.ts";
import type { ChatGPTClient } from "@siwc/local";

test("subscription adapter preserves context, streams text and never supplies paid API credentials", async () => {
  let input: any;
  const client = {
    getSession: async () => ({
      status: "connected",
      sharing: true,
      identity: { email: "fixture@example.test" },
    }),
    subscribe: () => () => {},
    listModels: async () => [{ slug: "fixture-model", displayName: "Fixture" }],
    streamResponse: async (o: any) => {
      input = o;
      o.onDelta("Hello");
      o.onDelta(" world");
      return { text: "Hello world" };
    },
    signIn: async () => ({ status: "connected", sharing: true }),
    disconnect: async () => {},
    cancelSignIn: () => {},
  } as unknown as ChatGPTClient;
  const p = new ChatGPTSubscriptionProvider(client);
  await p.restore();
  assert.equal(p.available(), true);
  assert.deepEqual(await p.models(new AbortController().signal), [
    "fixture-model",
  ]);
  const chunks: string[] = [];
  const r = await p.generate(
    {
      provider: "chatgpt" as any,
      model: "fixture-model",
      prompt: "today",
      maxTokens: 512,
      history: [
        { role: "user", text: "yesterday" },
        {
          role: "assistant",
          text: "reply",
          wire: [{ secret: "never transmit" }],
        },
      ],
    },
    new AbortController().signal,
    (d) => chunks.push(d),
  );
  assert.equal(r.text, "Hello world");
  assert.deepEqual(chunks, ["Hello", " world"]);
  assert.deepEqual(input.input, [
    { role: "user", content: "yesterday" },
    { role: "assistant", content: "reply" },
    { role: "user", content: "today" },
  ]);
  assert.equal(input.apiKey, undefined);
  assert.equal(r.usage, null);
  assert.deepEqual(r.wire, []);
});
test("subscription errors are sanitized, unavailable sharing is refused and disconnect cancels local use", async () => {
  let state: any = { status: "connected", sharing: false };
  let listener: any;
  const client = {
    getSession: async () => state,
    subscribe: (f: any) => {
      listener = f;
      return () => {};
    },
    disconnect: async () => {
      state = { status: "disconnected", sharing: false };
      listener(state);
    },
    listModels: async () => {
      throw {
        code: "subscription_sharing_usage_limit_exceeded",
        message: "SECRET_TOKEN",
      };
    },
  } as unknown as ChatGPTClient;
  const p = new ChatGPTSubscriptionProvider(client);
  await p.restore();
  assert.equal(p.available(), false);
  await assert.rejects(
    p.generate(
      {
        provider: "chatgpt" as any,
        model: "fixture",
        prompt: "x",
        maxTokens: 512,
      },
      new AbortController().signal,
    ),
    /CHATGPT_SHARING_NOT_ENABLED/,
  );
  state = { status: "connected", sharing: true };
  await p.restore();
  await assert.rejects(
    p.models(new AbortController().signal),
    (e) => (e as Error).message === "CHATGPT_USAGE_LIMIT",
  );
  assert.ok(!JSON.stringify(p.status()).includes("SECRET_TOKEN"));
  await p.disconnect();
  assert.equal(p.available(), false);
});
