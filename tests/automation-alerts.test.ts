import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/core/store.ts";
import { Service } from "../src/core/service.ts";
function setup(
  store: Store,
  notices: { title: string; body: string }[],
  failNotify = false,
) {
  return new Service(
    store,
    {
      pickProject: async () => null,
      pickKey: async () => null,
      pickRestoreDirectory: async () => null,
      saveText: async () => false,
      openAuth: async () => {},
      secrets: { get: () => undefined, set: () => {}, remove: () => {} },
      notify: (title, body) => {
        notices.push({ title, body });
        if (failNotify) throw Error("PRIVATE_HOST_FAILURE");
      },
    },
    "unused-stage",
    async () => {
      throw Error("No provider request allowed");
    },
  );
}
test("failed and approval-blocked background runs create durable, private-safe alerts and dispatch only one notification per run across restart", async () => {
  const s = new Store(":memory:"),
    notices: { title: string; body: string }[] = [];
  let service = setup(s, notices);
  try {
    const backup = s.put("jobs", {
      name: "Previously authorized backup",
      kind: "backup",
      enabled: true,
      trigger: { type: "manual" },
      missedPolicy: "skip",
    });
    await service.command({ op: "engine.mode", mode: "Running", epoch: 0 });
    await service.command({ op: "job.run", id: backup.id });
    const failed = s.all("runs")[0];
    assert.equal(failed.status, "failed");
    assert.equal(failed.reason, "RECOVERY_KEY_REQUIRED");
    assert.equal(s.all("inbox").length, 1);
    assert.equal(notices.length, 1);
    assert.equal(s.all("inbox")[0].reasonCode, "RECOVERY_KEY_REQUIRED");
    assert.ok(!s.all("inbox")[0].body.includes("RECOVERY_KEY_REQUIRED"));
    service.engine.emit("outcome", { ...failed, alertedAt: undefined });
    assert.equal(notices.length, 1);
    const note = s.put("notes", {
        title: "Source",
        body: "PRIVATE_NOTE_CONTENT",
      }),
      summary = s.put("jobs", {
        name: "Summary awaiting permission",
        kind: "summary",
        provider: "gemini",
        noteIds: [note.id],
        enabled: true,
        trigger: { type: "manual" },
        missedPolicy: "skip",
      });
    await service.command({ op: "job.run", id: summary.id });
    assert.equal(s.all("runs")[0].status, "blocked");
    assert.equal(s.all("inbox").length, 2);
    assert.equal(notices.length, 2);
    assert.ok(!JSON.stringify(notices).includes("PRIVATE_NOTE_CONTENT"));
    assert.ok(!JSON.stringify(s.all("inbox")).includes("PRIVATE_NOTE_CONTENT"));
    assert.ok(s.all("runs").every((r) => r.alertedAt));
    service.close();
    service = setup(s, notices);
    assert.equal(s.all("inbox").length, 2);
    assert.equal(notices.length, 2);
  } finally {
    service.close();
    s.close();
  }
});
test("recovered interrupted work alerts once; disabled desktop notifications still leave a durable inbox alert and host notification failures cannot undo run receipts", async () => {
  const s = new Store(":memory:"),
    notices: { title: string; body: string }[] = [];
  s.setting("preferences", { notifications: false });
  s.put("runs", {
    id: "recovered-run",
    jobId: "gone",
    status: "running",
    createdAt: new Date().toISOString(),
  });
  let service = setup(s, notices, true);
  try {
    assert.equal(s.all("runs")[0].status, "needsReview");
    assert.equal(s.all("inbox").length, 1);
    assert.equal(notices.length, 0);
    service.close();
    s.setting("preferences", { notifications: true });
    service = setup(s, notices, true);
    const job = s.put("jobs", {
      name: "Missing recovery key",
      kind: "backup",
      enabled: true,
      trigger: { type: "manual" },
      missedPolicy: "skip",
    });
    await service.command({ op: "engine.mode", mode: "Running", epoch: 0 });
    await service.command({ op: "job.run", id: job.id });
    assert.equal(s.all("runs")[0].status, "failed");
    assert.equal(s.all("inbox").length, 2);
    assert.equal(notices.length, 1);
    assert.ok(!JSON.stringify(s.auditRows()).includes("PRIVATE_HOST_FAILURE"));
    assert.ok(!JSON.stringify(s.all("inbox")).includes("PRIVATE_HOST_FAILURE"));
  } finally {
    service.close();
    s.close();
  }
});
