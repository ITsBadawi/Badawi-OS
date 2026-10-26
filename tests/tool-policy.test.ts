import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/core/store.ts";
import { Service } from "../src/core/service.ts";
import { commandSchema } from "../src/contracts.ts";
test("AI tool policies default to reviewed writes, allow only explicitly selected safe automatic writes, and cannot unlock code or shell", async () => {
  const store = new Store(":memory:"),
    keys = new Map<string, string>();
  let action: any = {
    op: "task.save",
    title: "Policy controlled task",
    done: false,
  };
  const service = new Service(
    store,
    {
      pickProject: async () => null,
      saveText: async () => false,
      pickKey: async () => null,
      pickRestoreDirectory: async () => null,
      openAuth: async () => {},
      secrets: {
        get: (k) => keys.get(k),
        set: (k, v) => {
          keys.set(k, v);
        },
        remove: (k) => {
          keys.delete(k);
        },
      },
    },
    "unused",
    async () =>
      Response.json({
        status: "completed",
        steps: [
          {
            type: "model_output",
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  reply: "Here is the requested action.",
                  actions: [JSON.stringify(action)],
                }),
              },
            ],
          },
        ],
        usage: { total_input_tokens: 5, total_output_tokens: 5 },
      }),
  );
  try {
    await service.command({
      op: "provider.save",
      provider: "gemini",
      key: "fixture",
      model: "fixture-model",
      maxTokens: 500,
      maxRequests: 20,
    });
    let state = service.snapshot();
    await service.command({
      op: "engine.mode",
      mode: "Running",
      epoch: state.engine.epoch,
    });
    const chat = await service.command({
      op: "chat.create",
      provider: "gemini",
    });
    await service.command({
      op: "chat.send",
      chatId: chat.id,
      text: "Create the task",
    });
    assert.equal(store.all("tasks").length, 0);
    assert.equal(store.all("plans")[0].status, "pending");
    await service.command(
      commandSchema.parse({
        op: "tool.policy.set",
        tool: "task.save",
        policy: "auto",
      }),
    );
    await service.command({
      op: "chat.send",
      chatId: chat.id,
      text: "Create it under my automatic policy",
    });
    assert.equal(store.all("tasks").length, 1);
    assert.equal(store.all("plans")[0].status, "completed");
    assert.ok(store.all("plans")[0].automaticallyAuthorizedAt);
    assert.equal(store.all("plans")[0].approvedAt, undefined);
    await service.command(
      commandSchema.parse({
        op: "tool.policy.set",
        tool: "task.save",
        policy: "forbidden",
      }),
    );
    await assert.rejects(
      service.command({
        op: "chat.send",
        chatId: chat.id,
        text: "Do it again",
      }),
      /TOOL_FORBIDDEN/,
    );
    assert.equal(store.all("tasks").length, 1);
    await assert.rejects(
      service.command(
        commandSchema.parse({
          op: "tool.policy.set",
          tool: "shell.exec",
          policy: "auto",
        }),
      ),
      /TOOL_POLICY_LOCKED/,
    );
    await assert.rejects(
      service.command(
        commandSchema.parse({
          op: "tool.policy.set",
          tool: "task.remove",
          policy: "auto",
        }),
      ),
      /TOOL_AUTO_NOT_ALLOWED/,
    );
  } finally {
    service.close();
    store.close();
  }
});
test("automatic task policy never bypasses fixed-deadline confirmation and policy changes invalidate earlier approval cards", async () => {
  const store = new Store(":memory:"),
    service = new Service(
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
    const state = service.snapshot();
    await service.command({
      op: "engine.mode",
      mode: "Running",
      epoch: state.engine.epoch,
    });
    const task = await service.command({
      op: "task.save",
      title: "Fixed",
      done: false,
      dueAt: "2026-12-01T00:00:00Z",
      deadlineFixed: true,
    });
    const plan = service.assistant.propose("chat", [
      {
        op: "task.save",
        id: task.id,
        title: task.title,
        done: false,
        dueAt: "2026-12-02T00:00:00Z",
        confirmDeadlineChange: true,
      },
    ]);
    await service.command(
      commandSchema.parse({
        op: "tool.policy.set",
        tool: "task.save",
        policy: "auto",
      }),
    );
    assert.equal(service.assistant.isAutomatic(plan.id), false);
    await assert.rejects(
      service.assistant.execute(plan.id, async () => {}),
      /APPROVAL_STALE/,
    );
    await service.command(
      commandSchema.parse({
        op: "tool.policy.set",
        tool: "task.save",
        policy: "readOnly",
      }),
    );
    assert.throws(
      () =>
        service.assistant.propose("chat", [
          { op: "task.save", title: "No write", done: false },
        ]),
      /TOOL_READ_ONLY/,
    );
  } finally {
    service.close();
    store.close();
  }
});
test("read tools configured for approval cannot run in an automatic read round", async () => {
  const store = new Store(":memory:"),
    keys = new Map<string, string>();
  let calls = 0;
  const task = store.put("tasks", {
    title: "Visible metadata",
    done: false,
    description: "BODY_REQUIRES_APPROVAL",
  });
  const service = new Service(
    store,
    {
      pickProject: async () => null,
      saveText: async () => false,
      pickKey: async () => null,
      pickRestoreDirectory: async () => null,
      openAuth: async () => {},
      secrets: {
        get: (k) => keys.get(k),
        set: (k, v) => {
          keys.set(k, v);
        },
        remove: (k) => {
          keys.delete(k);
        },
      },
    },
    "unused",
    async () => {
      calls++;
      return Response.json({
        status: "completed",
        steps: [
          {
            type: "model_output",
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  reply: "Read requested",
                  actions: [JSON.stringify({ op: "task.read", id: task.id })],
                }),
              },
            ],
          },
        ],
        usage: { total_input_tokens: 5, total_output_tokens: 5 },
      });
    },
  );
  try {
    await service.command({
      op: "provider.save",
      provider: "gemini",
      key: "fixture",
      model: "fixture-model",
      maxTokens: 500,
      maxRequests: 20,
    });
    await service.command(
      commandSchema.parse({
        op: "tool.policy.set",
        tool: "task.read",
        policy: "approval",
      }),
    );
    const state = service.snapshot();
    await service.command({
      op: "engine.mode",
      mode: "Running",
      epoch: state.engine.epoch,
    });
    const chat = await service.command({
      op: "chat.create",
      provider: "gemini",
    });
    const result = await service.command({
      op: "chat.send",
      chatId: chat.id,
      text: "Read the full task",
    });
    assert.equal(calls, 1);
    assert.equal(store.all("plans")[0].status, "pending");
    assert.ok(
      !JSON.stringify(result.messages).includes("BODY_REQUIRES_APPROVAL"),
    );
  } finally {
    service.close();
    store.close();
  }
});
