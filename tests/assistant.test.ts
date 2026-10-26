import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/core/store.ts";
import {
  Assistant,
  decodeAssistant,
  assistantSchema,
} from "../src/core/assistant.ts";
test("assistant knows capabilities and current tasks without sending credentials or all note bodies", () => {
  const s = new Store(":memory:");
  s.put("tasks", {
    title: "Ship report",
    done: false,
    dueAt: "2026-10-23T12:00:00Z",
    priority: "high",
  });
  s.put("notes", { title: "Private note", body: "BODY_NOT_SHARED" });
  s.setting("drive.config", { clientSecret: "NEVER_SEND" });
  const a = new Assistant(s, () => ({ mode: "Stop" }));
  const context = a.context();
  assert.match(context, /Ship report/);
  assert.match(context, /task.save/);
  assert.ok(
    !context.includes("BODY_NOT_SHARED") && !context.includes("NEVER_SEND"),
  );
  s.close();
});
test("assistant sees bounded actual automation progress without private receipts and cannot confirm a whole-workflow replay", () => {
  const s = new Store(":memory:");
  let connected = false;
  try {
    s.setting("drive.account", "historical-account");
    s.put("jobs", {
      id: "flow",
      name: "Workflow",
      kind: "workflow",
      enabled: true,
      trigger: { type: "manual" },
      retry: { maxAttempts: 2, delaySeconds: 15 },
    });
    s.put("runs", {
      jobId: "flow",
      status: "failed",
      reason: "DEPLOYMENT_NETWORK",
      attempts: [{ status: "failed" }],
      steps: [
        { status: "succeeded", result: { private: "PRIVATE_RECEIPT_BODY" } },
        { status: "needsReview" },
      ],
      recoveryHistory: [],
      result: { body: "PRIVATE_RESULT" },
    });
    const a = new Assistant(
      s,
      () => ({ mode: "Running" }),
      () => connected,
    );
    let context = a.context();
    assert.match(context, /"completedStepCount":1/);
    assert.match(context, /"attemptCount":1/);
    assert.match(context, /"driveConnected":false/);
    assert.ok(
      !context.includes("PRIVATE_RECEIPT_BODY") &&
        !context.includes("PRIVATE_RESULT"),
    );
    connected = true;
    context = a.context();
    assert.match(context, /"driveConnected":true/);
    assert.throws(
      () => a.validate({ op: "job.run", id: "flow", confirmReplay: true }),
      /ASSISTANT_ACTION_DENIED/,
    );
    assert.equal(a.validate({ op: "job.run", id: "flow" }).op, "job.run");
  } finally {
    s.close();
  }
});
test("registered project metadata and bounded GitHub inspection are known to the assistant but credentials cannot become tools", () => {
  const s = new Store(":memory:");
  try {
    s.put("projects", {
      id: "p",
      name: "Project",
      github: { owner: "owner", repo: "repo" },
      technologies: ["React"],
    });
    const a = new Assistant(s, () => ({ mode: "Running" }));
    assert.match(a.context(), /github.check/);
    assert.match(a.context(), /React/);
    assert.equal(
      a.validate({ op: "github.check", projectId: "p" }).op,
      "github.check",
    );
    assert.throws(
      () =>
        a.validate({
          op: "integration.save",
          integration: "github",
          token: "forbidden",
        }),
      /ASSISTANT_ACTION_DENIED/,
    );
  } finally {
    s.close();
  }
});
test("approved project creation is bound to the exact registered workspace and backup approvals bind include/exclude choices", async () => {
  const s = new Store(":memory:");
  try {
    const workspace = s.put("projects", {
      id: "w",
      name: "Files",
      kind: "workfiles",
      root: "C:/old/Files",
      projectsRoot: "C:/old/Projects",
      backupFiles: true,
    });
    const a = new Assistant(s, () => ({ mode: "Running" }));
    const creation = a.propose("chat", [
      {
        op: "project.create",
        workspaceId: "w",
        name: "New project",
        folder: "new-project",
      },
    ]);
    s.put("projects", { ...workspace, projectsRoot: "C:/changed/Projects" });
    let writes = 0;
    await assert.rejects(
      a.execute(creation.id, async () => {
        writes++;
      }),
      /APPROVAL_STALE/,
    );
    assert.equal(writes, 0);
    const backup = a.propose("chat", [{ op: "backup.run" }]);
    s.put("projects", {
      ...s.get("projects", "w"),
      backupExclude: ["private"],
    });
    await assert.rejects(
      a.execute(backup.id, async () => {
        writes++;
      }),
      /APPROVAL_STALE/,
    );
    assert.equal(writes, 0);
  } finally {
    s.close();
  }
});
test("AI plans validate each exact capability and require durable explicit approval", async () => {
  const s = new Store(":memory:");
  const a = new Assistant(s, () => ({ mode: "Running" }));
  assert.throws(
    () => a.propose("chat", [{ op: "shell.exec", cmd: "whoami" }]),
    /ASSISTANT_ACTION_DENIED/,
  );
  const p = a.propose("chat", [
    { op: "task.save", title: "Real action", done: false },
  ]);
  let calls = 0;
  assert.equal(p.status, "pending");
  assert.equal(s.all("tasks").length, 0);
  await a.execute(p.id, async (c: any) => {
    calls++;
    return s.put("tasks", c);
  });
  assert.equal(s.all("tasks").length, 1);
  await assert.rejects(
    a.execute(p.id, async () => {
      calls++;
    }),
    /PLAN_NOT_PENDING/,
  );
  assert.equal(calls, 1);
  s.close();
});
test("a plan becomes stale when an addressed item changes; interrupted effects never replay", async () => {
  const s = new Store(":memory:");
  const t = s.put("tasks", { title: "Before", done: false });
  const a = new Assistant(s, () => ({ mode: "Running" }));
  const p = a.propose("c", [
    { op: "task.save", id: t.id, title: "AI edit", done: true },
  ]);
  s.put("tasks", { ...t, title: "Owner changed" });
  await assert.rejects(
    a.execute(p.id, async () => {}),
    /APPROVAL_STALE/,
  );
  const q = a.propose("c", [{ op: "task.save", title: "New", done: false }]);
  s.put("plans", { ...q, status: "executing" });
  new Assistant(s, () => ({ mode: "Running" }));
  assert.equal(s.get("plans", q.id)!.status, "needsReview");
  s.close();
});
test("structured assistant text is decoded, unsafe action fields are not executable", () => {
  assert.equal(decodeAssistant("normal reply").reply, "normal reply");
  assert.ok(assistantSchema.properties);
  assert.deepEqual(
    decodeAssistant(
      JSON.stringify({
        reply: "Ready",
        actions: [
          JSON.stringify({ op: "task.save", title: "Test", done: false }),
        ],
      }),
    ).actions[0],
    { op: "task.save", title: "Test", done: false },
  );
});
