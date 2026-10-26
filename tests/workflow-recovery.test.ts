import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/core/store.ts";
import {
  inspectWorkflowRecovery,
  workflowStepBinding,
  workflowReceiptHash,
} from "../src/core/workflow-recovery.ts";
function fixture() {
  const s = new Store(":memory:");
  const p = s.put("projects", {
    name: "Target",
    root: "C:/fixture",
    archived: false,
    deployments: { vercel: { projectId: "prj_fixture", target: "production" } },
  });
  const steps = [
    {
      name: "Completed notice",
      kind: "reminder",
      message: "Already delivered",
    },
    {
      name: "Inspect",
      kind: "integration",
      projectId: p.id,
      integration: "vercel",
      grant: { hash: "authorized" },
    },
    { name: "Next notice", kind: "reminder", message: "{{previous}}" },
  ];
  const job = s.put("jobs", {
    name: "Workflow",
    kind: "workflow",
    steps,
    enabled: true,
    trigger: { type: "manual" },
  });
  const item = s.put("inbox", {
    title: steps[0].name,
    body: steps[0].message,
    createdAt: new Date().toISOString(),
  });
  const result = { inboxId: item.id, verified: true };
  const prefix = {
    index: 0,
    kind: steps[0].kind,
    name: steps[0].name,
    status: "succeeded",
    binding: workflowStepBinding(s, steps[0]),
    proofHash: workflowReceiptHash(s, steps[0], result),
    result,
    finishedAt: new Date().toISOString(),
  };
  const run = s.put("runs", {
    jobId: job.id,
    occurrence: "manual:fixture",
    status: "failed",
    reason: "DEPLOYMENT_NETWORK",
    steps: [
      prefix,
      {
        index: 1,
        kind: "integration",
        name: "Inspect",
        status: "needsReview",
        reason: "DEPLOYMENT_NETWORK",
      },
    ],
    recoveryHistory: [],
  });
  return { s, p, job, item, run };
}
test("partial recovery derives the exact proven prefix and remaining steps from actual receipts, without executing effects", () => {
  const { s, job, run } = fixture();
  try {
    const review = inspectWorkflowRecovery(s, run.id);
    assert.equal(review.fromIndex, 1);
    assert.equal(review.requiresUncertainAck, false);
    assert.equal(review.reused[0].receiptId, s.all("inbox")[0].id);
    assert.deepEqual(
      review.remaining.map((x: any) => x.index),
      [1, 2],
    );
    assert.equal(review.jobName, job.name);
    assert.equal(review.fingerprint.length, 64);
    assert.equal(s.all("inbox").length, 1);
    assert.equal(s.get("runs", run.id)?.status, "failed");
    assert.equal(
      inspectWorkflowRecovery(s, run.id).fingerprint,
      review.fingerprint,
    );
  } finally {
    s.close();
  }
});
test("missing, changed and unbound completed-step receipts cannot be reused; read/unread status does not alter proof", () => {
  for (const mutation of ["deleted", "body", "definition", "legacy", "gap"]) {
    const { s, job, item, run } = fixture();
    try {
      const before = inspectWorkflowRecovery(s, run.id);
      s.put("inbox", { ...item, read: true });
      assert.equal(
        inspectWorkflowRecovery(s, run.id).fingerprint,
        before.fingerprint,
      );
      if (mutation === "deleted") s.remove("inbox", item.id);
      if (mutation === "body")
        s.put("inbox", { ...item, body: "Changed after execution" });
      if (mutation === "definition")
        s.put("jobs", {
          ...job,
          steps: [
            { ...job.steps[0], message: "New effect" },
            ...job.steps.slice(1),
          ],
        });
      if (mutation === "legacy")
        s.put("runs", {
          ...run,
          steps: [{ ...run.steps[0], binding: undefined }, run.steps[1]],
        });
      if (mutation === "gap")
        s.put("runs", {
          ...run,
          steps: [
            { ...run.steps[0], status: "needsReview" },
            { ...run.steps[1], status: "succeeded" },
          ],
        });
      assert.throws(
        () => inspectWorkflowRecovery(s, run.id),
        /WORKFLOW_RECOVERY_/,
      );
    } finally {
      s.close();
    }
  }
});
test("uncertain AI or interrupted effects require acknowledgement, controls and history cap prevent silent replay", () => {
  const { s, job, run } = fixture();
  try {
    s.put("jobs", {
      ...job,
      steps: [
        job.steps[0],
        {
          name: "AI",
          kind: "summary",
          provider: "gemini",
          noteIds: ["n"],
          grant: { hash: "h", profileVersion: 0 },
        },
      ],
    });
    s.put("runs", {
      ...run,
      status: "needsReview",
      steps: [run.steps[0], { index: 1, kind: "summary", status: "running" }],
    });
    assert.equal(inspectWorkflowRecovery(s, run.id).requiresUncertainAck, true);
    s.put("runs", { ...s.get("runs", run.id), recoveryHistory: [{}, {}, {}] });
    assert.throws(
      () => inspectWorkflowRecovery(s, run.id),
      /WORKFLOW_RECOVERY_LIMIT/,
    );
    s.put("runs", { ...run, status: "succeeded" });
    assert.throws(
      () => inspectWorkflowRecovery(s, run.id),
      /WORKFLOW_RECOVERY_UNAVAILABLE/,
    );
    s.put("runs", run);
    s.put("jobs", { ...job, disabledReason: "sourceChanged" });
    assert.throws(
      () => inspectWorkflowRecovery(s, run.id),
      /WORKFLOW_RECOVERY_SOURCE_CHANGED/,
    );
  } finally {
    s.close();
  }
});
test("future-step edits invalidate an existing preview while a newly reviewed remaining plan can retain an unchanged proven prefix", () => {
  const { s, job, run } = fixture();
  try {
    const before = inspectWorkflowRecovery(s, run.id);
    s.put("jobs", {
      ...job,
      steps: [
        ...job.steps.slice(0, 2),
        { ...job.steps[2], message: "New owner-reviewed remaining message" },
      ],
    });
    const after = inspectWorkflowRecovery(s, run.id);
    assert.equal(after.fromIndex, 1);
    assert.notEqual(after.fingerprint, before.fingerprint);
    assert.equal(
      after.remaining[1].message,
      "New owner-reviewed remaining message",
    );
  } finally {
    s.close();
  }
});
test("backup prefix proof is bound to the actual verified account, key and selected sources and remains historical evidence", () => {
  const s = new Store(":memory:");
  try {
    s.setting("drive.account", "account");
    const p = s.put("projects", {
      name: "Files",
      root: "C:/files",
      backupFiles: true,
      archived: false,
    });
    const step = { kind: "backup", name: "Upload", projectId: p.id },
      context = { backupKeyHash: "key-hash", driveConnected: true };
    const b = s.put("backups", {
      account: "account",
      status: "verified",
      remoteId: "remote",
      hash: "digest",
      md5: "md5",
      size: 10,
      keyHash: "key-hash",
      verifiedAt: new Date().toISOString(),
      projectIds: [p.id],
    });
    const result = { backupId: b.id, verified: true };
    const job = s.put("jobs", {
      name: "Backup then notify",
      kind: "workflow",
      enabled: true,
      steps: [step, { kind: "reminder", name: "Notify" }],
    });
    const run = s.put("runs", {
      jobId: job.id,
      status: "needsReview",
      occurrence: "manual:backup",
      steps: [
        {
          index: 0,
          kind: "backup",
          name: step.name,
          status: "succeeded",
          binding: workflowStepBinding(s, step, context),
          proofHash: workflowReceiptHash(s, step, result),
          result,
          finishedAt: b.verifiedAt,
        },
        { index: 1, kind: "reminder", status: "running" },
      ],
    });
    const review = inspectWorkflowRecovery(s, run.id, context);
    assert.equal(review.reused[0].historical, true);
    assert.equal(review.reused[0].receiptId, b.id);
    assert.throws(
      () =>
        inspectWorkflowRecovery(s, run.id, {
          ...context,
          backupKeyHash: "different-key",
        }),
      /WORKFLOW_RECOVERY_/,
    );
    s.put("backups", { ...b, status: "remoteMissing" });
    assert.throws(
      () => inspectWorkflowRecovery(s, run.id, context),
      /WORKFLOW_RECOVERY_/,
    );
  } finally {
    s.close();
  }
});
