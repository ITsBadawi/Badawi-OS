import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/core/store.ts";
import { dueTasks } from "../src/core/tasks.ts";
test("due task reminder is durable and does not repeat; changed dates rearm it", () => {
  const s = new Store(":memory:");
  const t = s.put("tasks", {
    title: "Deadline",
    done: false,
    dueAt: "2026-10-22T10:00:00Z",
    remindAt: "2026-10-22T09:00:00Z",
  });
  assert.equal(dueTasks(s, Date.parse("2026-10-22T08:00:00Z")).length, 0);
  assert.equal(dueTasks(s, Date.parse("2026-10-22T09:00:00Z")).length, 1);
  assert.equal(dueTasks(s, Date.parse("2026-10-22T10:00:00Z")).length, 0);
  s.put("tasks", { ...s.get("tasks", t.id), remindAt: "2026-10-23T09:00:00Z" });
  assert.equal(dueTasks(s, Date.parse("2026-10-23T09:00:00Z")).length, 1);
  s.close();
});
