import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/core/store.ts";
import { Service } from "../src/core/service.ts";
function setup(pause?: Promise<void>) {
  const store = new Store(":memory:");
  let calls = 0;
  const keys = new Map<string, string>();
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
      await pause;
      return new Response(
        JSON.stringify({
          status: "completed",
          steps: [
            {
              type: "model_output",
              content: [
                {
                  type: "text",
                  text: "A concise summary from the selected note.",
                },
              ],
            },
          ],
          usage: { total_input_tokens: 8, total_output_tokens: 9 },
        }),
      );
    },
  );
  return {
    store,
    service,
    calls: () => calls,
    close: () => {
      service.engine.close();
      store.close();
    },
  };
}
test("revoking a note grant during generation cannot publish a verified result", async () => {
  let release!: () => void;
  const pause = new Promise<void>((r) => {
    release = r;
  });
  const a = setup(pause);
  try {
    const n = await prepare(a.service),
      j = await a.service.command(job(n.id) as any);
    const pending = a.service.command({ op: "job.run", id: j.id });
    while (!a.calls()) await new Promise((r) => setTimeout(r, 1));
    await a.service.command({
      op: "note.save",
      id: n.id,
      title: n.title,
      body: "Changed while generating",
    });
    release();
    await pending;
    const inbox = a.store.all("inbox");
    assert.equal(inbox.filter((i) => i.provider).length, 0);
    assert.ok(
      !JSON.stringify(inbox).includes(
        "A concise summary from the selected note.",
      ),
    );
    assert.equal(inbox.length, 1);
    assert.equal(inbox[0].runId, a.store.all("runs")[0].id);
    assert.equal(a.store.all("runs")[0].status, "blocked");
  } finally {
    release();
    a.close();
  }
});
async function prepare(s: Service) {
  await s.command({
    op: "provider.save",
    provider: "gemini",
    key: "fixture",
    model: "gemini-3.8-flash",
    maxTokens: 256,
    maxRequests: 5,
    budget: {
      dailyUSD: 0.1,
      inputPerMillion: 1,
      outputPerMillion: 10,
      date: "2026-10-21",
    },
  });
  s.engine.setMode("Running", s.engine.snapshot().epoch);
  return await s.command({
    op: "note.save",
    title: "Chosen note",
    body: "Summarize this note only.",
  });
}
const job = (noteId: string, approved = true) => ({
  op: "job.save",
  name: "Evening summary",
  kind: "summary",
  provider: "gemini",
  noteIds: [noteId],
  allowBackgroundAI: approved,
  trigger: { type: "manual" },
  enabled: true,
  missedPolicy: "skip",
});
test("approved note-summary runs through the engine and creates verified Inbox evidence", async () => {
  const a = setup();
  try {
    const n = await prepare(a.service);
    const j = await a.service.command(job(n.id) as any);
    await a.service.command({ op: "job.run", id: j.id });
    assert.equal(a.calls(), 1);
    assert.equal(a.store.all("runs")[0].status, "succeeded");
    assert.equal(
      a.store.all("inbox")[0].body,
      "A concise summary from the selected note.",
    );
    assert.equal(a.store.all("inbox")[0].provider, "gemini");
    assert.equal(
      a.service.snapshot().providers.gemini.verified?.model,
      "gemini-3.8-flash",
    );
    assert.deepEqual(a.store.all("inbox")[0].noteIds, [n.id]);
  } finally {
    a.close();
  }
});
test("background AI cannot be enabled without explicit selected-source consent", async () => {
  const a = setup();
  try {
    const n = await prepare(a.service);
    await assert.rejects(
      a.service.command(job(n.id, false) as any),
      /BACKGROUND_APPROVAL_REQUIRED/,
    );
    assert.equal(a.calls(), 0);
  } finally {
    a.close();
  }
});
test("editing a selected note disables its previously approved AI automation", async () => {
  const a = setup();
  try {
    const n = await prepare(a.service);
    const j = await a.service.command(job(n.id) as any);
    await a.service.command({
      op: "note.save",
      id: n.id,
      title: n.title,
      body: "Changed content",
    });
    assert.equal(a.store.get("jobs", j.id)!.enabled, false);
    await a.service.command({ op: "job.run", id: j.id });
    assert.equal(a.calls(), 0);
    assert.equal(a.store.all("runs")[0].status, "blocked");
  } finally {
    a.close();
  }
});
test("changing provider configuration invalidates existing background authorization", async () => {
  const a = setup();
  try {
    const n = await prepare(a.service);
    const j = await a.service.command(job(n.id) as any);
    await a.service.command({
      op: "provider.save",
      provider: "gemini",
      model: "gemini-3.8-flash",
      maxTokens: 512,
      maxRequests: 5,
    });
    assert.equal(a.store.get("jobs", j.id)!.enabled, false);
    await a.service.command({ op: "job.run", id: j.id });
    assert.equal(a.calls(), 0);
  } finally {
    a.close();
  }
});
test("background AI requires an owner-chosen spend cap before its grant can be saved", async () => {
  const a = setup();
  try {
    const n = await prepare(a.service);
    await a.service.command({
      op: "provider.save",
      provider: "gemini",
      model: "gemini-3.8-flash",
      maxTokens: 512,
      maxRequests: 5,
      budget: null,
    });
    await assert.rejects(
      a.service.command(job(n.id) as any),
      /BUDGET_CONFIG_REQUIRED/,
    );
    assert.equal(a.calls(), 0);
  } finally {
    a.close();
  }
});

test("workflow summary uses its reviewed per-step grant and a note edit revokes the entire workflow", async () => {
  const a = setup();
  try {
    const n = await prepare(a.service);
    const j = await a.service.command({
      op: "job.save",
      name: "AI workflow",
      kind: "workflow",
      steps: [
        {
          kind: "summary",
          name: "Summarize",
          provider: "gemini",
          noteIds: [n.id],
        },
        { kind: "reminder", name: "Notify", message: "{{previous}}" },
      ],
      allowBackgroundAI: true,
      enabled: true,
      missedPolicy: "skip",
      trigger: { type: "daily", time: "23:59", zone: "Asia/Baghdad" },
    } as any);
    await a.service.command({ op: "job.run", id: j.id });
    assert.equal(a.store.all("runs")[0].status, "succeeded");
    assert.equal(a.store.all("inbox").length, 2);
    await a.service.command({
      op: "note.save",
      id: n.id,
      title: n.title,
      body: "changed",
    });
    assert.equal(a.store.get("jobs", j.id)!.enabled, false);
    assert.equal(a.store.get("jobs", j.id)!.steps[0].grant, null);
  } finally {
    a.close();
  }
});
