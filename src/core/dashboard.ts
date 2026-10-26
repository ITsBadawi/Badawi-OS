import { DateTime } from "luxon";
import type { Store, Row } from "./store.ts";
import {
  currentVerification,
  evidenceProjectContext,
} from "./task-evidence.ts";
export type DashboardContext = {
  mode: "today" | "project" | "review";
  projectId?: string;
};
export type DashboardPin = {
  type: "task" | "project" | "note" | "job";
  id: string;
};
const tables = {
  task: "tasks",
  project: "projects",
  note: "notes",
  job: "jobs",
} as const;
function resolve(store: Store, pin: DashboardPin) {
  const table = tables[pin.type];
  const row = table ? store.get(table, pin.id) : null;
  return row &&
    !(pin.type === "project" && (row.archived || row.kind === "workfiles"))
    ? row
    : null;
}
export function setDashboardContext(store: Store, context: DashboardContext) {
  if (
    context.mode === "project" &&
    !resolve(store, { type: "project", id: context.projectId || "" })
  )
    throw Error("DASHBOARD_TARGET_MISSING");
  store.setting(
    "dashboard.context",
    context.mode === "project"
      ? { mode: context.mode, projectId: context.projectId }
      : { mode: context.mode },
  );
  store.audit("dashboard.contextChanged", {
    mode: context.mode,
    projectId: context.projectId || null,
  });
}
export function pinDashboard(
  store: Store,
  pin: DashboardPin & { pinned: boolean },
) {
  if (pin.pinned && !resolve(store, pin))
    throw Error("DASHBOARD_TARGET_MISSING");
  const prior: DashboardPin[] = store.setting("dashboard.pins") || [];
  const pins = prior.filter((p) => !(p.type === pin.type && p.id === pin.id));
  if (pin.pinned) {
    if (pins.length >= 20) throw Error("DASHBOARD_PIN_LIMIT");
    pins.push({ type: pin.type, id: pin.id });
  }
  store.setting("dashboard.pins", pins);
  store.audit("dashboard.pinChanged", {
    type: pin.type,
    id: pin.id,
    pinned: pin.pinned,
  });
}
export function dashboardView(store: Store, now = Date.now()) {
  const context: DashboardContext = store.setting("dashboard.context") || {
    mode: "today",
  };
  const projectUnavailable =
    context.mode === "project" &&
    !resolve(store, { type: "project", id: context.projectId || "" });
  const inScope = (row: Row) =>
    !projectUnavailable &&
    (context.mode !== "project" ||
      row.projectId === context.projectId ||
      row.evidence?.projectId === context.projectId ||
      row.trigger?.condition?.projectId === context.projectId ||
      row.steps?.some((s: Row) => s.projectId === context.projectId));
  const overdue = (t: Row) =>
    !t.done &&
    Number.isFinite(Date.parse(t.dueAt)) &&
    Date.parse(t.dueAt) < now;
  const priority: Record<string, number> = {
    urgent: 0,
    high: 1,
    normal: 2,
    low: 3,
  };
  const allTasks = store.all("tasks");
  const tasks = allTasks.filter(
    (t) =>
      inScope(t) &&
      (context.mode === "review"
        ? overdue(t) ||
          (t.done &&
            currentVerification(t, evidenceProjectContext(store, t)).state !==
              "verified")
        : !t.done),
  );
  tasks.sort(
    (a, b) =>
      Number(overdue(b)) - Number(overdue(a)) ||
      (priority[a.priority] ?? 2) - (priority[b.priority] ?? 2) ||
      (Date.parse(a.dueAt) || Infinity) - (Date.parse(b.dueAt) || Infinity) ||
      a.id.localeCompare(b.id),
  );
  const projects = store
    .all("projects")
    .filter(
      (p) =>
        !p.archived &&
        p.kind !== "workfiles" &&
        !projectUnavailable &&
        (context.mode !== "project" || p.id === context.projectId),
    );
  const attention = projects
    .map((p) => {
      const github = store.setting(`github.check.${p.id}`),
        vercel = store.setting(`deployment.check.${p.id}.vercel`),
        railway = store.setting(`deployment.check.${p.id}.railway`);
      const reasons: {
        source: string;
        state: string;
        checkedAt: string | null;
      }[] = [];
      if (
        p.github &&
        (!github ||
          github.comparison?.state !== "identical" ||
          github.localStatus?.trim())
      )
        reasons.push({
          source: "GitHub",
          state: github?.localStatus?.trim()
            ? "localChanges"
            : github?.comparison?.state || "unverified",
          checkedAt: github?.checkedAt || null,
        });
      for (const [provider, receipt] of [
        ["vercel", vercel],
        ["railway", railway],
      ] as const)
        if (p.deployments?.[provider] && receipt?.status !== "verified")
          reasons.push({
            source: provider,
            state: receipt?.state || "unverified",
            checkedAt: receipt?.observedAt || null,
          });
      if (allTasks.some((t) => t.projectId === p.id && overdue(t)))
        reasons.push({
          source: "tasks",
          state: "overdue",
          checkedAt: new Date(now).toISOString(),
        });
      return { id: p.id, name: p.name, reasons };
    })
    .filter((p) => p.reasons.length > 0);
  const pins: DashboardPin[] = store.setting("dashboard.pins") || [];
  return {
    ...context,
    projectUnavailable,
    observedAt: new Date(now).toISOString(),
    today: DateTime.fromMillis(now, { zone: "Asia/Baghdad" }).toISODate(),
    pins: pins.map((pin) => {
      const row = resolve(store, pin);
      return {
        ...pin,
        title: row?.title || row?.name || null,
        available: !!row,
      };
    }),
    backupId:
      store
        .all("backups")
        .find(
          (b) =>
            b.status === "verified" &&
            b.account === store.setting("drive.account") &&
            (context.mode !== "project" ||
              (!projectUnavailable &&
                b.projectIds?.includes(context.projectId))),
        )?.id || null,
    taskIds: tasks.map((t) => t.id),
    projectIds: (context.mode === "review"
      ? projects.filter((p) => attention.some((a) => a.id === p.id))
      : projects
    ).map((p) => p.id),
    jobIds: store
      .all("jobs")
      .filter(inScope)
      .map((j) => j.id),
    inboxIds: store
      .all("inbox")
      .filter(inScope)
      .map((i) => i.id),
    attention,
  };
}
