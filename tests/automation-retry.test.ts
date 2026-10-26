import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/core/store.ts";
import { Engine } from "../src/core/engine.ts";
import { commandSchema } from "../src/contracts.ts";

function fixture(kind = "integration", maxAttempts = 3) {
  const store = new Store(":memory:");
  const project = store.put("projects", {
    name: "fixture",
    root: "C:/fixture",
    github: { owner: "fixture", repo: "fixture" },
  });
  const job = store.put("jobs", {
    name: "read",
    enabled: true,
    kind,
    integration: "github",
    projectId: project.id,
    trigger: { type: "manual" },
    retry: { maxAttempts, delaySeconds: 15 },
  });
  return { store, project, job };
}
test("explicit bounded read retries wait for their due time, keep one occurrence and retain actual attempt receipts", async () => {
  const { store, job } = fixture();
  let calls = 0;
  const e = new Engine(store, async () => {
    calls++;
    if (calls < 3) throw Error("GITHUB_NETWORK");
    return { verified: true, source: "fixture" };
  });
  try {
    e.setMode("Running", 0);
    await e.runNow(job.id);
    let run = store.all("runs")[0];
    assert.equal(run.status, "retryWaiting");
    assert.equal(run.attempts.length, 1);
    assert.equal(run.attempts[0].reason, "GITHUB_NETWORK");
    await e.tick(Date.parse(run.nextRetryAt) - 1);
    assert.equal(calls, 1);
    await e.tick(Date.parse(run.nextRetryAt));
    run = store.get("runs", run.id)!;
    assert.equal(run.status, "retryWaiting");
    assert.equal(run.attempts.length, 2);
    await e.tick(Date.parse(run.nextRetryAt));
    run = store.get("runs", run.id)!;
    assert.equal(calls, 3);
    assert.equal(store.all("runs").length, 1);
    assert.equal(run.status, "succeeded");
    assert.deepEqual(
      run.attempts.map((a: any) => a.status),
      ["failed", "failed", "succeeded"],
    );
  } finally {
    e.close();
    store.close();
  }
});
test("read retries stop at the approved cap and never retry authentication, approval, AI, backup, workflow or unknown failures", async () => {
  for (const [kind, reason, retries] of [
    ["integration", "GITHUB_NETWORK", true],
    ["integration", "GITHUB_AUTH_INVALID", false],
    ["integration", "WAITING_APPROVAL", false],
    ["summary", "GITHUB_NETWORK", false],
    ["backup", "GITHUB_NETWORK", false],
    ["workflow", "GITHUB_NETWORK", false],
    ["integration", "PRIVATE_URL_token", false],
  ] as const) {
    const { store, job } = fixture(kind, 2);
    let calls = 0;
    const e = new Engine(store, async () => {
      calls++;
      throw Error(reason);
    });
    try {
      e.setMode("Running", 0);
      await e.runNow(job.id);
      let run = store.all("runs")[0];
      if (retries) {
        assert.equal(run.status, "retryWaiting");
        await e.tick(Date.parse(run.nextRetryAt));
        run = store.get("runs", run.id)!;
      }
      assert.notEqual(run.status, "retryWaiting");
      assert.equal(calls, retries ? 2 : 1);
      assert.ok(!JSON.stringify(run).includes("PRIVATE_URL_token"));
    } finally {
      e.close();
      store.close();
    }
  }
});
test("Pause, Gaming and Stop defer read retries; target edits revoke them and restart requires review", async () => {
  const { store, project, job } = fixture();
  let calls = 0;
  let e = new Engine(store, async () => {
    calls++;
    throw Error("GITHUB_NETWORK");
  });
  try {
    e.setMode("Running", 0);
    await e.runNow(job.id);
    const run = store.all("runs")[0],
      at = Date.parse(run.nextRetryAt);
    e.setMode("Pause", e.snapshot().epoch);
    await e.tick(at);
    assert.equal(calls, 1);
    e.setMode("Running", e.snapshot().epoch);
    e.setGaming(true, e.snapshot().epoch);
    await e.tick(at);
    assert.equal(calls, 1);
    e.setGaming(false, e.snapshot().epoch);
    e.setMode("Stop", e.snapshot().epoch);
    await e.tick(at + 60000);
    assert.equal(calls, 1);
    store.put("projects", { ...project, root: "C:/different" });
    e.setMode("Running", e.snapshot().epoch);
    await e.tick(at + 60000);
    assert.equal(calls, 1);
    assert.equal(store.get("runs", run.id)?.reason, "RETRY_SCOPE_CHANGED");
    await e.runNow(job.id);
    const pending = store.all("runs").find((r) => r.status === "retryWaiting")!;
    assert.ok(pending);
    e.close();
    e = new Engine(store, async () => {
      calls++;
      return {};
    });
    assert.equal(store.get("runs", pending.id)?.status, "needsReview");
    e.setMode("Running", e.snapshot().epoch);
    await e.tick(at + 120000);
    assert.equal(calls, 2);
  } finally {
    e.close();
    store.close();
  }
});
test("retry policy input is bounded, strict and separate from background integration consent", () => {
  const base = {
    op: "job.save",
    name: "check",
    kind: "integration",
    integration: "github",
    projectId: "p",
    trigger: { type: "manual" },
    enabled: false,
    missedPolicy: "skip",
  };
  assert.equal(
    commandSchema.parse({
      ...base,
      retry: { maxAttempts: 3, delaySeconds: 15 },
    }).op,
    "job.save",
  );
  for (const retry of [
    { maxAttempts: 100, delaySeconds: 15 },
    { maxAttempts: 3, delaySeconds: 0 },
    { maxAttempts: 3, delaySeconds: 15, url: "https://not-permitted.invalid" },
  ])
    assert.throws(() => commandSchema.parse({ ...base, retry }));
});
test("an explicit new manual inspection supersedes an older waiting retry instead of leaving a second automatic request", async () => {
  const { store, job } = fixture();
  let calls = 0;
  const e = new Engine(store, async () => {
    calls++;
    if (calls === 1) throw Error("GITHUB_NETWORK");
    return { verified: true };
  });
  try {
    e.setMode("Running", 0);
    await e.runNow(job.id);
    const first = store.all("runs")[0];
    assert.equal(first.status, "retryWaiting");
    await e.runNow(job.id);
    assert.equal(store.get("runs", first.id)?.reason, "RETRY_SUPERSEDED");
    await e.tick(Date.parse(first.nextRetryAt) + 60000);
    assert.equal(calls, 2);
    assert.equal(
      store.all("runs").filter((r) => r.status === "succeeded").length,
      1,
    );
  } finally {
    e.close();
    store.close();
  }
});
test("a full queue rejects a manual request without draining a different occurrence", async () => {
  const { store, job } = fixture();
  let calls = 0;
  const e = new Engine(store, async () => {
    calls++;
    return {};
  });
  try {
    for (let j = 0; j < 5; j++)
      for (let n = 0; n < 20; n++)
        assert.equal(store.enqueue(`other-${j}`, `due-${n}`), true);
    e.setMode("Running", 0);
    await assert.rejects(e.runNow(job.id), /RUN_QUEUE_FULL/);
    assert.equal(calls, 0);
    assert.equal(
      store.all("runs").filter((r) => r.status === "queued").length,
      100,
    );
  } finally {
    e.close();
    store.close();
  }
});
