import { createHash } from "node:crypto";
import type { z } from "zod";
import type { Store, Row } from "./store.ts";
import { conditionSchema } from "../contracts.ts";
export type Condition = z.infer<typeof conditionSchema>;
export type ConditionObservation = {
  matched: boolean | null;
  value: number | null;
  source: string;
  observedAt: string;
  sourceAt: string | null;
  reason?: string;
};
export function conditionIdentity(job: Row) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        id: job.id,
        name: job.name,
        trigger: job.trigger,
        kind: job.kind,
        message: job.message || null,
        projectId: job.projectId || null,
        provider: job.provider || null,
        integration: job.integration || null,
        noteIds: job.noteIds || null,
        steps: job.steps || null,
        grant: job.grant || null,
      }),
    )
    .digest("hex");
}
export function conditionObservation(
  store: Store,
  input: unknown,
  now = Date.now(),
): ConditionObservation {
  const observedAt = new Date(now).toISOString(),
    parsed = conditionSchema.safeParse(input);
  const empty = (
    reason: string,
    source = "Local condition validation",
  ): ConditionObservation => ({
    matched: null,
    value: null,
    source,
    observedAt,
    sourceAt: null,
    reason,
  });
  if (!parsed.success) return empty("CONDITION_INVALID");
  const c = parsed.data;
  if (c.projectId) {
    const p = store.get("projects", c.projectId);
    if (!p || p.archived) return empty("CONDITION_PROJECT_UNAVAILABLE");
  }
  const valid = (value: unknown) =>
    typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    Date.parse(value) <= now;
  const latest = (values: unknown[]) =>
    (values
      .filter(valid)
      .sort((a, b) => Date.parse(b as string) - Date.parse(a as string))[0] as
      string | undefined) || null;
  if (c.kind === "tasks.open" || c.kind === "tasks.overdue") {
    const rows = store
        .all("tasks")
        .filter((t) => !c.projectId || t.projectId === c.projectId),
      value = rows.filter(
        (t) =>
          !t.done &&
          (c.kind === "tasks.open" ||
            (valid(t.dueAt) && Date.parse(t.dueAt) < now)),
      ).length;
    return {
      matched: value >= c.minCount,
      value,
      source: "Local SQLite tasks",
      observedAt,
      sourceAt: latest(rows.map((t) => t.updatedAt)),
    };
  }
  if (c.kind !== "backup.stale") return empty("CONDITION_INVALID");
  const account = store.setting("drive.account");
  if (!account)
    return empty("CONDITION_DRIVE_UNLINKED", "Local verified Drive receipts");
  const verified = store
      .all("backups")
      .filter(
        (b) =>
          b.account === account &&
          b.status === "verified" &&
          valid(b.verifiedAt) &&
          (!c.projectId || b.projectIds?.includes(c.projectId)),
      ),
    sourceAt = latest(verified.map((b) => b.verifiedAt));
  const hours = sourceAt ? (now - Date.parse(sourceAt)) / 3600000 : null;
  return {
    matched: hours === null || hours >= c.ageHours,
    value: hours,
    source: "Local verified Drive receipts",
    observedAt,
    sourceAt,
    ...(hours === null ? { reason: "CONDITION_NO_VERIFIED_BACKUP" } : {}),
  };
}
/** Called only by the running, idle engine. The latch and queued occurrence
 * commit together, so a crash cannot repeat an already-enqueued true edge. */
export function queueConditions(store: Store, now = Date.now()) {
  let queued = 0;
  for (const job of store.all("jobs")) {
    if (!job.enabled || job.trigger?.type !== "condition") continue;
    const identity = conditionIdentity(job),
      key = `condition.${job.id}`,
      saved = store.setting(key),
      last = saved?.identity === identity ? saved : null;
    const minutes = job.trigger.checkEveryMinutes;
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) continue;
    const lastAt = Date.parse(last?.observation?.observedAt || "");
    if (
      Number.isFinite(lastAt) &&
      now >= lastAt &&
      now - lastAt < minutes * 60000
    )
      continue;
    const observation = conditionObservation(store, job.trigger.condition, now),
      sequence = Number.isSafeInteger(saved?.sequence) ? saved.sequence : 0;
    const matched =
      observation.matched === null ? !!last?.matched : observation.matched;
    const state = { identity, matched, sequence, observation };
    if (matched && observation.matched === true && !last?.matched) {
      const next = { ...state, sequence: sequence + 1 };
      const ok = store.enqueue(
        job.id,
        `condition:${identity}:${sequence + 1}`,
        undefined,
        { key, value: next, onFailure: { ...next, matched: false } },
      );
      if (ok) {
        queued++;
        store.audit("condition.matched", {
          jobId: job.id,
          sequence: sequence + 1,
          kind: job.trigger.condition.kind,
        });
      }
    } else store.setting(key, state);
  }
  return queued;
}
