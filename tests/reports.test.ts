import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/core/store.ts";
import { workReport } from "../src/core/reports.ts";
import {
  reviewCriterion,
  verifyTaskEvidence,
  evidenceProjectContext,
} from "../src/core/task-evidence.ts";

test("reports distinguish completion claims, current acceptance, overdue work and stale project-linked evidence", async () => {
  const s = new Store(":memory:"),
    now = Date.parse("2026-10-22T12:00:00Z");
  try {
    const p = s.put("projects", {
      id: "p",
      name: "Project",
      root: "C:/allowed",
      github: { owner: "owner", repo: "repo" },
    });
    s.put("projects", { id: "files", kind: "workfiles", name: "Documents" });
    s.put("projects", { id: "archive", name: "Archived", archived: true });
    s.put("tasks", {
      id: "claim",
      title: "Claim",
      projectId: p.id,
      done: true,
    });
    s.put("tasks", {
      id: "late",
      title: "Overdue",
      projectId: p.id,
      done: false,
      dueAt: "2026-10-21T12:00:00Z",
    });
    let task = s.put("tasks", {
      id: "accepted",
      title: "Accepted",
      projectId: p.id,
      done: true,
      acceptanceCriteria: [{ id: "c", text: "Checked", source: "manual" }],
    });
    task = reviewCriterion(s, task.id, "c", true);
    const verification = await verifyTaskEvidence(
      task,
      async () => {
        throw Error("No external read");
      },
      new AbortController().signal,
      now,
      evidenceProjectContext(s, task),
    );
    s.put("tasks", { ...task, verification });
    let report = workReport(s, { days: 7, now });
    assert.equal(report.projects.length, 1);
    assert.deepEqual(report.tasks, {
      total: 3,
      claimedCompleted: 2,
      open: 1,
      overdue: 1,
      verified: 1,
      needsReview: 0,
      unverified: 1,
      inProgress: 1,
      stale: 0,
    });
    assert.equal(report.projects[0].completionPercent, 67);
    assert.equal(report.projects[0].verifiedPercent, 33);
    assert.equal(report.generatedAt, new Date(now).toISOString());
    assert.equal(report.projects[0].tasks.verified, 1);
    s.put("projects", { ...p, root: "C:/different" });
    report = workReport(s, { days: 7, now });
    assert.equal(report.tasks.verified, 0);
    assert.equal(report.tasks.stale, 1);
    assert.equal(report.tasks.unverified, 2);
    assert.equal(
      workReport(s, { days: 7, projectId: p.id, now }).overdue[0].id,
      "late",
    );
    assert.throws(
      () => workReport(s, { days: 7, projectId: "unknown", now }),
      /PROJECT_NOT_FOUND/,
    );
  } finally {
    s.close();
  }
});

test("reports use all persisted runs, bounded time windows, actual backup account and timestamped source metadata without secrets or content", () => {
  const s = new Store(":memory:"),
    now = Date.parse("2026-10-22T12:00:00Z");
  try {
    const p = s.put("projects", {
      id: "p",
      name: "Project",
      root: "C:/private/path",
    });
    s.put("jobs", {
      id: "j",
      name: "Reminder",
      projectId: p.id,
      enabled: true,
    });
    for (let i = 0; i < 105; i++)
      s.put("runs", {
        id: `run-${i}`,
        jobId: "j",
        status: i === 0 ? "failed" : "succeeded",
        createdAt: "2026-10-21T10:00:00Z",
        result: { private: "NEVER_REPORT" },
      });
    s.put("runs", {
      id: "old",
      jobId: "j",
      status: "failed",
      createdAt: "2026-09-01T10:00:00Z",
    });
    s.put("runs", {
      id: "future",
      jobId: "j",
      status: "failed",
      createdAt: "2026-11-01T10:00:00Z",
    });
    s.setting("drive.account", "current");
    s.put("backups", {
      id: "b",
      account: "current",
      projectIds: ["p"],
      status: "verified",
      verifiedAt: "2026-10-20T10:00:00Z",
      remoteId: "cloud-id",
    });
    s.put("backups", {
      id: "other",
      account: "other",
      status: "verified",
      verifiedAt: "2026-10-22T10:00:00Z",
    });
    s.put("backups", {
      id: "trashed",
      account: "current",
      status: "trashed",
      verifiedAt: "2026-10-22T10:00:00Z",
    });
    s.put("inbox", {
      id: "i",
      title: "Failure requires attention",
      body: "PRIVATE_BODY",
      createdAt: "2026-10-22T10:00:00Z",
    });
    s.put("notes", { title: "Private note", body: "SECRET_NOTE" });
    const report = workReport(s, { days: 7, now });
    assert.equal(report.automation.total, 105);
    assert.equal(report.automation.failed, 1);
    assert.equal(report.automation.succeeded, 104);
    assert.equal(report.backups.verifiedCopies, 1);
    assert.equal(report.backups.lastVerifiedAt, "2026-10-20T10:00:00Z");
    assert.equal(report.alerts.count, 1);
    assert.equal(report.projects[0].lastBackupAt, "2026-10-20T10:00:00Z");
    assert.equal(report.sources.automation.source, "Local SQLite run receipts");
    assert.ok(report.sources.automation.latestAt);
    assert.equal(report.sources.activity.limited, true);
    const json = JSON.stringify(report);
    for (const privateValue of [
      "C:/private/path",
      "SECRET_NOTE",
      "PRIVATE_BODY",
      "NEVER_REPORT",
      "cloud-id",
    ])
      assert.ok(!json.includes(privateValue));
    assert.throws(
      () => workReport(s, { days: 0, now }),
      /REPORT_RANGE_INVALID/,
    );
    assert.throws(
      () => workReport(s, { days: 366, now }),
      /REPORT_RANGE_INVALID/,
    );
  } finally {
    s.close();
  }
});
