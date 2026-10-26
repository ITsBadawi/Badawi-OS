import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/core/store.ts";
import { Service } from "../src/core/service.ts";
import { snapshot, restoreBytes } from "../src/core/backup.ts";
import { captureProjects } from "../src/core/project-archive.ts";
function setup(
  transport: typeof fetch = async () => {
    throw Error("UNEXPECTED_NETWORK");
  },
) {
  const store = new Store(":memory:"),
    keys = new Map<string, string>(),
    notices: any[] = [];
  let selected: string | null = null;
  const service = new Service(
    store,
    {
      secrets: {
        get: (k) => keys.get(k),
        set: (k, v) => {
          keys.set(k, v);
        },
        remove: (k) => {
          keys.delete(k);
        },
      },
      pickProject: async () => selected,
      saveText: async () => false,
      pickKey: async () => null,
      pickRestoreDirectory: async () => null,
      openAuth: async () => {},
      notify: (title, body) => notices.push({ title, body }),
    },
    "unused",
    transport,
  );
  return {
    store,
    service,
    notices,
    select: (p: string) => {
      selected = p;
    },
    close: () => {
      service.close();
      store.close();
    },
  };
}
const response = (reply: string, actions: any[] = []) =>
  Response.json({
    status: "completed",
    steps: [
      {
        type: "model_output",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              reply,
              actions: actions.map((a) => JSON.stringify(a)),
            }),
          },
        ],
      },
    ],
    usage: { total_input_tokens: 20, total_output_tokens: 10 },
  });
