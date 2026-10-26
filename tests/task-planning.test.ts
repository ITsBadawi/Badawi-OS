import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/core/store.ts";
import * as tasks from "../src/core/tasks.ts";
import { snapshot, restoreBytes } from "../src/core/backup.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Missing recurrence, an unsafe deadline update, or duplicate reminder creates
// an observable wrong row/Inbox entry; these assertions do not inspect source.
const save = (s: Store, c: any, now = Date.parse("2026-10-22T08:00:00Z")) =>
  (tasks as any).saveTask(s, c, now);
test("completing a daily task creates one future occurrence and preserves its local time", () => {
  const s = new Store(":memory:");
  try {
    const t = save(s, {
      title: "Daily review",
      done: false,
      dueAt: "2026-10-22T09:00:00Z",
      remindAt: "2026-10-22T08:30:00Z",
      recurrence: { frequency: "daily", zone: "Asia/Baghdad" },
      subtasks: [{ id: "a", title: "Review", done: true }],
    });
    save(s, { id: t.id, title: t.title, done: true });
    assert.equal(s.all("tasks").length, 2);
    const next = s.all("tasks").find((x) => x.id !== t.id)!;
    assert.equal(next.dueAt, "2026-10-23T09:00:00.000Z");
    assert.equal(next.remindAt, "2026-10-23T08:30:00.000Z");
    assert.equal(next.subtasks[0].done, false);
    assert.equal(next.done, false);
    save(s, { id: t.id, title: t.title, done: true });
    save(s, { id: t.id, title: t.title, done: false });
    save(s, { id: t.id, title: t.title, done: true });
    assert.equal(s.all("tasks").length, 2);
  } finally {
    s.close();
  }
});
test("recurrence skips missed days and honors DST wall-clock time", () => {
  const s = new Store(":memory:");
  try {
    const t = save(s, {
      title: "Morning",
      done: false,
      dueAt: "2026-10-31T13:00:00Z",
      recurrence: { frequency: "daily", zone: "America/New_York" },
    });
    save(
      s,
      { id: t.id, title: t.title, done: true },
      Date.parse("2026-11-02T15:00:00Z"),
    );
    assert.equal(
      s.all("tasks").find((x) => x.id !== t.id)!.dueAt,
      "2026-11-03T14:00:00.000Z",
    );
  } finally {
    s.close();
  }
});
test("fixed deadline rejects rescheduling without explicit confirmation and preserves partial fields", () => {
  const s = new Store(":memory:");
  try {
    const t = save(s, {
      title: "Release",
      done: false,
      deadlineFixed: true,
      dueAt: "2026-10-23T09:00:00Z",
      description: "keep",
    });
    assert.throws(
      () =>
        save(s, {
          id: t.id,
          title: t.title,
          done: false,
          dueAt: "2026-10-24T09:00:00Z",
        }),
      /FIXED_DEADLINE_CONFIRMATION_REQUIRED/,
    );
    assert.equal(s.get("tasks", t.id)!.dueAt, "2026-10-23T09:00:00Z");
    const changed = save(s, {
      id: t.id,
      title: t.title,
      done: false,
      dueAt: "2026-10-24T09:00:00Z",
      confirmDeadlineChange: true,
    });
    assert.equal(changed.description, "keep");
    assert.equal(changed.deadlineFixed, true);
    assert.equal(changed.confirmDeadlineChange, undefined);
  } finally {
    s.close();
  }
});
test("daily overdue review is persistent and does not notify twice in the same Baghdad day", () => {
  const s = new Store(":memory:");
  try {
    s.put("tasks", {
      title: "Overdue",
      done: false,
      dueAt: "2026-10-20T09:00:00Z",
      notifiedFor: "2026-10-20T09:00:00Z",
    });
    assert.equal(
      tasks
        .dueTasks(s, Date.parse("2026-10-22T08:00:00Z"))
        .filter((x) => x.kind === "overdue-review").length,
      1,
    );
    assert.equal(
      tasks.dueTasks(s, Date.parse("2026-10-22T09:00:00Z")).length,
      0,
    );
    assert.equal(
      tasks
        .dueTasks(s, Date.parse("2026-10-23T08:00:00Z"))
        .filter((x) => x.kind === "overdue-review").length,
      1,
    );
  } finally {
    s.close();
  }
});
test("calendar groups instants into local days and keeps undated tasks separate", () => {
  const rows = [
    { id: "a", dueAt: "2026-10-21T22:00:00Z" },
    { id: "b", dueAt: "2026-10-23T22:00:00Z" },
    { id: "c" },
  ];
  const result = (tasks as any).taskCalendar(
    rows,
    "2026-10-22",
    2,
    "Asia/Baghdad",
  );
  assert.deepEqual(
    result.days.map((d: any) => [d.date, d.tasks.map((t: any) => t.id)]),
    [
      ["2026-10-22", ["a"]],
      ["2026-10-23", []],
    ],
  );
  assert.deepEqual(
    result.undated.map((t: any) => t.id),
    ["c"],
  );
});
test("restoring a completed recurring task preserves its occurrence link and cannot create a duplicate", async () => {
  const s = new Store(":memory:"),
    dir = await mkdtemp(join(tmpdir(), "badawi-recurring-restore-"));
  let restored: Store | undefined;
  try {
    const t = save(s, {
      title: "Daily",
      done: false,
      dueAt: "2026-10-22T09:00:00Z",
      recurrence: { frequency: "daily", zone: "Asia/Baghdad" },
    });
    save(s, { id: t.id, title: t.title, done: true });
    await restoreBytes(snapshot(s), join(dir, "restored"));
    restored = new Store(join(dir, "restored", "badawi.db"));
    assert.ok(restored.get("tasks", t.id)!.nextOccurrenceId);
    save(restored, { id: t.id, title: t.title, done: false });
    save(restored, { id: t.id, title: t.title, done: true });
    assert.equal(restored.all("tasks").length, 2);
  } finally {
    restored?.close();
    s.close();
    await rm(dir, { recursive: true, force: true });
  }
});
