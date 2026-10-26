import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Store } from "../src/core/store.ts";
import { Service } from "../src/core/service.ts";

test("scheduled backup binds one project and missed occurrences obey skip or owner review", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "badawi-scheduled-backup-"));
  const store = new Store(":memory:");
  const secrets = new Map([["drive.tokens", "synthetic-connected-account"]]);
  const service = new Service(store, {
    pickProject: async () => null,
    saveText: async () => false,
    pickKey: async () => null,
    pickRestoreDirectory: async () => null,
    openAuth: async () => {},
    secrets: {
      get: (key) => secrets.get(key),
      set: (key, value) => { secrets.set(key, value); },
      remove: (key) => { secrets.delete(key); },
    },
  }, path.join(dir, "stage"));
  try {
    const roots = [path.join(dir, "one"), path.join(dir, "two")];
    await Promise.all(roots.map((root) => mkdir(root)));
    const [one, two] = roots.map((root, index) => store.put("projects", { name: index ? "Two" : "One", root, backupFiles: true, archived: false }));
    store.setting("backup.keyExported", true);
    const selected: string[][] = [];
    service.drive.backup = async (_signal, _progress, projectIds) => {
      selected.push(projectIds || []);
      return { verified: true, projectIds } as any;
    };
    const mode = (value: "Running" | "Pause" | "Stop") => service.command({ op: "engine.mode", mode: value, epoch: service.snapshot().engine.epoch });
    const due = () => new Date(Date.now() + 3000).toISOString();
    await mode("Running");
    const scheduled = await service.command({ op: "job.save", name: "Only first project", kind: "backup", projectId: one.id, trigger: { type: "once", at: due() }, enabled: true, missedPolicy: "skip" });
    await service.engine.tick(Date.parse(scheduled.nextDueAt) + 1000);
    assert.deepEqual(selected, [[one.id]]);
    assert.equal(store.all("runs").find((r) => r.jobId === scheduled.id)?.status, "succeeded");
    await service.engine.tick(Date.parse(scheduled.nextDueAt || new Date().toISOString()) + 1000);
    assert.equal(selected.length, 1, "a one-time occurrence cannot replay");

    const skipped = await service.command({ op: "job.save", name: "Skip missed backup", kind: "backup", projectId: two.id, trigger: { type: "once", at: due() }, enabled: true, missedPolicy: "skip" });
    await mode("Pause");
    await service.engine.tick(Date.parse(skipped.nextDueAt) + 120000);
    assert.equal(store.all("runs").filter((r) => r.jobId === skipped.id).length, 0);
    assert.equal(selected.length, 1);

    const reviewed = await service.command({ op: "job.save", name: "Review missed backup", kind: "backup", projectId: two.id, trigger: { type: "once", at: due() }, enabled: true, missedPolicy: "coalesceLatest" });
    await service.engine.tick(Date.parse(reviewed.nextDueAt) + 120000);
    const held = store.all("runs").find((r) => r.jobId === reviewed.id);
    assert.equal(held?.status, "blocked");
    assert.equal(held?.reason, "catchupApproval");
    assert.equal(selected.length, 1, "a missed backup cannot upload before owner review");
    await mode("Running");
    await service.command({ op: "run.resume", id: held.id });
    assert.deepEqual(selected, [[one.id], [two.id]]);
    assert.equal(store.get("runs", held.id)?.status, "succeeded");
    await assert.rejects(service.command({ op: "run.resume", id: held.id }), /RUN_NOT_RESUMABLE/);
  } finally {
    service.close();
    store.close();
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