async function ready(s: Service) {
  await s.command({
    op: "provider.save",
    provider: "gemini",
    model: "gemini-3.8-flash",
    key: "fixture-private",
    maxTokens: 1024,
    maxRequests: 20,
  });
  await s.command({
    op: "engine.mode",
    mode: "Running",
    epoch: s.engine.snapshot().epoch,
  });
}
test("chat proposes validated actions, waits for approval, persists actual effects and continues using host receipts", async () => {
  let calls = 0;
  const requests: any[] = [];
  const x = setup(async (_u, i) => {
    requests.push(JSON.parse(i!.body as string));
    calls++;
    return calls === 1
      ? response("I can create that task.", [
          {
            op: "task.save",
            title: "Owner requested task",
            done: false,
            priority: "high",
          },
          { op: "memory.save", title: "Preference", body: "Brief replies" },
        ])
      : response("Created, with a saved receipt.");
  });
  try {
    await ready(x.service);
    const chat = await x.service.command({
      op: "chat.create",
      provider: "gemini",
    });
    await x.service.command({
      op: "chat.send",
      chatId: chat.id,
      text: "Create my task and remember my preference.",
    });
    assert.equal(x.store.all("tasks").length, 0);
    assert.equal(x.store.all("memories").length, 0);
    const plan = x.store.all("plans")[0];
    assert.equal(plan.status, "pending");
    await x.service.command({ op: "assistant.execute", planId: plan.id });
    assert.equal(x.store.all("tasks")[0].title, "Owner requested task");
    assert.equal(x.store.all("memories")[0].body, "Brief replies");
    assert.equal(x.store.get("plans", plan.id)!.status, "completed");
    assert.equal(calls, 2);
    assert.match(JSON.stringify(requests[1]), /Owner requested task/);
    await assert.rejects(
      x.service.command({ op: "assistant.execute", planId: plan.id }),
      /PLAN_NOT_PENDING/,
    );
    assert.equal(x.store.all("tasks").length, 1);
  } finally {
    x.close();
  }
});
test("AI reads real authorized source in a tool round while unapproved notes become approval cards", async () => {
  const d = await mkdtemp(join(tmpdir(), "badawi-read-flow-"));
  let projectId = "",
    calls = 0;
  const sent: string[] = [];
  const x = setup(async (_u, i) => {
    sent.push(String(i!.body));
    return ++calls === 1
      ? response("Read source", [
          { op: "files.read", projectId, path: "readme.md" },
        ])
      : response("The source contains WORKSPACE_EVIDENCE_37");
  });
  try {
    await writeFile(join(d, "readme.md"), "WORKSPACE_EVIDENCE_37");
    await ready(x.service);
    const p = await x.service.command({ op: "workspace.add", path: d });
    projectId = p.id;
    await x.service.command({
      op: "project.permissions",
      id: p.id,
      aiRead: true,
      backupFiles: false,
      monitor: false,
    });
    const chat = await x.service.command({
      op: "chat.create",
      provider: "gemini",
    });
    await x.service.command({
      op: "chat.send",
      chatId: chat.id,
      text: "Read the readme.",
    });
    assert.equal(calls, 2);
    assert.match(sent[1], /WORKSPACE_EVIDENCE_37/);
    assert.equal(x.store.all("plans").length, 0);
    assert.ok(
      x.store.get("chats", chat.id)!.messages.at(-1).toolReceipts.length,
    );
    await mkdir(join(d, "second"));
    x.select(join(d, "second"));
    await x.service.command({ op: "project.relink", id: p.id });
    await x.service.command({
      op: "project.permissions",
      id: p.id,
      aiRead: true,
      backupFiles: false,
      monitor: false,
    });
    await assert.rejects(
      x.service.command({ op: "chat.send", chatId: chat.id, text: "Continue" }),
      /PERMISSION_REVOKED/,
    );
    assert.equal(calls, 2);
  } finally {
    x.close();
    await rm(d, { recursive: true, force: true });
  }
});
test("project monitoring emits a durable alert and event workflow; Pause stops background scans", async () => {
  const d = await mkdtemp(join(tmpdir(), "badawi-monitor-flow-")),
    x = setup();
  try {
    await writeFile(join(d, "index.ts"), "one");
    const p = await x.service.command({ op: "workspace.add", path: d });
    await x.service.command({
      op: "project.permissions",
      id: p.id,
      aiRead: false,
      backupFiles: false,
      monitor: true,
    });
    await x.service.command({ op: "engine.mode", mode: "Running", epoch: 0 });
    await x.service.command({
      op: "job.save",
      name: "On source change",
      kind: "reminder",
      message: "Review change",
      trigger: { type: "event", event: "project.changed", projectId: p.id },
      enabled: true,
      missedPolicy: "skip",
    });
    const now = Date.now();
    await x.service.maintain(now);
    await writeFile(join(d, "index.ts"), "changed source length");
    await x.service.maintain(now + 61000);
    assert.ok(
      x.store.all("inbox").some((i) => i.body.includes("Review change")),
    );
    assert.ok(x.store.all("runs").some((r) => r.status === "succeeded"));
    assert.ok(x.notices.length >= 1);
    const scans = x.store.setting("monitor.lastScan");
    await x.service.command({
      op: "engine.mode",
      mode: "Pause",
      epoch: x.service.engine.snapshot().epoch,
    });
    await x.service.maintain(now + 122000);
    assert.equal(x.store.setting("monitor.lastScan"), scans);
  } finally {
    x.close();
    await rm(d, { recursive: true, force: true });
  }
});
test("format 3 backup restores selected source, binary assets, memories and rich tasks with grants disabled", async () => {
  const d = await mkdtemp(join(tmpdir(), "badawi-complete-restore-")),
    x = setup();
  let restored: Store | undefined;
  try {
    const root = join(d, "source");
    await mkdir(root);
    await writeFile(join(root, "index.ts"), "const exact=37");
    await writeFile(join(root, "asset.png"), Buffer.from([137, 80, 78, 71, 0]));
    await writeFile(join(root, ".env"), "PRIVATE");
    const p = await x.service.command({ op: "workspace.add", path: root });
    await x.service.command({
      op: "project.permissions",
      id: p.id,
      aiRead: true,
      backupFiles: true,
      monitor: true,
    });
    await x.service.command({
      op: "memory.save",
      title: "Preference",
      body: "Brief replies",
    });
    await x.service.command({
      op: "task.save",
      title: "Due task",
      done: false,
      priority: "urgent",
      dueAt: "2026-10-23T10:00:00Z",
      subtasks: [{ id: "s", title: "Review", done: true }],
    });
    const archives = await captureProjects(
      x.store,
      new AbortController().signal,
    );
    await restoreBytes(snapshot(x.store, archives), join(d, "restored"));
    restored = new Store(join(d, "restored", "badawi.db"));
    assert.equal(restored.all("memories")[0].body, "Brief replies");
    assert.equal(restored.all("tasks")[0].subtasks[0].done, true);
    assert.equal(restored.all("tasks")[0].priority, "urgent");
    assert.equal(restored.all("projects")[0].root, null);
    assert.ok(!restored.all("projects")[0].aiRead);
    assert.equal(
      await readFile(join(d, "restored", "projects", p.id, "index.ts"), "utf8"),
      "const exact=37",
    );
    assert.equal(archives[0].files.length, 2);
    assert.ok(archives[0].excluded?.some((f) => f.path === ".env"));
  } finally {
    restored?.close();
    x.close();
    await rm(d, { recursive: true, force: true });
  }
});
test("relinking a project resets grants and disables workflows that refer to the previous root", async () => {
  const d = await mkdtemp(join(tmpdir(), "badawi-relink-")),
    x = setup();
  try {
    await mkdir(join(d, "first"));
    await mkdir(join(d, "second"));
    const p = await x.service.command({
      op: "workspace.add",
      path: join(d, "first"),
    });
    await x.service.command({
      op: "project.permissions",
      id: p.id,
      aiRead: true,
      backupFiles: true,
      monitor: true,
    });
    const j = await x.service.command({
      op: "job.save",
      name: "Source report",
      kind: "workflow",
      steps: [{ kind: "report", name: "Read", projectId: p.id }],
      trigger: { type: "manual" },
      enabled: true,
      missedPolicy: "skip",
    });
    x.select(join(d, "second"));
    await x.service.command({ op: "project.relink", id: p.id });
    assert.equal(x.store.get("projects", p.id)!.aiRead, false);
    assert.equal(x.store.get("projects", p.id)!.backupFiles, false);
    assert.equal(x.store.get("jobs", j.id)!.enabled, false);
  } finally {
    x.close();
    await rm(d, { recursive: true, force: true });
  }
});
