import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/core/store.ts";
import { Engine } from "../src/core/engine.ts";
import { nextOccurrence } from "../src/core/schedule.ts";
test("a scheduled occurrence queued behind work cannot run after its automation is disabled", async () => {
  const s = new Store(":memory:");
  let executed = 0,
    release!: () => void;
  const e = new Engine(s, async () => {
    executed++;
  });
  try {
    e.setMode("Running", 0);
    const j = s.put("jobs", {
      name: "scheduled",
      enabled: true,
      kind: "reminder",
      trigger: { type: "once", at: "2026-10-21T12:00:00Z" },
      nextDueAt: "2026-10-21T12:00:00Z",
      missedPolicy: "skip",
    });
    const busy = e.runTask(
      () =>
        new Promise<void>((r) => {
          release = r;
        }),
    );
    await e.tick(Date.parse("2026-10-21T12:00:01Z"));
    assert.equal(s.all("runs")[0].status, "queued");
    s.put("jobs", { ...s.get("jobs", j.id), enabled: false, nextDueAt: null });
    release();
    await busy;
    await e.tick(Date.parse("2026-10-21T12:00:02Z"));
    assert.equal(executed, 0);
    assert.equal(s.all("runs")[0].status, "cancelled");
  } finally {
    release?.();
    e.close();
    s.close();
  }
});

