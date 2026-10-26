import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/core/store.ts";
import { Service } from "../src/core/service.ts";
import { snapshot, validateSnapshot } from "../src/core/backup.ts";
import { restoreBytes } from "../src/core/backup.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("owner can preview and enable a real local condition, see its timestamped latch, and restore its definition disabled", async () => {
  const store = new Store(":memory:"),
    dir = await mkdtemp(join(tmpdir(), "badawi-condition-restore-"));
  let network = 0;
  const service = new Service(
    store,
    {
      pickProject: async () => null,
      saveText: async () => false,
      pickKey: async () => null,
      pickRestoreDirectory: async () => null,
      openAuth: async () => {},
      secrets: { get: () => undefined, set: () => {}, remove: () => {} },
    },
    join(dir, "stage"),
    async () => {
      network++;
      throw Error("No condition network");
    },
  );
  try {
    const condition = { kind: "tasks.overdue" as const, minCount: 1 };
    const task = await service.command({
      op: "task.save",
      title: "Late criterion",
      done: false,
      dueAt: "2020-01-01T00:00:00Z",
    });
    const observation = await service.command({
      op: "condition.preview",
      condition,
    });
    assert.equal(observation.matched, true);
    assert.ok(observation.observedAt);
    assert.equal(
      service.assistant.validate({ op: "condition.preview", condition }).op,
      "condition.preview",
    );
    const job = await service.command({
      op: "job.save",
      name: "Condition notification",
      kind: "reminder",
      message: "CONDITION_ACTUAL_RECEIPT",
      trigger: { type: "condition", condition, checkEveryMinutes: 1 },
      enabled: true,
      missedPolicy: "skip",
    });
    assert.equal(job.nextDueAt, null);
    await service.command({ op: "engine.mode", mode: "Running", epoch: 0 });
    await service.engine.tick();
    assert.ok(
      service
        .snapshot()
        .inbox.some((i) => i.body === "CONDITION_ACTUAL_RECEIPT"),
    );
    const state = service
      .snapshot()
      .jobs.find((j) => j.id === job.id).conditionState;
    assert.equal(state.observation.matched, true);
    assert.ok(state.observation.observedAt);
    await service.command({
      op: "task.save",
      id: task.id,
      title: task.title,
      done: true,
    });
    await service.command({ op: "job.run", id: job.id });
    assert.ok(
      service
        .snapshot()
        .runs.some(
          (r) => r.status === "skipped" && r.reason === "CONDITION_NOT_MET",
        ),
    );
    assert.equal(
      (await service.command({ op: "report.read", days: 7 })).automation
        .skipped,
      1,
    );
    assert.equal(
      service.snapshot().jobs.find((j) => j.id === job.id).conditionState
        .observation.matched,
      false,
    );
    const bytes = snapshot(store),
      validated = validateSnapshot(bytes);
    assert.equal(validated.tables.jobs[0].trigger.type, "condition");
    assert.equal(validated.tables.jobs[0].conditionState, undefined);
    await restoreBytes(bytes, join(dir, "restored"));
    const restored = new Store(join(dir, "restored", "badawi.db"));
    try {
      assert.equal(restored.all("jobs")[0].enabled, false);
      assert.equal(restored.setting(`condition.${job.id}`), undefined);
    } finally {
      restored.close();
    }
    assert.equal(network, 0);
  } finally {
    service.close();
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
