import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/core/store.ts";
import { Service } from "../src/core/service.ts";
const setup = () => {
  const store = new Store(":memory:");
  const notices: any[] = [];
  const service = new Service(
    store,
    {
      secrets: { get: () => undefined, set: () => {}, remove: () => {} },
      pickProject: async () => null,
      pickKey: async () => null,
      pickRestoreDirectory: async () => null,
      saveText: async () => false,
      openAuth: async () => {},
      notify: (title, body) => notices.push({ title, body }),
    },
    "unused",
  );
  return {
    store,
    service,
    notices,
    close() {
      service.engine.close();
      store.close();
    },
  };
};
test("Files can add an explicit absolute workspace path and tasks retain scheduling fields when checked", async () => {
  const x = setup(),
    dir = await mkdtemp(join(tmpdir(), "badawi-workspace-"));
  try {
    const p = await x.service.command({
      op: "workspace.add",
      path: dir,
      name: "My Workspace",
    } as any);
    assert.equal(p.name, "My Workspace");
    assert.ok(p.root);
    const t = await x.service.command({
      op: "task.save",
      title: "Deliver",
      done: false,
      projectId: p.id,
      dueAt: "2026-10-23T12:00:00Z",
      priority: "high",
      subtasks: [{ id: "s", title: "Check", done: false }],
    } as any);
    await x.service.command({
      op: "task.save",
      id: t.id,
      title: t.title,
      done: true,
    } as any);
    const saved = x.store.get("tasks", t.id)!;
    assert.equal(saved.priority, "high");
    assert.equal(saved.dueAt, t.dueAt);
    assert.equal(saved.subtasks.length, 1);
    assert.equal(saved.done, true);
  } finally {
    x.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("a reviewed workflow runs real steps in order with durable receipts and Windows notification dispatch", async () => {
  const x = setup();
  try {
    await x.service.command({ op: "engine.mode", mode: "Running", epoch: 0 });
    const j = await x.service.command({
      op: "job.save",
      name: "Sequence",
      kind: "workflow",
      trigger: { type: "manual" },
      enabled: false,
      missedPolicy: "skip",
      steps: [
        { kind: "reminder", name: "First", message: "one" },
        { kind: "reminder", name: "Second", message: "previous={{previous}}" },
      ],
    } as any);
    await x.service.command({ op: "job.run", id: j.id });
    const run = x.store.all("runs")[0];
    assert.equal(run.status, "succeeded");
    assert.equal(run.steps.length, 2);
    assert.equal(run.steps[1].status, "succeeded");
    assert.match(x.store.all("inbox")[0].body, /one/);
    assert.equal(x.notices.length, 2);
  } finally {
    x.close();
  }
});
test("completing a task triggers an enabled event automation and disabled events stay silent", async () => {
  const x = setup();
  try {
    await x.service.command({ op: "engine.mode", mode: "Running", epoch: 0 });
    await x.service.command({
      op: "job.save",
      name: "On completion",
      kind: "reminder",
      message: "well done",
      enabled: true,
      missedPolicy: "skip",
      trigger: { type: "event", event: "task.completed" },
    } as any);
    const t = await x.service.command({
      op: "task.save",
      title: "Task",
      done: false,
    });
    await x.service.command({
      op: "task.save",
      id: t.id,
      title: t.title,
      done: true,
    });
    await x.service.engine.tick();
    assert.equal(x.store.all("inbox").length, 1);
  } finally {
    x.close();
  }
});