test("notes and task completion persist across reopening without exposing secret values", () => {
  const dir = mkdtempSync(join(tmpdir(), "badawi-"));
  const file = join(dir, "app.db");
  let s = new Store(file);
  const n = s.put("notes", { title: "ملاحظة", body: "محلي" });
  s.put("tasks", { title: "مهمة", done: false });
  s.close();
  s = new Store(file);
  assert.equal(s.get("notes", n.id)?.body, "محلي");
  assert.equal(s.all("tasks")[0].done, false);
  assert.equal(s.verifyAudit(), true);
  s.close();
  rmSync(dir, { recursive: true });
});
test("a newer database schema is refused without downgrading its version", () => {
  const dir = mkdtempSync(join(tmpdir(), "badawi-schema-"));
  const file = join(dir, "app.db");
  const s = new Store(file);
  s.db.exec("PRAGMA user_version=99");
  s.close();
  assert.throws(() => new Store(file), /DATABASE_NEWER_VERSION/);
  rmSync(dir, { recursive: true });
});
test("pending runs are capped at twenty per automation", () => {
  const s = new Store(":memory:");
  for (let i = 0; i < 20; i++)
    assert.equal(s.enqueue("same", `occurrence-${i}`), true);
  assert.equal(s.enqueue("same", "overflow"), false);
  assert.equal(s.all("runs").length, 20);
  s.close();
});
test("audit verification detects a changed record", () => {
  const s = new Store(":memory:");
  s.audit("engine.mode", { mode: "Running" });
  s.db.prepare("UPDATE audit SET details='{}' WHERE sequence=1").run();
  assert.equal(s.verifyAudit(), false);
  s.close();
});
test("a worker failure cannot persist an untrusted error containing credentials", async () => {
  const s = new Store(":memory:"),
    e = new Engine(s, async () => {
      throw Error("https://example.invalid/?secret=FIXTURE_PRIVATE");
    });
  try {
    const j = s.put("jobs", {
      name: "failure",
      kind: "reminder",
      enabled: false,
    });
    e.setMode("Running", 0);
    await e.runNow(j.id);
    assert.equal(s.all("runs")[0].reason, "OPERATION_FAILED");
    assert.equal(
      JSON.stringify(s.all("runs")).includes("FIXTURE_PRIVATE"),
      false,
    );
  } finally {
    e.close();
    s.close();
  }
});
test("duplicate occurrence cannot create two executions", () => {
  const s = new Store(":memory:");
  const first = s.enqueue("job", "2026-10-21T12:00:00.000Z");
  const second = s.enqueue("job", "2026-10-21T12:00:00.000Z");
  assert.equal(first, true);
  assert.equal(second, false);
  assert.equal(s.all("runs").length, 1);
  s.close();
});
test("a catch-up is persisted as blocked in the same transaction as its occurrence", () => {
  const s = new Store(":memory:");
  s.enqueue("job", "scheduled", {
    status: "blocked",
    reason: "catchupApproval",
  });
  assert.equal(s.all("runs")[0].status, "blocked");
  assert.equal(s.all("runs")[0].reason, "catchupApproval");
  s.close();
});
test("a queued run from a previous process is held for review on restart", async () => {
  const s = new Store(":memory:");
  s.put("jobs", { id: "j", kind: "reminder", enabled: true });
  s.enqueue("j", "past");
  let calls = 0;
  const e = new Engine(s, async () => {
    calls++;
    return {};
  });
  e.setMode("Running", 0);
  await e.tick();
  assert.equal(calls, 0);
  assert.equal(s.all("runs")[0].status, "blocked");
  assert.equal(s.all("runs")[0].reason, "restartReview");
  e.close();
  s.close();
});
test("transaction rolls back all writes on failure", () => {
  const s = new Store(":memory:");
  assert.throws(() =>
    s.transaction(() => {
      s.put("notes", { title: "lost" });
      throw Error("disk failure");
    }),
  );
  assert.equal(s.all("notes").length, 0);
  s.close();
});
test("startup stops engine and marks interrupted runs for review", () => {
  const s = new Store(":memory:");
  s.setting("engine", { mode: "Running", gaming: true, epoch: 4 });
  s.put("runs", { status: "running", jobId: "a", occurrence: "a" });
  const e = new Engine(s, async () => ({}));
  assert.equal(e.snapshot().mode, "Stop");
  assert.equal(e.snapshot().gaming, true);
  assert.equal(s.all("runs")[0].status, "needsReview");
  assert.equal(e.snapshot().timerActive, false);
  e.close();
  s.close();
});
test("Gaming off never resumes a stopped or paused engine", () => {
  const s = new Store(":memory:");
  const e = new Engine(s, async () => ({}));
  e.setGaming(true, 0);
  e.setGaming(false, 1);
  assert.equal(e.snapshot().effective, "Stopped");
  e.setMode("Pause", 2);
  e.setGaming(true, 3);
  e.setGaming(false, 4);
  assert.equal(e.snapshot().effective, "Paused");
  e.close();
  s.close();
});
test("stale epoch mutations cannot overwrite more recent engine control", () => {
  const s = new Store(":memory:");
  const e = new Engine(s, async () => ({}));
  e.setMode("Running", 0);
  assert.throws(() => e.setMode("Stop", 0), /STALE/);
  assert.equal(e.snapshot().mode, "Running");
  e.close();
  s.close();
});
test("Stop shows draining until the running operation acknowledges cancellation", async () => {
  const s = new Store(":memory:");
  let finish!: () => void;
  let started!: () => void;
  const ready = new Promise<void>((r) => (started = r));
  const e = new Engine(s, async (_job, signal) => {
    started();
    await new Promise<void>((r) => (finish = r));
    signal.throwIfAborted();
    return {};
  });
  const j = s.put("jobs", {
    name: "report",
    kind: "report",
    trigger: { type: "manual" },
    enabled: true,
  });
  e.setMode("Running", 0);
  const run = e.runNow(j.id);
  await ready;
  e.setMode("Stop", 1);
  assert.equal(e.snapshot().effective, "Stopping");
  assert.equal(e.snapshot().active, 1);
  finish();
  await run;
  assert.equal(e.snapshot().effective, "Stopped");
  assert.equal(s.all("runs")[0].status, "cancelled");
  assert.equal(e.snapshot().timerActive, false);
  e.close();
  s.close();
});
test("Gaming prevents heavy manual work but preserves requested Running", async () => {
  const s = new Store(":memory:");
  const e = new Engine(s, async () => ({}));
  const j = s.put("jobs", {
    name: "heavy",
    kind: "report",
    enabled: true,
    trigger: { type: "manual" },
  });
  e.setMode("Running", 0);
  e.setGaming(true, 1);
  await assert.rejects(e.runNow(j.id), /GAMING/);
  assert.equal(e.snapshot().mode, "Running");
  assert.equal(s.all("runs").length, 0);
  e.close();
  s.close();
});
test("daily schedule uses the selected timezone", () => {
  assert.equal(
    nextOccurrence(
      { type: "daily", time: "18:00", zone: "Asia/Baghdad" },
      "2026-10-21T14:00:00Z",
    ),
    "2026-10-21T15:00:00.000Z",
  );
});
test("DST spring gap is skipped and repeated autumn time occurs only once", () => {
  assert.equal(
    nextOccurrence(
      { type: "daily", time: "02:30", zone: "America/New_York" },
      "2026-03-08T00:00:00Z",
    ),
    "2026-03-09T06:30:00.000Z",
  );
  assert.equal(
    nextOccurrence(
      { type: "daily", time: "01:30", zone: "America/New_York" },
      "2026-11-01T05:30:00Z",
    ),
    "2026-11-02T06:30:00.000Z",
  );
});
test("once triggers expire and weekly invalid zones fail closed", () => {
  assert.equal(
    nextOccurrence(
      { type: "once", at: "2026-10-20T00:00:00Z" },
      "2026-10-21T00:00:00Z",
    ),
    null,
  );
  assert.throws(
    () =>
      nextOccurrence(
        { type: "weekly", time: "18:00", zone: "garbage", weekday: 1 },
        new Date().toISOString(),
      ),
    /SCHEDULE/,
  );
});
test("scheduler records an occurrence once and skip policy cannot backfill a missed day", async () => {
  const s = new Store(":memory:");
  let calls = 0;
  const e = new Engine(s, async () => {
    calls++;
    return {};
  });
  s.put("jobs", {
    id: "daily",
    name: "daily",
    enabled: true,
    kind: "reminder",
    trigger: { type: "daily", time: "18:00", zone: "Asia/Baghdad" },
    missedPolicy: "skip",
    nextDueAt: "2026-10-21T15:00:00.000Z",
  });
  e.setMode("Running", 0);
  await e.tick(Date.parse("2026-10-21T15:00:01Z"));
  await e.tick(Date.parse("2026-10-21T15:00:01Z"));
  assert.equal(calls, 1);
  await e.tick(Date.parse("2026-10-23T15:00:00Z"));
  assert.equal(calls, 1);
  assert.equal(s.get("jobs", "daily")?.nextDueAt, "2026-10-24T15:00:00.000Z");
  e.close();
  s.close();
});
test("Gaming coalesced schedule needs an explicit decision and never runs when disabled", async () => {
  const s = new Store(":memory:");
  let calls = 0;
  const e = new Engine(s, async () => {
    calls++;
    return {};
  });
  s.put("jobs", {
    id: "daily",
    name: "daily",
    enabled: true,
    kind: "reminder",
    trigger: { type: "daily", time: "18:00", zone: "Asia/Baghdad" },
    missedPolicy: "coalesceLatest",
    nextDueAt: "2026-10-21T15:00:00.000Z",
  });
  e.setMode("Running", 0);
  e.setGaming(true, 1);
  await e.tick(Date.parse("2026-10-21T15:00:01Z"));
  assert.equal(s.all("runs")[0].status, "blocked");
  e.setGaming(false, 2);
  await e.tick(Date.parse("2026-10-21T16:00:00Z"));
  assert.equal(calls, 0);
  e.close();
  s.close();
});
test("a held catch-up runs only after user approval and cannot be approved twice", async () => {
  const s = new Store(":memory:");
  let calls = 0;
  const e = new Engine(s, async () => {
    calls++;
    return {};
  });
  s.put("jobs", { id: "j", kind: "reminder", enabled: true });
  const r = s.put("runs", {
    jobId: "j",
    status: "blocked",
    reason: "catchupApproval",
    occurrence: "2026-10-21T12:00:00Z",
  });
  e.setMode("Running", 0);
  await e.resume(r.id);
  assert.equal(calls, 1);
  await assert.rejects(e.resume(r.id), /RUN_NOT_RESUMABLE/);
  assert.equal(calls, 1);
  e.close();
  s.close();
});
test("coalescing multiple paused days retains only the latest held occurrence", async () => {
  const s = new Store(":memory:");
  const e = new Engine(s, async () => ({}));
  s.put("jobs", {
    id: "j",
    enabled: true,
    kind: "reminder",
    trigger: { type: "daily", time: "18:00", zone: "Asia/Baghdad" },
    missedPolicy: "coalesceLatest",
    nextDueAt: "2026-10-21T15:00:00.000Z",
  });
  e.setMode("Pause", 0);
  await e.tick(Date.parse("2026-10-21T15:00:01Z"));
  await e.tick(Date.parse("2026-10-22T15:00:01Z"));
  const held = s.all("runs").filter((r) => r.status === "blocked");
  assert.equal(held.length, 1);
  assert.equal(held[0].occurrence, "2026-10-22T15:00:00.000Z");
  e.close();
  s.close();
});
test("coalescing after a long stop finds the latest occurrence within the last day", async () => {
  const s = new Store(":memory:");
  const e = new Engine(s, async () => ({}));
  s.put("jobs", {
    id: "j",
    enabled: true,
    kind: "reminder",
    trigger: { type: "daily", time: "18:00", zone: "Asia/Baghdad" },
    missedPolicy: "coalesceLatest",
    nextDueAt: "2026-10-01T15:00:00.000Z",
  });
  e.setMode("Running", 0);
  await e.tick(Date.parse("2026-10-21T16:00:00Z"));
  assert.equal(s.all("runs")[0]?.occurrence, "2026-10-21T15:00:00.000Z");
  assert.equal(s.all("runs")[0]?.status, "blocked");
  e.close();
  s.close();
});
