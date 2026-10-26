import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/core/store.ts";
import {
  reviewCriterion,
  verifyTaskEvidence,
  currentVerification,
} from "../src/core/task-evidence.ts";
import { saveTask } from "../src/core/tasks.ts";
test("a completion claim without acceptance criteria is unverified; manual acceptance is bound to the exact task meaning", async () => {
  const store = new Store(":memory:");
  try {
    let task = store.put("tasks", { title: "Claim only", done: true });
    let result = await verifyTaskEvidence(
      task,
      async () => {
        throw Error("No external read expected");
      },
      new AbortController().signal,
    );
    assert.equal(result.state, "unverified");
    task = store.put("tasks", {
      ...task,
      acceptanceCriteria: [
        { id: "c", text: "Owner checked the output", source: "manual" },
      ],
    });
    result = await verifyTaskEvidence(
      task,
      async () => {
        throw Error("No external read expected");
      },
      new AbortController().signal,
    );
    assert.equal(result.state, "unverified");
    task = reviewCriterion(store, task.id, "c", true);
    result = await verifyTaskEvidence(
      task,
      async () => {
        throw Error("No external read expected");
      },
      new AbortController().signal,
    );
    assert.equal(result.state, "verified");
    task = store.put("tasks", { ...task, verification: result });
    assert.equal(currentVerification(task).state, "verified");
    task = store.put("tasks", {
      ...task,
      description: "Changed acceptance context",
    });
    assert.equal(currentVerification(task).state, "unverified");
    const stale = await verifyTaskEvidence(
      task,
      async () => {
        throw Error("No external read expected");
      },
      new AbortController().signal,
    );
    assert.equal(stale.state, "unverified");
  } finally {
    store.close();
  }
});
test("Git, CI and deployment receipts are actual evidence signals and cannot prove semantic acceptance without owner review", async () => {
  const store = new Store(":memory:");
  try {
    let task = store.put("tasks", {
      title: "Implement change",
      done: true,
      projectId: "p",
      acceptanceCriteria: [
        { id: "g", text: "Commit exists", source: "gitCommit" },
        {
          id: "t",
          text: "The selected CI workflow passes",
          source: "ci",
          target: "tests.yml",
        },
        {
          id: "d",
          text: "Deployment is ready",
          source: "deployment",
          target: "vercel",
        },
      ],
    });
    let calls = 0;
    const collect = async (c: any) => {
      calls++;
      return {
        source: c.source,
        status: "verified" as const,
        reference:
          c.source === "gitCommit" ? "a".repeat(40) : "real-provider-receipt",
        observedAt: "2026-10-22T10:00:00Z",
      };
    };
    let result = await verifyTaskEvidence(
      task,
      collect,
      new AbortController().signal,
    );
    assert.equal(result.state, "needsReview");
    assert.equal(calls, 3);
    for (const c of task.acceptanceCriteria)
      task = reviewCriterion(store, task.id, c.id, true);
    result = await verifyTaskEvidence(
      task,
      collect,
      new AbortController().signal,
    );
    assert.equal(result.state, "verified");
    result = await verifyTaskEvidence(
      task,
      async (c: any) =>
        c.source === "ci"
          ? {
              source: "ci",
              status: "failed",
              reference: "failed-workflow",
              observedAt: "2026-10-22T10:00:00Z",
            }
          : collect(c),
      new AbortController().signal,
    );
    assert.equal(result.state, "needsReview");
    result = await verifyTaskEvidence(
      task,
      async (c: any) => ({
        source: c.source,
        status: "unverified",
        reason: "PROVIDER_NOT_CONNECTED",
      }),
      new AbortController().signal,
    );
    assert.equal(result.state, "unverified");
  } finally {
    store.close();
  }
});
test("abort does not publish a verified receipt and missing source provenance is never treated as proof", async () => {
  const task: any = {
      id: "t",
      title: "Evidence",
      done: true,
      acceptanceCriteria: [
        { id: "g", text: "Commit exists", source: "gitCommit" },
      ],
    },
    control = new AbortController();
  control.abort();
  await assert.rejects(
    verifyTaskEvidence(
      task,
      async () => ({
        source: "gitCommit",
        status: "verified",
        reference: "a".repeat(40),
        observedAt: new Date().toISOString(),
      }),
      control.signal,
    ),
  );
  const result = await verifyTaskEvidence(
    task,
    async () => ({ source: "gitCommit", status: "verified" }) as any,
    new AbortController().signal,
  );
  assert.equal(result.state, "unverified");
  assert.equal(result.evidence[0].reason, "EVIDENCE_PROVENANCE_REQUIRED");
});
test("the next recurring occurrence never inherits the previous occurrence owner reviews or evidence receipt", async () => {
  const store = new Store(":memory:");
  try {
    let task = store.put("tasks", {
      title: "Recurring",
      done: false,
      dueAt: "2026-12-01T10:00:00Z",
      recurrence: { frequency: "daily", zone: "Asia/Baghdad" },
      acceptanceCriteria: [
        { id: "c", text: "Owner checks each occurrence", source: "manual" },
      ],
    });
    task = reviewCriterion(store, task.id, "c", true);
    const receipt = await verifyTaskEvidence(
      task,
      async () => {
        throw Error("No external read");
      },
      new AbortController().signal,
    );
    store.put("tasks", { ...task, verification: receipt });
    const completed = saveTask(store, {
      op: "task.save",
      id: task.id,
      title: task.title,
      done: true,
    });
    const next = store.get("tasks", completed.nextOccurrenceId)!;
    assert.equal(next.criteriaReviews, undefined);
    assert.equal(next.verification, undefined);
    assert.equal(next.acceptanceCriteria[0].id, "c");
  } finally {
    store.close();
  }
});
