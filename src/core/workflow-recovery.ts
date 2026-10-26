import { createHash } from "node:crypto";
import type { Store } from "./store.ts";
export type RecoveryContext = {
  backupKeyHash?: string;
  driveConnected?: boolean;
};
const hash = (value: unknown) => {
  const stable = (v: any): any =>
    Array.isArray(v)
      ? v.map(stable)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, stable(v[k])]),
          )
        : v;
  return createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
};
const projectScope = (s: Store, id: string, step: any) => {
  const p = s.get("projects", id);
  return p
    ? {
        id: p.id,
        root: p.root,
        kind: p.kind,
        archived: !!p.archived,
        ...(step.kind === "backup"
          ? {
              backupFiles: !!p.backupFiles,
              backupInclude: p.backupInclude,
              backupExclude: p.backupExclude,
            }
          : {}),
        ...(step.kind === "integration"
          ? {
              target:
                step.integration === "github"
                  ? p.github
                  : p.deployments?.[step.integration],
            }
          : {}),
      }
    : null;
};
/** A receipt is reusable only for the same effect and currently authorized source. */
export function workflowStepBinding(
  s: Store,
  step: any,
  context: RecoveryContext = {},
) {
  const definition = {
    name: step.name,
    kind: step.kind,
    message: step.message,
    projectId: step.projectId,
    noteIds: step.noteIds,
    provider: step.provider,
    integration: step.integration,
    grant: step.grant
      ? { hash: step.grant.hash, profileVersion: step.grant.profileVersion }
      : null,
  };
  const scopes =
    step.kind === "backup" && !step.projectId
      ? s
          .all("projects")
          .filter((p) => p.root && p.backupFiles && !p.archived)
          .map((p) => p.id)
          .sort()
          .map((id) => projectScope(s, id, step))
      : step.projectId
        ? [projectScope(s, step.projectId, step)]
        : [];
  return hash({
    definition,
    scopes,
    integrationVersion:
      step.kind === "integration"
        ? s.setting(`integration.version.${step.integration}`) || 0
        : null,
    profileVersion: ["summary", "briefing"].includes(step.kind)
      ? s.setting(`profile.${step.provider}`)?.version || 0
      : null,
    notes:
      step.kind === "summary"
        ? step.noteIds?.map((id: string) => s.get("notes", id) || null)
        : null,
    backup:
      step.kind === "backup"
        ? {
            account: s.setting("drive.account") || null,
            keyHash: context.backupKeyHash || null,
            connected: !!context.driveConnected,
          }
        : null,
  });
}
function receipt(s: Store, step: any, result: any) {
  if (result?.verified !== true)
    throw Error("WORKFLOW_RECOVERY_RECEIPT_MISSING");
  if (step.kind === "backup") {
    const b =
      typeof result.backupId === "string"
        ? s.get("backups", result.backupId)
        : null;
    if (
      !b ||
      b.status !== "verified" ||
      !b.remoteId ||
      !b.hash ||
      !b.verifiedAt
    )
      throw Error("WORKFLOW_RECOVERY_RECEIPT_MISSING");
    return {
      kind: "backup",
      id: b.id,
      account: b.account,
      remoteId: b.remoteId,
      hash: b.hash,
      md5: b.md5,
      size: b.size,
      keyHash: b.keyHash,
      grantsHash: b.grantsHash,
      projectIds: b.projectIds,
    };
  }
  if (
    !["reminder", "report", "summary", "briefing", "integration"].includes(
      step.kind,
    )
  )
    throw Error("WORKFLOW_RECOVERY_RECEIPT_MISSING");
  const item =
    typeof result.inboxId === "string" ? s.get("inbox", result.inboxId) : null;
  if (!item || item.title !== step.name || typeof item.body !== "string")
    throw Error("WORKFLOW_RECOVERY_RECEIPT_MISSING");
  if (
    ["summary", "briefing"].includes(step.kind) &&
    (item.provider !== step.provider || !item.model)
  )
    throw Error("WORKFLOW_RECOVERY_RECEIPT_MISSING");
  if (
    step.kind === "integration" &&
    (item.evidence?.type !== "integration" ||
      item.evidence.projectId !== step.projectId ||
      item.evidence.integration !== step.integration)
  )
    throw Error("WORKFLOW_RECOVERY_RECEIPT_MISSING");
  if (step.kind === "report" && item.evidence?.projectId !== step.projectId)
    throw Error("WORKFLOW_RECOVERY_RECEIPT_MISSING");
  return {
    kind: "inbox",
    id: item.id,
    title: item.title,
    body: item.body,
    evidence: item.evidence,
    provider: item.provider,
    model: item.model,
    noteIds: item.noteIds,
    usage: item.usage,
    createdAt: item.createdAt,
  };
}
export const workflowReceiptHash = (s: Store, step: any, result: any) =>
  hash(receipt(s, step, result));
