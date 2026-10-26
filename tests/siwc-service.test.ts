import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/core/store.ts";
import { Service } from "../src/core/service.ts";
import { ChatGPTSubscriptionProvider } from "../src/core/chatgpt-subscription.ts";
import { snapshot } from "../src/core/backup.ts";
import type { ChatGPTClient } from "@siwc/local";
import { streamedReply } from "../src/core/chat.ts";

test("subscription uses existing approvals and explicit background grants, with no API-key fallback or backup credentials", async () => {
  const store = new Store(":memory:");
  let sdkCalls = 0,
    apiCalls = 0;
  const outputs = [
    JSON.stringify({
      reply: "Review task proposal",
      actions: [
        JSON.stringify({
          op: "task.save",
          title: "Approved subscription task",
          done: false,
        }),
      ],
    }),
    JSON.stringify({ reply: "Saved using verified tool receipt", actions: [] }),
    "Approved scheduled summary",
  ];
  const client = {
    subscribe: () => () => {},
    getSession: async () => ({
      status: "connected",
      sharing: true,
      identity: { email: "fixture@example.test" },
    }),
    streamResponse: async () => {
      sdkCalls++;
      return { text: outputs.shift()! };
    },
  } as unknown as ChatGPTClient;
  const subscription = new ChatGPTSubscriptionProvider(client);
  await subscription.restore();
  const service = new Service(
    store,
    {
      subscription,
      secrets: {
        get: (k) =>
          k === "provider.openai" ? "PAID_KEY_MUST_NOT_BE_USED" : undefined,
        set: () => {},
        remove: () => {},
      },
      pickProject: async () => null,
      saveText: async () => false,
      pickKey: async () => null,
      pickRestoreDirectory: async () => null,
      openAuth: async () => {},
    },
    "unused",
    async () => {
      apiCalls++;
      throw Error("PAID_FALLBACK_FORBIDDEN");
    },
  );
  try {
    await assert.rejects(
      service.command({
        op: "provider.save",
        provider: "chatgpt",
        model: "fixture",
        key: "API_KEY",
        maxTokens: 1024,
        maxRequests: 10,
      }),
      /CHATGPT_API_KEY_FORBIDDEN/,
    );
    await service.command({
      op: "provider.save",
      provider: "chatgpt",
      model: "fixture",
      maxTokens: 1024,
      maxRequests: 10,
    });
    await service.command({
      op: "engine.mode",
      mode: "Running",
      epoch: service.engine.snapshot().epoch,
    });
    const chat = await service.command({
      op: "chat.create",
      provider: "chatgpt",
    });
    await service.command({
      op: "chat.send",
      chatId: chat.id,
      text: "Create a task",
    });
    assert.equal(store.all("tasks").length, 0);
    const plan = store.all("plans")[0];
    assert.equal(plan.status, "pending");
    await service.command({ op: "assistant.execute", planId: plan.id });
    assert.equal(store.all("tasks")[0].title, "Approved subscription task");
    assert.equal(sdkCalls, 2);
    assert.equal(apiCalls, 0);
    const note = await service.command({
      op: "note.save",
      title: "Selected note",
      body: "Only this approved note",
    });
    const job: any = {
      op: "job.save",
      name: "Subscription summary",
      kind: "summary",
      provider: "chatgpt",
      noteIds: [note.id],
      enabled: true,
      trigger: { type: "manual" },
      missedPolicy: "skip",
    };
    await assert.rejects(service.command(job), /BACKGROUND_APPROVAL_REQUIRED/);
    const saved = await service.command({ ...job, allowBackgroundAI: true });
    await service.command({ op: "job.run", id: saved.id });
    assert.equal(sdkCalls, 3);
    assert.equal(apiCalls, 0);
    assert.ok(
      store
        .all("inbox")
        .some((x) => x.body?.includes("Approved scheduled summary")),
    );
    const payload = snapshot(store).toString();
    assert.ok(!payload.includes("PAID_KEY_MUST_NOT_BE_USED"));
    assert.ok(!payload.includes("SIWC_LOCAL_SESSION"));
  } finally {
    service.close();
    store.close();
  }
});
test("streaming envelope reveals only decoded reply text and handles incomplete escapes", () => {
  assert.equal(
    streamedReply('{"reply":"Hello\\nworld","actions":["secret command"]}'),
    "Hello\nworld",
  );
  assert.equal(streamedReply('{"actions":["secret command"]}'), "");
  assert.equal(streamedReply('{"reply":"Hello\\u06'), "Hello");
  assert.equal(streamedReply('{"reply":"Hello\\u0639'), "Helloع");
  assert.equal(streamedReply("plain response"), "plain response");
});
