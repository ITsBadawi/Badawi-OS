import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/core/store.ts";
import { Service } from "../src/core/service.ts";
import { commandSchema } from "../src/contracts.ts";
test("preferred provider is an explicit persistent setting and never grants configuration or moves a conversation", async () => {
  const store = new Store(":memory:");
  const service = new Service(
    store,
    {
      pickProject: async () => null,
      saveText: async () => false,
      pickKey: async () => null,
      pickRestoreDirectory: async () => null,
      openAuth: async () => {},
      secrets: { get: () => undefined, set: () => {}, remove: () => {} },
    },
    "unused",
  );
  try {
    assert.equal(service.snapshot().defaultProvider, "gemini");
    const command = commandSchema.parse({
      op: "provider.default",
      provider: "chatgpt",
    });
    await service.command(command);
    assert.equal(service.snapshot().defaultProvider, "chatgpt");
    assert.equal(store.setting("provider.default"), "chatgpt");
    assert.equal(service.snapshot().providers.chatgpt.configured, false);
    assert.deepEqual(store.all("chats"), []);
    assert.equal(
      commandSchema.safeParse({
        op: "provider.default",
        provider: "unofficial",
      }).success,
      false,
    );
  } finally {
    service.engine.close();
    store.close();
  }
});
