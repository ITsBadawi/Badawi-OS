import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/core/store.ts";
import { Engine } from "../src/core/engine.ts";
import {
  conditionObservation,
  queueConditions,
  conditionIdentity,
} from "../src/core/conditions.ts";
const now = Date.parse("2026-10-23T12:00:00Z");
const job = {
  id: "condition-job",
  name: "Overdue rule",
  kind: "reminder",
  message: "Review late tasks",
  enabled: true,
  missedPolicy: "skip",
  trigger: {
    type: "condition",
    checkEveryMinutes: 1,
    condition: { kind: "tasks.overdue", minCount: 1 },
  },
};
test("local conditions derive exact task thresholds and current-account backup age without treating missing sources as success", () => {
  const s = new Store(":memory:");
  try {
    const p = s.put("projects", { id: "p", name: "Project" });
    s.put("tasks", {
      id: "late",
      title: "Late",
      projectId: "p",
      done: false,
      dueAt: "2026-10-22T10:00:00Z",
    });
    s.put("tasks", {
      title: "Completed",
      done: true,
      dueAt: "2026-10-21T10:00:00Z",
    });
    let o = conditionObservation(
      s,
      { kind: "tasks.overdue", minCount: 1, projectId: p.id },
      now,
    );
    assert.equal(o.matched, true);
    assert.equal(o.value, 1);
    assert.equal(o.observedAt, "2026-10-23T12:00:00.000Z");
    assert.equal(o.source, "Local SQLite tasks");
    assert.equal(
      conditionObservation(s, { kind: "tasks.overdue", minCount: 2 }, now)
        .matched,
      false,
    );
    assert.equal(
      conditionObservation(s, { kind: "tasks.open", minCount: 1 }, now).matched,
      true,
    );
    assert.equal(
      conditionObservation(
        s,
        { kind: "tasks.open", projectId: "missing", minCount: 1 },
        now,
      ).matched,
      null,
    );
    assert.equal(
      conditionObservation(s, { kind: "backup.stale", ageHours: 24 }, now)
        .matched,
      null,
    );
    s.setting("drive.account", "owner");
    assert.equal(
      conditionObservation(s, { kind: "backup.stale", ageHours: 24 }, now)
        .matched,
      true,
    );
    s.put("backups", {
      account: "other",
      status: "verified",
      verifiedAt: "2026-10-23T11:00:00Z",
    });
    s.put("backups", {
      account: "owner",
      status: "verified",
      verifiedAt: "2026-10-23T10:00:00Z",
      projectIds: ["p"],
    });
    assert.equal(
      conditionObservation(
        s,
        { kind: "backup.stale", ageHours: 24, projectId: "p" },
        now,
      ).matched,
      false,
    );
    assert.equal(
      conditionObservation(
        s,
        { kind: "backup.stale", ageHours: 1, projectId: "p" },
        now,
      ).matched,
      true,
    );
    assert.equal(
      conditionObservation(
        s,
        { kind: "tasks.open", minCount: 0, script: "anything" },
        now,
      ).matched,
      null,
    );
  } finally {
    s.close();
  }
});
test("a condition queues once on a matching observation, persists its latch with its occurrence and rearms only after a known false observation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "badawi-condition-")),
    file = join(dir, "state.db");
  let s = new Store(file);
  try {
    s.put("jobs", job);
    s.put("tasks", {
      id: "t",
      title: "Late",
      done: false,
      dueAt: "2026-10-22T10:00:00Z",
    });
    assert.equal(queueConditions(s, now), 1);
    assert.equal(s.all("runs").length, 1);
    assert.ok(s.all("runs")[0].occurrence.startsWith("condition:"));
    assert.equal(queueConditions(s, now + 61000), 0);
    s.close();
    s = new Store(file);
    assert.equal(queueConditions(s, now + 122000), 0);
    assert.equal(s.all("runs").length, 1);
    const task = s.get("tasks", "t")!;
    s.put("tasks", { ...task, done: true });
    queueConditions(s, now + 183000);
    s.put("tasks", { ...task, done: false });
    assert.equal(queueConditions(s, now + 244000), 1);
    assert.equal(s.all("runs").length, 2);
  } finally {
    s.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("an unavailable source does not rearm a matched rule and changes to approved effects invalidate queued condition identities", () => {
  const s = new Store(":memory:");
  try {
    const p = s.put("projects", { id: "p", name: "Project" }),
      j = {
        ...job,
        trigger: {
          ...job.trigger,
          condition: { kind: "tasks.open", minCount: 1, projectId: p.id },
        },
      };
    s.put("jobs", j);
    s.put("tasks", { title: "Open", done: false, projectId: p.id });
    assert.equal(queueConditions(s, now), 1);
    const identity = conditionIdentity(j);
    s.remove("projects", p.id);
    queueConditions(s, now + 61000);
    s.put("projects", p);
    assert.equal(queueConditions(s, now + 122000), 0);
    assert.equal(s.all("runs").length, 1);
    assert.notEqual(
      conditionIdentity({ ...j, message: "A different approved effect" }),
      identity,
    );
  } finally {
    s.close();
  }
});
test("Pause, Stop and Gaming defer condition observation; restart does not replay a still-true rule", async () => {
  const s = new Store(":memory:");
  let effects = 0,
    engine = new Engine(s, async () => {
      effects++;
      return { verified: true };
    });
  try {
    s.put("jobs", job);
    s.put("tasks", {
      title: "Late",
      done: false,
      dueAt: "2026-10-22T10:00:00Z",
    });
    await engine.tick(now);
    assert.equal(effects, 0);
    engine.setMode("Pause", engine.snapshot().epoch);
    await engine.tick(now);
    assert.equal(effects, 0);
    engine.setMode("Running", engine.snapshot().epoch);
    engine.setGaming(true, engine.snapshot().epoch);
    await engine.tick(now);
    assert.equal(effects, 0);
    engine.setGaming(false, engine.snapshot().epoch);
    await engine.tick(Date.now() + 61000);
    assert.equal(effects, 1);
    await engine.tick(Date.now() + 122000);
    assert.equal(effects, 1);
    engine.close();
    engine = new Engine(s, async () => {
      effects++;
      return { verified: true };
    });
    engine.setMode("Running", engine.snapshot().epoch);
    await engine.tick(Date.now() + 183000);
    assert.equal(effects, 1);
    assert.equal(s.all("runs").length, 1);
  } finally {
    engine.close();
    s.close();
  }
});
test("a queued condition that no longer matches is skipped without executing or reporting verified effects", async () => {
  const s = new Store(":memory:");
  let effects = 0;
  const e = new Engine(s, async () => {
    effects++;
    return { verified: true };
  });
  try {
    s.put("jobs", job);
    const task = s.put("tasks", {
      title: "Late",
      done: false,
      dueAt: "2026-10-22T10:00:00Z",
    });
    queueConditions(s, now);
    s.put("tasks", { ...task, done: true });
    e.setMode("Running", e.snapshot().epoch);
    await e.tick(now + 61000);
    assert.equal(effects, 0);
    assert.equal(s.all("runs")[0].status, "skipped");
    assert.equal(s.all("runs")[0].reason, "CONDITION_NOT_MET");
    assert.equal(s.setting(`condition.${job.id}`).observation.matched, false);
    assert.ok(!s.auditRows().some((a) => a.event === "run.verified"));
  } finally {
    e.close();
    s.close();
  }
});
test("condition latch and occurrence roll back together when checkpoint persistence fails; a full queue does not lose a matching edge", () => {
  const s = new Store(":memory:");
  try {
    s.put("jobs", job);
    s.put("tasks", {
      title: "Late",
      done: false,
      dueAt: "2020-01-01T00:00:00Z",
    });
    s.db.exec(
      "CREATE TEMP TRIGGER reject_condition_checkpoint BEFORE INSERT ON settings WHEN NEW.key LIKE 'condition.%' BEGIN SELECT RAISE(ABORT, 'fixture-checkpoint-failure'); END;",
    );
    assert.throws(() => queueConditions(s, now), /fixture-checkpoint-failure/);
    assert.equal(s.all("runs").length, 0);
    assert.equal(
      (s.db.prepare("SELECT COUNT(*) AS n FROM occurrences").get() as any).n,
      0,
    );
    s.db.exec("DROP TRIGGER reject_condition_checkpoint");
    for (let i = 0; i < 100; i++)
      s.put("runs", { jobId: "other", status: "queued", id: `full-${i}` });
    assert.equal(queueConditions(s, now), 0);
    assert.equal(s.setting(`condition.${job.id}`).matched, false);
    s.put("runs", { ...s.get("runs", "full-0")!, status: "cancelled" });
    assert.equal(queueConditions(s, now + 61000), 1);
    assert.equal(s.all("runs").filter((r) => r.jobId === job.id).length, 1);
    assert.equal(queueConditions(s, now + 122000), 0);
  } finally {
    s.close();
  }
});
test("changing a queued rule skips its old approved effects and runs only the newly approved definition", async () => {
  const s = new Store(":memory:"),
    effects: string[] = [],
    e = new Engine(s, async (j) => {
      effects.push(j.message);
      return { verified: true };
    });
  try {
    s.put("jobs", job);
    s.put("tasks", {
      title: "Late",
      done: false,
      dueAt: "2020-01-01T00:00:00Z",
    });
    queueConditions(s, now);
    s.put("jobs", { ...job, message: "New reviewed effect" });
    e.setMode("Running", e.snapshot().epoch);
    await e.tick(now + 61000);
    assert.equal(effects.length, 0);
    assert.ok(
      s
        .all("runs")
        .some(
          (r) => r.status === "skipped" && r.reason === "CONDITION_CHANGED",
        ),
    );
    await e.tick(now + 122000);
    assert.deepEqual(effects, ["New reviewed effect"]);
    assert.equal(
      s.all("runs").filter((r) => r.status === "succeeded").length,
      1,
    );
  } finally {
    e.close();
    s.close();
  }
});
