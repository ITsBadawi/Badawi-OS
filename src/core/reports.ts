import type { Store, Row } from "./store.ts";
import {
  currentVerification,
  evidenceProjectContext,
} from "./task-evidence.ts";

/** Local, read-only aggregates. No network calls, file reads or inferred success. */
export function workReport(
  store: Store,
  options: { days: number; projectId?: string; now?: number },
) {
  const { days, projectId } = options,
    now = options.now ?? Date.now();
  if (
    !Number.isInteger(days) ||
    days < 1 ||
    days > 365 ||
    !Number.isFinite(now)
  )
    throw Error("REPORT_RANGE_INVALID");
  if (projectId && !store.get("projects", projectId))
    throw Error("PROJECT_NOT_FOUND");
  const generatedAt = new Date(now).toISOString(),
    from = new Date(now - days * 86400000).toISOString();
  const valid = (value: unknown) =>
    typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    Date.parse(value) <= now;
  const within = (value: unknown) =>
    valid(value) && Date.parse(value as string) >= Date.parse(from);
  const latest = (values: unknown[]) =>
    (values
      .filter(valid)
      .sort((a, b) => Date.parse(b as string) - Date.parse(a as string))[0] as
      string | undefined) || null;
  const allTasks = store.all("tasks"),
    tasks = allTasks.filter((t) => !projectId || t.projectId === projectId);
  const counts = (rows: Row[]) => {
    const result = {
      total: rows.length,
      claimedCompleted: 0,
      open: 0,
      overdue: 0,
      verified: 0,
      needsReview: 0,
      unverified: 0,
      inProgress: 0,
      stale: 0,
    };
    for (const t of rows) {
      t.done ? result.claimedCompleted++ : result.open++;
      if (!t.done && valid(t.dueAt) && Date.parse(t.dueAt) < now)
        result.overdue++;
      const v = currentVerification(t, evidenceProjectContext(store, t));
      if (v.stale) result.stale++;
      if (
        ["verified", "needsReview", "unverified", "inProgress"].includes(
          v.state,
        )
      )
        result[
          v.state as "verified" | "needsReview" | "unverified" | "inProgress"
        ]++;
      else result.unverified++;
    }
    return result;
  };
  const allJobs = store.all("jobs"),
    jobs = allJobs.filter(
      (j) =>
        !projectId ||
        j.projectId === projectId ||
        j.steps?.some((step: any) => step.projectId === projectId),
    ),
    jobIds = new Set(jobs.map((j) => j.id));
  const runs = store
    .all("runs")
    .filter((r) => (!projectId || jobIds.has(r.jobId)) && within(r.createdAt));
  const automation = {
    total: runs.length,
    succeeded: runs.filter((r) => r.status === "succeeded").length,
    skipped: runs.filter((r) => r.status === "skipped").length,
    failed: runs.filter((r) => r.status === "failed").length,
    needsReview: runs.filter((r) => r.status === "needsReview").length,
    blocked: runs.filter((r) => r.status === "blocked").length,
    cancelled: runs.filter((r) => r.status === "cancelled").length,
    running: runs.filter((r) => r.status === "running").length,
    queued: runs.filter((r) => r.status === "queued").length,
    retryWaiting: runs.filter((r) => r.status === "retryWaiting").length,
    enabled: jobs.filter((j) => j.enabled).length,
    configured: jobs.length,
  };
  const account = store.setting("drive.account"),
    backups = store
      .all("backups")
      .filter(
        (b) =>
          account &&
          b.account === account &&
          (!projectId || b.projectIds?.includes(projectId)),
      );
  const verified = backups.filter(
    (b) => b.status === "verified" && valid(b.verifiedAt),
  );
  const alerts = store
    .all("inbox")
    .filter(
      (i) =>
        (!projectId ||
          i.projectId === projectId ||
          i.evidence?.projectId === projectId) &&
        within(i.createdAt),
    );
  const projects = store
    .all("projects")
    .filter(
      (p) =>
        p.kind !== "workfiles" &&
        !p.archived &&
        (!projectId || p.id === projectId),
    )
    .map((p) => {
      const linked = allTasks.filter((t) => t.projectId === p.id),
        summary = counts(linked),
        check = store.setting(`github.check.${p.id}`);
      return {
        id: p.id,
        name: p.name,
        tasks: summary,
        completionPercent: linked.length
          ? Math.round((summary.claimedCompleted / linked.length) * 100)
          : 0,
        verifiedPercent: linked.length
          ? Math.round((summary.verified / linked.length) * 100)
          : 0,
        lastActivityAt: latest([
          p.updatedAt,
          ...linked.map((t) => t.updatedAt),
        ]),
        lastEvidenceAt: latest(linked.map((t) => t.verification?.checkedAt)),
        lastBackupAt: latest(
          verified
            .filter((b) => b.projectIds?.includes(p.id))
            .map((b) => b.verifiedAt),
        ),
        github: check
          ? {
              checkedAt: check.checkedAt || null,
              state: check.comparison?.state || "unverified",
              source: "GitHub REST + local Git receipt",
            }
          : null,
      };
    });
  const audit = store.auditRows(),
    activity = audit.filter((a) => within(a.created));
  return {
    generatedAt,
    range: { days, from, to: generatedAt },
    scope: projectId ? { projectId } : { all: true },
    tasks: counts(tasks),
    projects,
    overdue: tasks
      .filter((t) => !t.done && valid(t.dueAt) && Date.parse(t.dueAt) < now)
      .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))
      .slice(0, 100)
      .map((t) => ({
        id: t.id,
        title: t.title,
        projectId: t.projectId || null,
        dueAt: t.dueAt,
        priority: t.priority || "normal",
      })),
    automation,
    backups: {
      verifiedCopies: verified.length,
      lastVerifiedAt: latest(verified.map((b) => b.verifiedAt)),
      pending: backups.filter((b) =>
        ["prepared", "uploading", "verifying", "checkpointed"].includes(
          b.status,
        ),
      ).length,
      accountLinked: !!account,
    },
    alerts: {
      count: alerts.length,
      items: alerts
        .slice(0, 20)
        .map((i) => ({ id: i.id, title: i.title, createdAt: i.createdAt })),
    },
    sources: {
      tasks: {
        source: "Local SQLite task records and acceptance receipts",
        latestAt: latest(tasks.map((t) => t.updatedAt)),
        asOf: generatedAt,
      },
      automation: {
        source: "Local SQLite run receipts",
        latestAt: latest(
          runs.map((r) => r.finishedAt || r.startedAt || r.createdAt),
        ),
        asOf: generatedAt,
      },
      backups: {
        source:
          "Local records of verified Google Drive copies; no remote refresh",
        latestAt: latest(verified.map((b) => b.verifiedAt)),
        asOf: generatedAt,
      },
      activity: {
        source:
          "Most recent 200 local audit events; global even for project reports",
        latestAt: latest(activity.map((a) => a.created)),
        count: activity.length,
        limited: true,
        asOf: generatedAt,
      },
    },
    limits: { overdue: 100, alertItems: 20, activity: 200 },
    note: "Task and project totals are current local records. Run and alert counts use the selected window; they are not completion rates for that window. Source receipts are historical observations, not live checks. A completion claim is separate from verified acceptance.",
  };
}