export function inspectWorkflowRecovery(
  s: Store,
  runId: string,
  context: RecoveryContext = {},
) {
  const run = s.get("runs", runId),
    job = run ? s.get("jobs", run.jobId) : null;
  if (
    !run ||
    !job ||
    job.kind !== "workflow" ||
    !["failed", "cancelled", "needsReview", "blocked"].includes(run.status) ||
    !Array.isArray(job.steps) ||
    job.steps.length < 1 ||
    job.steps.length > 8
  )
    throw Error("WORKFLOW_RECOVERY_UNAVAILABLE");
  if (
    job.disabledReason ||
    (!job.enabled && !String(run.occurrence).startsWith("manual:"))
  )
    throw Error("WORKFLOW_RECOVERY_SOURCE_CHANGED");
  if ((run.recoveryHistory?.length || 0) >= 3)
    throw Error("WORKFLOW_RECOVERY_LIMIT");
  const saved = run.steps || [];
  if (!Array.isArray(saved) || saved.length > job.steps.length)
    throw Error("WORKFLOW_RECOVERY_SOURCE_CHANGED");
  const reused: any[] = [],
    proofs: any[] = [];
  let fromIndex = 0,
    unproven = false;
  for (const [index, old] of saved.entries()) {
    if (old.index !== index) throw Error("WORKFLOW_RECOVERY_SOURCE_CHANGED");
    if (old.status !== "succeeded") {
      unproven = true;
      continue;
    }
    if (unproven) throw Error("WORKFLOW_RECOVERY_SOURCE_CHANGED");
    const step = job.steps[index];
    if (!old.binding || !old.proofHash) throw Error("WORKFLOW_RECOVERY_LEGACY");
    if (
      old.kind !== step.kind ||
      old.binding !== workflowStepBinding(s, step, context)
    )
      throw Error("WORKFLOW_RECOVERY_SOURCE_CHANGED");
    const proof = receipt(s, step, old.result);
    if (hash(proof) !== old.proofHash)
      throw Error("WORKFLOW_RECOVERY_RECEIPT_CHANGED");
    if (
      step.kind === "backup" &&
      (!context.driveConnected ||
        proof.account !== s.setting("drive.account") ||
        !context.backupKeyHash ||
        proof.keyHash !== context.backupKeyHash)
    )
      throw Error("WORKFLOW_RECOVERY_SOURCE_CHANGED");
    proofs.push(proof);
    reused.push({
      index,
      name: step.name,
      kind: step.kind,
      receiptId: proof.id,
      finishedAt: old.finishedAt || null,
      historical: true,
    });
    fromIndex++;
  }
  const remaining = job.steps
    .slice(fromIndex)
    .map((step: any, offset: number) => {
      const p = step.projectId ? s.get("projects", step.projectId) : null;
      if (step.projectId && (!p || p.archived))
        throw Error("WORKFLOW_RECOVERY_SOURCE_CHANGED");
      if (
        ["summary", "briefing", "integration"].includes(step.kind) &&
        !step.grant?.hash
      )
        throw Error("WORKFLOW_RECOVERY_SOURCE_CHANGED");
      return {
        index: fromIndex + offset,
        name: step.name,
        kind: step.kind,
        message: step.message || null,
        projectId: step.projectId || null,
        projectName: p?.name || null,
        provider: step.provider || null,
        integration: step.integration || null,
        noteIds: step.noteIds || [],
      };
    });
  const uncertain = saved[fromIndex];
  const requiresUncertainAck =
    fromIndex < job.steps.length &&
    !(
      uncertain?.kind === "integration" &&
      ["GITHUB_NETWORK", "DEPLOYMENT_NETWORK"].includes(uncertain.reason)
    );
  const { nextDueAt, lastEvaluatedAt, createdAt, updatedAt, ...definition } =
    job;
  const fingerprint = hash({
    run,
    definition,
    proofs,
    bindings: job.steps.map((step: any) =>
      workflowStepBinding(s, step, context),
    ),
  });
  return {
    runId,
    jobId: job.id,
    jobName: job.name,
    fromIndex,
    reused,
    remaining,
    requiresUncertainAck,
    fingerprint,
  };
}
