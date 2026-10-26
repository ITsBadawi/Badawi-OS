import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/core/store.ts";
import { Service } from "../src/core/service.ts";

const answer = (reply: string, actions: object[] = []) =>
  Response.json({
    status: "completed",
    steps: [{
      type: "model_output",
      content: [{
        type: "text",
        text: JSON.stringify({ reply, actions: actions.map((a) => JSON.stringify(a)) }),
      }],
    }],
    usage: { total_input_tokens: 20, total_output_tokens: 10 },
  });

test("day/week assistant reads current tasks and reschedules only a flexible task after approval", async () => {
  const store = new Store(":memory:");
  const secrets = new Map<string, string>();
  let calls = 0;
  let flexibleId = "";
  const transport: typeof fetch = async (url, init) => {
    assert.equal(String(url), "https://generativelanguage.googleapis.com/v1beta/interactions");
    calls++;
    if (calls === 1) return answer("I will inspect the current tasks.", [{ op: "task.list" }]);
    if (calls === 2) {
      const body = JSON.parse(String(init?.body));
      assert.match(JSON.stringify(body), /task\.list/);
      assert.match(JSON.stringify(body), /Flexible report/);
      return answer("Move the flexible report to tomorrow; leave the fixed release unchanged.", [{
        op: "task.save",
        id: flexibleId,
        title: "Flexible report",
        done: false,
        dueAt: "2026-10-27T09:00:00Z",
      }]);
    }
    return answer("The approved flexible-task change is recorded.");
  };
  const service = new Service(store, {
    pickProject: async () => null,
    saveText: async () => false,
    pickKey: async () => null,
    pickRestoreDirectory: async () => null,
    openAuth: async () => {},
    secrets: {
      get: (key) => secrets.get(key),
      set: (key, value) => { secrets.set(key, value); },
      remove: (key) => { secrets.delete(key); },
    },
  }, "unused", transport);
  try {
    const flexible = await service.command({
      op: "task.save", title: "Flexible report", done: false,
      dueAt: "2026-10-26T09:00:00Z",
    });
    flexibleId = flexible.id;
    const fixed = await service.command({
      op: "task.save", title: "Fixed release", done: false,
      dueAt: "2026-10-26T12:00:00Z", deadlineFixed: true,
    });
    await service.command({
      op: "provider.save", provider: "gemini", model: "gemini-3.8-flash",
      key: "synthetic-test-key", maxTokens: 1024, maxRequests: 10,
    });
    await service.command({
      op: "engine.mode", mode: "Running", epoch: service.snapshot().engine.epoch,
    });
    const chat = await service.command({ op: "chat.create", provider: "gemini" });
    await service.command({
      op: "chat.send", chatId: chat.id,
      text: "Arrange my next two days. Move flexible work if needed; keep fixed deadlines.",
    });
    assert.equal(calls, 2);
    const plan = store.all("plans")[0];
    assert.equal(plan?.status, "pending");
    assert.equal(plan.actions.length, 1);
    assert.equal(plan.actions[0].command.id, flexible.id);
    assert.equal(store.get("tasks", flexible.id)?.dueAt, "2026-10-26T09:00:00Z");
    assert.equal(store.get("tasks", fixed.id)?.dueAt, "2026-10-26T12:00:00Z");
    await service.command({ op: "assistant.execute", planId: plan.id });
    assert.equal(store.get("tasks", flexible.id)?.dueAt, "2026-10-27T09:00:00Z");
    assert.equal(store.get("tasks", fixed.id)?.dueAt, "2026-10-26T12:00:00Z");
    assert.equal(store.get("plans", plan.id)?.status, "completed");
    assert.equal(calls, 3);
  } finally {
    service.close();
    store.close();
  }
});
