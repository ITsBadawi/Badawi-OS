import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Store } from "../src/core/store.ts";
import { Service } from "../src/core/service.ts";
const setup = (
  file = ":memory:",
  transport: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        status: "completed",
        steps: [
          { type: "model_output", content: [{ type: "text", text: "37" }] },
        ],
        usage: { total_input_tokens: 3, total_output_tokens: 1 },
      }),
    ),
) => {
  const store = new Store(file),
    keys = new Map<string, string>();
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
    transport,
  );
  return {
    store,
    service,
    close: () => {
      service.engine.close();
      store.close();
    },
  };
};
async function ready(s: Service) {
  await s.command({
    op: "provider.save",
    provider: "gemini",
    model: "gemini-3.8-flash",
    key: "fixture-not-real",
    maxTokens: 256,
    maxRequests: 20,
  });
  s.engine.setMode("Running", s.engine.snapshot().epoch);
}
test("real chat persists two-turn native context after restart without exposing wire data", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "badawi-chat-"));
  const file = path.join(dir, "chat.db");
  let sent: any;
  let a = setup(file);
  await ready(a.service);
  const chat = await a.service.command({
    op: "chat.create",
    provider: "gemini",
  } as any);
  await a.service.command({
    op: "chat.send",
    chatId: chat.id,
    text: "Remember 37",
  } as any);
  a.close();
  a = setup(file, async (_u, i) => {
    sent = JSON.parse(i!.body as string);
    return new Response(
      JSON.stringify({
        status: "completed",
        steps: [
          { type: "model_output", content: [{ type: "text", text: "37" }] },
        ],
      }),
    );
  });
  try {
    await ready(a.service);
    await a.service.command({
      op: "chat.send",
      chatId: chat.id,
      text: "What number?",
    } as any);
    const view = await a.service.command({
      op: "chat.read",
      chatId: chat.id,
    } as any);
    assert.equal(view.messages.length, 4);
    assert.equal(view.messages[3].text, "37");
    assert.equal(sent.input[0].content[0].text, "Remember 37");
    assert.match(sent.input[2].content[0].text, /What number\?/);
    assert.match(sent.input[2].content[0].text,/integrated Badawi OS assistant/);
    assert.equal("wire" in view.messages[1], false);
    assert.equal("messages" in a.service.snapshot().chats[0], false);
    assert.equal(
      JSON.stringify(a.store.auditRows()).includes("Remember 37"),
      false,
    );
  } finally {
    a.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("failed chat shows a failed turn, explicit retry succeeds and reserves a second request", async () => {
  let calls = 0;
  const a = setup(":memory:", async () =>
    ++calls === 1
      ? new Response("{}", { status: 429 })
      : new Response(
          JSON.stringify({
            status: "completed",
            steps: [
              {
                type: "model_output",
                content: [{ type: "text", text: "done" }],
              },
            ],
          }),
        ),
  );
  try {
    await ready(a.service);
    const c = await a.service.command({
      op: "chat.create",
      provider: "gemini",
    } as any);
    await assert.rejects(
      a.service.command({
        op: "chat.send",
        chatId: c.id,
        text: "Hello",
      } as any),
      /RATE_LIMITED/,
    );
    let v = await a.service.command({ op: "chat.read", chatId: c.id } as any);
    assert.equal(v.messages[1].status, "failed");
    await a.service.command({ op: "chat.retry", chatId: c.id } as any);
    v = await a.service.command({ op: "chat.read", chatId: c.id } as any);
    assert.equal(v.messages.length, 2);
    assert.equal(v.messages[1].text, "done");
    assert.equal(a.service.snapshot().providers.gemini.usedToday, 2);
  } finally {
    a.close();
  }
});
test("Stop blocks chat before a pending turn or request reservation exists", async () => {
  const a = setup();
  try {
    await ready(a.service);
    const c = await a.service.command({
      op: "chat.create",
      provider: "gemini",
    } as any);
    a.service.engine.setMode("Stop", a.service.engine.snapshot().epoch);
    await assert.rejects(
      a.service.command({
        op: "chat.send",
        chatId: c.id,
        text: "hello",
      } as any),
      /ENGINE_STOPPED_OR_PAUSED/,
    );
    assert.equal(a.store.get("chats", c.id)!.messages.length, 0);
    assert.equal(a.service.snapshot().providers.gemini.usedToday, 0);
  } finally {
    a.close();
  }
});
test("cancelled chat stays visibly cancelled and never supplies a fake assistant reply", async () => {
  const a = setup(
    ":memory:",
    async (_u, i) =>
      new Promise((_r, reject) =>
        i!.signal!.addEventListener("abort", () => reject(Error("abort"))),
      ),
  );
  try {
    await ready(a.service);
    const c = await a.service.command({
      op: "chat.create",
      provider: "gemini",
    } as any);
    const pending = a.service.command({
      op: "chat.send",
      chatId: c.id,
      text: "hello",
    } as any);
    await new Promise((r) => setTimeout(r, 10));
    await a.service.command({ op: "chat.cancel", chatId: c.id } as any);
    await assert.rejects(pending, /AI_CANCELLED_USAGE_UNKNOWN/);
    const v = await a.service.command({ op: "chat.read", chatId: c.id } as any);
    assert.equal(v.messages[1].status, "cancelled");
    assert.equal(v.messages[1].text, "");
    assert.equal(a.service.snapshot().engine.mode, "Running");
  } finally {
    a.close();
  }
});
test("revoking an attached note prevents it from leaking in a later conversation turn", async () => {
  const a = setup();
  try {
    await ready(a.service);
    const n = await a.service.command({
      op: "note.save",
      title: "Private",
      body: "selected source",
    });
    const c = await a.service.command({
      op: "chat.create",
      provider: "gemini",
    } as any);
    await a.service.command({
      op: "chat.send",
      chatId: c.id,
      text: "Discuss this",
      noteId: n.id,
    } as any);
    await a.service.command({ op: "note.remove", id: n.id });
    await assert.rejects(
      a.service.command({
        op: "chat.send",
        chatId: c.id,
        text: "Continue",
      } as any),
      /PERMISSION_REVOKED/,
    );
    assert.equal(a.service.snapshot().providers.gemini.usedToday, 1);
  } finally {
    a.close();
  }
});
test("selected code reaches chat with line evidence; retry accepts unchanged files and revocation blocks resending", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "badawi-chat-source-"));
  await writeFile(
    path.join(dir, "readme.md"),
    "# Project\nThe important fact is 37.",
  );
  let calls = 0,
    payload = "";
  const a = setup(":memory:", async (_u, i) => {
    calls++;
    payload = JSON.parse(i!.body as string).input.at(-1).content[0].text;
    return calls === 1
      ? new Response("{}", { status: 429 })
      : new Response(
          JSON.stringify({
            status: "completed",
            steps: [
              {
                type: "model_output",
                content: [{ type: "text", text: "readme.md:L2 says 37." }],
              },
            ],
          }),
        );
  });
  try {
    await ready(a.service);
    const p = a.store.put("projects", {
      name: "fixture",
      root: dir,
      archived: false,
    });
    const c = await a.service.command({
      op: "chat.create",
      provider: "gemini",
    } as any);
    await assert.rejects(
      a.service.command({
        op: "chat.send",
        chatId: c.id,
        text: "Explain this file",
        projectId: p.id,
        filePath: "readme.md",
      } as any),
      /RATE_LIMITED/,
    );
    assert.match(payload, /The important fact is 37/);
    assert.match(payload, /L2/);
    await a.service.command({ op: "chat.retry", chatId: c.id } as any);
    assert.equal(calls, 2);
    await a.service.command({ op: "project.remove", id: p.id });
    await assert.rejects(
      a.service.command({
        op: "chat.send",
        chatId: c.id,
        text: "Continue",
      } as any),
      /PERMISSION_REVOKED/,
    );
    assert.equal(calls, 2);
  } finally {
    a.close();
    await rm(dir, { recursive: true, force: true });
  }
});
