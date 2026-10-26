import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/core/store.ts";
import { Service } from "../src/core/service.ts";
test("an uncertain AI step needs a fresh explicit acknowledgement and another accounted request; its successful prefix is not replayed", async () => {
  const s = new Store(":memory:"),
    keys = new Map<string, string>();
  let calls = 0,
    online = false;
  const service = new Service(
    s,
    {
      secrets: {
        get: (k) => keys.get(k),
        set: (k, v) => {
          keys.set(k, v);
        },
        remove: (k) => {
          keys.delete(k);
        },
      },
      pickProject: async () => null,
      pickKey: async () => null,
      pickRestoreDirectory: async () => null,
      saveText: async () => false,
      openAuth: async () => {},
    },
    "unused",
    async () => {
      calls++;
      if (!online) throw Error("Synthetic provider interruption");
      return Response.json({
        status: "completed",
        steps: [
          {
            type: "model_output",
            content: [{ type: "text", text: "Actual controlled summary" }],
          },
        ],
        usage: { total_input_tokens: 8, total_output_tokens: 9 },
      });
    },
  );
  try {
    await service.command({
      op: "provider.save",
      provider: "gemini",
      model: "gemini-3.8-flash",
      key: "PRIVATE_PROVIDER_FIXTURE",
      maxTokens: 256,
      maxRequests: 5,
      budget: {
        dailyUSD: 0.1,
        inputPerMillion: 1,
        outputPerMillion: 10,
        date: "2026-10-23",
      },
    });
    const note = await service.command({
      op: "note.save",
      title: "Authorized note",
      body: "Selected synthetic content",
    });
    const job = await service.command({
      op: "job.save",
      name: "AI continuation",
      kind: "workflow",
      steps: [
        { kind: "reminder", name: "Completed notice", message: "Keep once" },
        {
          kind: "summary",
          name: "Uncertain AI",
          provider: "gemini",
          noteIds: [note.id],
        },
        { kind: "reminder", name: "After summary", message: "Done" },
      ],
      allowBackgroundAI: true,
      trigger: { type: "manual" },
      enabled: true,
      missedPolicy: "skip",
    });
    await service.command({
      op: "engine.mode",
      mode: "Running",
      epoch: service.engine.snapshot().epoch,
    });
    await service.command({ op: "job.run", id: job.id });
    const run = s.all("runs")[0];
    assert.equal(run.status, "failed");
    assert.equal(calls, 1);
    const before = service.snapshot().providers.gemini;
    assert.equal(before.usedToday, 1);
    assert.ok(before.budgetUsage.heldUSD > 0);
    const preview = await service.command({
      op: "workflow.recovery.preview",
      runId: run.id,
    });
    assert.equal(preview.requiresUncertainAck, true);
    online = true;
    await assert.rejects(
      service.command({
        op: "workflow.recovery.apply",
        approvalId: preview.approvalId,
        acknowledgeUncertain: false,
      }),
      /WORKFLOW_RECOVERY_ACK_REQUIRED/,
    );
    assert.equal(calls, 1);
    assert.equal(service.snapshot().providers.gemini.usedToday, 1);
    const fresh = await service.command({
      op: "workflow.recovery.preview",
      runId: run.id,
    });
    await service.command({
      op: "workflow.recovery.apply",
      approvalId: fresh.approvalId,
      acknowledgeUncertain: true,
    });
    assert.equal(s.get("runs", run.id)?.status, "succeeded");
    assert.equal(calls, 2);
    assert.equal(
      s.all("inbox").filter((i) => i.title === "Completed notice").length,
      1,
    );
    const after = service.snapshot().providers.gemini;
    assert.equal(after.usedToday, 2);
    assert.equal(s.setting(`budget.gemini.${new Date().toISOString().slice(0,10)}`).entries.length, 2);
    assert.ok(after.budgetUsage.heldUSD > 0);
    assert.ok(after.budgetUsage.spentUSD > 0);
  } finally {
    service.close();
    s.close();
  }
});
test("mode changes invalidate a recovery approval before any remaining effect", async () => {
  const f = fixture();
  try {
    const job = await f.create();
    await f.service.command({ op: "engine.mode", mode: "Running", epoch: 0 });
    await f.service.command({ op: "job.run", id: job.id });
    const run = f.s.all("runs")[0],
      preview = await f.service.command({
        op: "workflow.recovery.preview",
        runId: run.id,
      });
    await f.service.command({
      op: "engine.mode",
      mode: "Pause",
      epoch: f.service.engine.snapshot().epoch,
    });
    await assert.rejects(
      f.service.command({
        op: "workflow.recovery.apply",
        approvalId: preview.approvalId,
        acknowledgeUncertain: false,
      }),
      /WORKFLOW_RECOVERY_SOURCE_CHANGED/,
    );
    assert.equal(f.calls, 1);
    assert.equal(f.s.get("runs", run.id)?.status, "failed");
  } finally {
    f.close();
  }
});
test("continuation previews are bounded, expire and never execute merely by being requested", async () => {
  const f = fixture(),
    realNow = Date.now;
  try {
    const job = await f.create();
    await f.service.command({ op: "engine.mode", mode: "Running", epoch: 0 });
    await f.service.command({ op: "job.run", id: job.id });
    const run = f.s.all("runs")[0],
      previews = [];
    for (let n = 0; n < 11; n++)
      previews.push(
        await f.service.command({
          op: "workflow.recovery.preview",
          runId: run.id,
        }),
      );
    await assert.rejects(
      f.service.command({
        op: "workflow.recovery.apply",
        approvalId: previews[0].approvalId,
        acknowledgeUncertain: false,
      }),
      /WORKFLOW_RECOVERY_PREVIEW_EXPIRED/,
    );
    Date.now = () => realNow() + 301000;
    await assert.rejects(
      f.service.command({
        op: "workflow.recovery.apply",
        approvalId: previews[10].approvalId,
        acknowledgeUncertain: false,
      }),
      /WORKFLOW_RECOVERY_PREVIEW_EXPIRED/,
    );
    assert.equal(f.calls, 1);
    assert.equal(f.s.get("runs", run.id)?.status, "failed");
  } finally {
    Date.now = realNow;
    f.close();
  }
});
test("a reviewed run with all steps already proven can finalize without replaying effects or re-evaluating a now-false trigger", async () => {
  const f = fixture();
  try {
    const task = await f.service.command({
      op: "task.save",
      title: "Trigger",
      done: false,
    });
    const job = await f.service.command({
      op: "job.save",
      name: "Finalize historical results",
      kind: "workflow",
      steps: [
        { kind: "reminder", name: "First", message: "first" },
        { kind: "reminder", name: "Last", message: "last" },
      ],
      enabled: true,
      trigger: {
        type: "condition",
        checkEveryMinutes: 1,
        condition: { kind: "tasks.open", minCount: 1 },
      },
      missedPolicy: "skip",
    });
    await f.service.command({ op: "engine.mode", mode: "Running", epoch: 0 });
    await f.service.command({ op: "job.run", id: job.id });
    const run = f.s.all("runs")[0];
    assert.equal(run.status, "succeeded");
    f.s.put("runs", { ...run, status: "cancelled", reason: "userControl" });
    await f.service.command({
      op: "task.save",
      id: task.id,
      title: task.title,
      done: true,
    });
    const preview = await f.service.command({
      op: "workflow.recovery.preview",
      runId: run.id,
    });
    assert.equal(preview.remaining.length, 0);
    assert.equal(preview.requiresUncertainAck, false);
    await f.service.command({
      op: "workflow.recovery.apply",
      approvalId: preview.approvalId,
      acknowledgeUncertain: false,
    });
    assert.equal(f.s.get("runs", run.id)?.status, "succeeded");
    assert.equal(
      f.s.all("inbox").filter((i) => ["First", "Last"].includes(i.title))
        .length,
      2,
    );
    assert.equal(f.calls, 0);
  } finally {
    f.close();
  }
});
function fixture() {
  const s = new Store(":memory:"),
    secrets = new Map<string, string>();
  let offline = true,
    calls = 0;
  const service = new Service(
    s,
    {
      secrets: {
        get: (k) => secrets.get(k),
        set: (k, v) => {
          secrets.set(k, v);
        },
        remove: (k) => {
          secrets.delete(k);
        },
      },
      pickProject: async () => null,
      pickKey: async () => null,
      pickRestoreDirectory: async () => null,
      saveText: async () => false,
      openAuth: async () => {},
    },
    "unused",
    async (input) => {
      calls++;
      if (offline) throw Error("Synthetic offline");
      return Response.json(
        String(input).includes("/v7/")
          ? {
              deployments: [
                {
                  uid: "dpl_resume",
                  projectId: "prj_resume",
                  created: 1792677600000,
                  target: "production",
                },
              ],
            }
          : {
              id: "dpl_resume",
              projectId: "prj_resume",
              readyState: "READY",
              target: "production",
              createdAt: 1792677600000,
            },
      );
    },
  );
  const p = s.put("projects", {
    name: "Recovery target",
    deployments: { vercel: { projectId: "prj_resume", target: "production" } },
  });
  secrets.set("integration.vercel", "PRIVATE_FIXTURE");
  const create = () =>
    service.command({
      op: "job.save",
      name: "Recover actual flow",
      kind: "workflow",
      steps: [
        {
          kind: "reminder",
          name: "Already completed",
          message: "Preserve this exact receipt",
        },
        {
          kind: "integration",
          name: "Read deployment",
          integration: "vercel",
          projectId: p.id,
        },
        {
          kind: "reminder",
          name: "Remaining notice",
          message: "Result: {{previous}}",
        },
      ],
      allowBackgroundIntegration: true,
      enabled: true,
      trigger: { type: "manual" },
      missedPolicy: "skip",
    } as any);
  return {
    s,
    service,
    create,
    setOnline() {
      offline = false;
    },
    get calls() {
      return calls;
    },
    close() {
      service.close();
      s.close();
    },
  };
}
test("owner-reviewed continuation reuses the actual successful prefix and executes only remaining steps, once", async () => {
  const f = fixture();
  try {
    const job = await f.create();
    await f.service.command({ op: "engine.mode", mode: "Running", epoch: 0 });
    await f.service.command({ op: "job.run", id: job.id });
    const run = f.s.all("runs")[0],
      prefix = f.s.all("inbox").find((i) => i.title === "Already completed")!;
    assert.equal(run.status, "failed");
    assert.equal(run.steps[0].status, "succeeded");
    await assert.rejects(
      f.service.command({ op: "job.run", id: job.id }),
      /WORKFLOW_REPLAY_CONFIRMATION_REQUIRED/,
    );
    const preview = await f.service.command({
      op: "workflow.recovery.preview",
      runId: run.id,
    } as any);
    assert.equal(preview.fromIndex, 1);
    assert.equal(preview.requiresUncertainAck, false);
    assert.equal(preview.reused[0].receiptId, prefix.id);
    assert.equal(f.calls, 1);
    f.setOnline();
    await f.service.command({
      op: "workflow.recovery.apply",
      approvalId: preview.approvalId,
      acknowledgeUncertain: false,
    } as any);
    const completed = f.s.get("runs", run.id)!;
    assert.equal(completed.status, "succeeded");
    assert.equal(completed.steps.length, 3);
    assert.equal(completed.steps[0].reused, true);
    assert.equal(completed.steps[0].result.inboxId, prefix.id);
    assert.equal(
      f.s.all("inbox").filter((i) => i.title === "Already completed").length,
      1,
    );
    assert.equal(
      f.s.all("inbox").filter((i) => i.title === "Remaining notice").length,
      1,
    );
    assert.equal(completed.recoveryHistory.length, 1);
    assert.equal(completed.attempts.length, 2);
    await assert.rejects(
      f.service.command({
        op: "workflow.recovery.apply",
        approvalId: preview.approvalId,
        acknowledgeUncertain: false,
      } as any),
      /WORKFLOW_RECOVERY_PREVIEW_EXPIRED/,
    );
    assert.equal(f.calls, 3);
  } finally {
    f.close();
  }
});
test("recovery preview cancellation makes no effects; changed records, mode and source make approvals stale", async () => {
  const f = fixture();
  try {
    const job = await f.create();
    await f.service.command({ op: "engine.mode", mode: "Running", epoch: 0 });
    await f.service.command({ op: "job.run", id: job.id });
    const run = f.s.all("runs")[0];
    const preview = await f.service.command({
      op: "workflow.recovery.preview",
      runId: run.id,
    } as any);
    const count = f.s.all("inbox").length;
    assert.equal(f.calls, 1);
    assert.equal(f.s.get("runs", run.id)?.status, "failed");
    f.s.put("inbox", {
      ...f.s.get("inbox", run.steps[0].result.inboxId),
      body: "Altered",
    });
    await assert.rejects(
      f.service.command({
        op: "workflow.recovery.apply",
        approvalId: preview.approvalId,
        acknowledgeUncertain: false,
      } as any),
      /WORKFLOW_RECOVERY_/,
    );
    assert.equal(f.calls, 1);
    assert.equal(f.s.all("inbox").length, count);
    assert.throws(
      () =>
        f.service.assistant.validate({
          op: "workflow.recovery.apply",
          approvalId: "anything",
          acknowledgeUncertain: true,
        }),
      /ASSISTANT_ACTION_DENIED/,
    );
  } finally {
    f.close();
  }
});
