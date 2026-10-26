import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/core/store.ts";
import {
  taskEvidenceFingerprint,
  evidenceProjectContext,
} from "../src/core/task-evidence.ts";
import { Assistant } from "../src/core/assistant.ts";
import { commandSchema } from "../src/contracts.ts";
import {
  dashboardView,
  setDashboardContext,
  pinDashboard,
} from "../src/core/dashboard.ts";
test("dashboard prioritizes real due/urgent work and scopes projects, recipes and alerts without changing records or permissions", () => {
  const s = new Store(":memory:");
  try {
    const p = s.put("projects", { name: "A" }),
      q = s.put("projects", { name: "B" });
    s.put("projects", { name: "Files", kind: "workfiles" });
    const ordinary = s.put("tasks", {
      title: "ordinary",
      done: false,
      projectId: p.id,
    });
    const urgent = s.put("tasks", {
      title: "urgent",
      done: false,
      priority: "urgent",
      projectId: q.id,
    });
    const overdue = s.put("tasks", {
      title: "overdue",
      done: false,
      dueAt: "2026-10-22T10:00:00Z",
      projectId: p.id,
    });
    const complete = s.put("tasks", {
      title: "claimed, no evidence",
      done: true,
      projectId: p.id,
    });
    s.put("jobs", {
      name: "A monitor",
      kind: "integration",
      projectId: p.id,
      enabled: true,
    });
    s.put("jobs", {
      name: "B workflow",
      kind: "workflow",
      steps: [{ projectId: q.id }],
      enabled: true,
    });
    s.put("inbox", {
      title: "B alert",
      body: "PRIVATE_BODY",
      evidence: { projectId: q.id },
    });
    const before = JSON.stringify(s.all("tasks"));
    const now = Date.parse("2026-10-23T12:00:00Z");
    let v = dashboardView(s, now);
    assert.equal(v.taskIds[0], overdue.id);
    assert.equal(v.taskIds[1], urgent.id);
    assert.ok(!v.taskIds.includes(complete.id));
    setDashboardContext(s, { mode: "project", projectId: p.id });
    v = dashboardView(s, now);
    assert.deepEqual(new Set(v.taskIds), new Set([ordinary.id, overdue.id]));
    assert.deepEqual(v.projectIds, [p.id]);
    assert.equal(v.jobIds.length, 1);
    assert.equal(v.inboxIds.length, 0);
    setDashboardContext(s, { mode: "review" });
    v = dashboardView(s, now);
    assert.ok(v.taskIds.includes(complete.id));
    assert.ok(v.taskIds.includes(overdue.id));
    assert.ok(!v.taskIds.includes(ordinary.id));
    assert.equal(JSON.stringify(s.all("tasks")), before);
    assert.ok(!JSON.stringify(v).includes("PRIVATE_BODY"));
  } finally {
    s.close();
  }
});

test("review context honors current evidence fingerprints and displays only the current Drive account receipt within a selected project", () => {
  const s = new Store(":memory:");
  try {
    const p = s.put("projects", {
      name: "Evidence context",
      github: { owner: "fixture", repo: "example" },
    });
    let task = s.put("tasks", {
      title: "Accepted claim",
      done: true,
      projectId: p.id,
    });
    task = s.put("tasks", {
      ...task,
      verification: {
        state: "verified",
        checkedAt: "2026-10-23T00:00:00Z",
        fingerprint: taskEvidenceFingerprint(
          task,
          evidenceProjectContext(s, task),
        ),
      },
    });
    setDashboardContext(s, { mode: "review" });
    assert.ok(!dashboardView(s).taskIds.includes(task.id));
    s.put("tasks", { ...task, description: "Changed meaning" });
    assert.ok(dashboardView(s).taskIds.includes(task.id));
    s.setting("drive.account", "current");
    const good = s.put("backups", {
      account: "current",
      status: "verified",
      projectIds: [p.id],
    });
    s.put("backups", {
      account: "foreign",
      status: "verified",
      projectIds: [p.id],
    });
    assert.equal(dashboardView(s).backupId, good.id);
    setDashboardContext(s, { mode: "project", projectId: p.id });
    assert.equal(dashboardView(s).backupId, good.id);
    let v = dashboardView(s);
    assert.equal(v.attention[0].reasons[0].state, "unverified");
    assert.equal(v.attention[0].reasons[0].checkedAt, null);
    s.setting(`github.check.${p.id}`, {
      comparison: { state: "behind" },
      checkedAt: "2026-10-01T12:00:00Z",
    });
    v = dashboardView(s);
    assert.equal(v.attention[0].reasons[0].checkedAt, "2026-10-01T12:00:00Z");
    s.setting("drive.account", null);
    assert.equal(dashboardView(s).backupId, null);
  } finally {
    s.close();
  }
});

test("dashboard owner commands stay outside assistant tools; metadata context never sends pinned note bodies, and pin limit cannot be bypassed", () => {
  const s = new Store(":memory:");
  try {
    for (let i = 0; i < 20; i++) {
      const n = s.put("notes", { title: `pin ${i}`, body: "PRIVATE_PIN_BODY" });
      pinDashboard(s, { type: "note", id: n.id, pinned: true });
    }
    const extra = s.put("notes", { title: "extra", body: "PRIVATE_PIN_BODY" });
    assert.throws(
      () => pinDashboard(s, { type: "note", id: extra.id, pinned: true }),
      /DASHBOARD_PIN_LIMIT/,
    );
    const assistant = new Assistant(s, () => ({
      mode: "Running",
      gaming: false,
    }));
    assert.ok(assistant.context().includes("owner-only display preferences"));
    assert.ok(!assistant.context().includes("PRIVATE_PIN_BODY"));
    assert.throws(
      () => assistant.validate({ op: "dashboard.context", mode: "today" }),
      /ASSISTANT_ACTION_DENIED/,
    );
    assert.throws(() =>
      commandSchema.parse({
        op: "dashboard.pin",
        type: "secret",
        id: extra.id,
        pinned: true,
      }),
    );
  } finally {
    s.close();
  }
});
test("pins are idempotent metadata references, persist with the store and stop resolving removed/archived objects; missing project context never widens scope", () => {
  const s = new Store(":memory:");
  try {
    const p = s.put("projects", { name: "Pinned project" }),
      n = s.put("notes", { title: "Pinned note", body: "PRIVATE_NOTE" });
    pinDashboard(s, { type: "project", id: p.id, pinned: true });
    pinDashboard(s, { type: "project", id: p.id, pinned: true });
    pinDashboard(s, { type: "note", id: n.id, pinned: true });
    assert.equal(dashboardView(s).pins.length, 2);
    assert.ok(!JSON.stringify(dashboardView(s)).includes("PRIVATE_NOTE"));
    assert.throws(
      () => pinDashboard(s, { type: "note", id: "missing", pinned: true }),
      /DASHBOARD_TARGET_MISSING/,
    );
    setDashboardContext(s, { mode: "project", projectId: p.id });
    s.put("projects", { ...p, archived: true });
    s.remove("notes", n.id);
    const v = dashboardView(s);
    assert.equal(v.projectUnavailable, true);
    assert.deepEqual(v.taskIds, []);
    assert.deepEqual(v.projectIds, []);
    assert.ok(v.pins.every((p) => !p.available));
    pinDashboard(s, { type: "note", id: n.id, pinned: false });
    assert.equal(dashboardView(s).pins.length, 1);
  } finally {
    s.close();
  }
});
