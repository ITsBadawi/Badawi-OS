import { createHash } from "node:crypto";
import type { Store, Row } from "./store.ts";
export type Criterion = {
  id: string;
  text: string;
  source: "manual" | "gitCommit" | "ci" | "deployment";
  target?: string;
};
export type Evidence = {
  source: Criterion["source"];
  status: "verified" | "unverified" | "failed";
  reference?: string;
  observedAt?: string;
  reason?: string;
  provider?: string;
};
const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export function evidenceProjectContext(store: Store, task: Row) {
  const p = task.projectId ? store.get("projects", task.projectId) : null;
  return p
    ? {
        id: p.id,
        root: p.root || null,
        github: p.github || null,
        deployments: p.deployments || null,
        archived: !!p.archived,
      }
    : null;
}
export function taskMeaning(task: Row, projectContext: unknown = null) {
  return hash({
    id: task.id,
    title: task.title,
    description: task.description || "",
    projectId: task.projectId || null,
    projectContext,
    acceptanceCriteria: task.acceptanceCriteria || [],
    evidenceCommit: task.evidenceCommit || null,
    subtasks: task.subtasks || [],
    dueAt: task.dueAt || null,
    repeatFromId: task.repeatFromId || null,
  });
}
export function taskEvidenceFingerprint(
  task: Row,
  projectContext: unknown = null,
) {
  return hash({
    meaning: taskMeaning(task, projectContext),
    done: !!task.done,
    status: task.status || null,
    reviews: task.criteriaReviews || {},
  });
}
export function reviewCriterion(
  store: Store,
  id: string,
  criterionId: string,
  accepted: boolean,
) {
  const task = store.get("tasks", id);
  if (!task) throw Error("TASK_NOT_FOUND");
  if (!task.acceptanceCriteria?.some((c: Criterion) => c.id === criterionId))
    throw Error("CRITERION_NOT_FOUND");
  const review = {
    accepted,
    meaning: taskMeaning(task, evidenceProjectContext(store, task)),
    at: new Date().toISOString(),
  };
  const result = store.put("tasks", {
    ...task,
    criteriaReviews: { ...task.criteriaReviews, [criterionId]: review },
  });
  store.audit("task.criterionReviewed", { taskId: id, criterionId, accepted });
  return result;
}
export function currentVerification(task: Row, projectContext: unknown = null) {
  const v = task.verification;
  if (v && v.fingerprint === taskEvidenceFingerprint(task, projectContext))
    return { state: v.state, checkedAt: v.checkedAt, stale: false };
  return {
    state: task.done ? "unverified" : "inProgress",
    checkedAt: v?.checkedAt || null,
    stale: !!v,
  };
}
export function currentCriterionReviews(
  task: Row,
  projectContext: unknown = null,
) {
  const meaning = taskMeaning(task, projectContext);
  return Object.fromEntries(
    (task.acceptanceCriteria || []).map((c: Criterion) => {
      const review = task.criteriaReviews?.[c.id],
        reviewed = review?.meaning === meaning;
      return [
        c.id,
        {
          reviewed,
          accepted: reviewed && review.accepted === true,
          at: reviewed ? review.at : null,
        },
      ];
    }),
  );
}
export async function verifyTaskEvidence(
  task: Row,
  collect: (criterion: Criterion) => Promise<Evidence>,
  signal: AbortSignal,
  now = Date.now(),
  projectContext: unknown = null,
) {
  signal.throwIfAborted();
  const meaning = taskMeaning(task, projectContext),
    criteria: Criterion[] = task.acceptanceCriteria || [],
    evidence: (Evidence & { criterionId: string; ownerAccepted: boolean })[] =
      [];
  const cache = new Map<string, Evidence>();
  for (const c of criteria) {
    signal.throwIfAborted();
    const review = task.criteriaReviews?.[c.id],
      currentReview = review?.meaning === meaning,
      ownerAccepted = currentReview && review.accepted === true;
    let item: Evidence;
    if (c.source === "manual")
      item = {
        source: "manual",
        status: currentReview
          ? ownerAccepted
            ? "verified"
            : "failed"
          : "unverified",
        ...(currentReview
          ? {
              reference: "owner-review",
              observedAt: review.at,
              provider: "Owner review",
            }
          : { reason: "OWNER_REVIEW_REQUIRED" }),
      };
    else {
      const key = JSON.stringify([c.source, c.target || null]);
      if (cache.has(key)) item = cache.get(key)!;
      else {
        try {
          item = await collect(c);
        } catch (error) {
          signal.throwIfAborted();
          const code = error instanceof Error ? error.message : "";
          item = {
            source: c.source,
            status: "unverified",
            reason: /^[A-Z][A-Z0-9_]{1,100}$/.test(code)
              ? code
              : "EVIDENCE_UNAVAILABLE",
          };
        }
        if (
          item.source !== c.source ||
          !["verified", "unverified", "failed"].includes(item.status) ||
          (item.status === "verified" &&
            (!item.reference ||
              item.reference.length > 300 ||
              !item.observedAt ||
              !Number.isFinite(Date.parse(item.observedAt))))
        )
          item = {
            source: c.source,
            status: "unverified",
            reason: "EVIDENCE_PROVENANCE_REQUIRED",
          };
        cache.set(key, item);
      }
    }
    evidence.push({
      ...item,
      criterionId: c.id,
      ownerAccepted: !!ownerAccepted,
    });
  }
  signal.throwIfAborted();
  const state = !task.done
    ? "inProgress"
    : !criteria.length
      ? "unverified"
      : evidence.some((e) => e.status === "failed")
        ? "needsReview"
        : evidence.some((e) => e.status === "unverified")
          ? "unverified"
          : evidence.some((e) => !e.ownerAccepted)
            ? "needsReview"
            : "verified";
  return {
    state,
    fingerprint: taskEvidenceFingerprint(task, projectContext),
    checkedAt: new Date(now).toISOString(),
    evidence,
  };
}
