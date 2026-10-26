import { createHash } from "node:crypto";
import type { Row, Store } from "./store.ts";
/** Only failed transport reads are safe to replay automatically. No AI or writes. */
export function readRetryPolicy(job: Row) {
  const policy = job.retry;
  if (
    job.kind !== "integration" ||
    !["github", "vercel", "railway"].includes(job.integration) ||
    !policy ||
    !Number.isInteger(policy.maxAttempts) ||
    policy.maxAttempts < 2 ||
    policy.maxAttempts > 3 ||
    !Number.isInteger(policy.delaySeconds) ||
    policy.delaySeconds < 15 ||
    policy.delaySeconds > 300
  )
    return null;
  return {
    maxAttempts: policy.maxAttempts as number,
    delaySeconds: policy.delaySeconds as number,
  };
}
export const transientReadFailure = (code: string) =>
  code === "GITHUB_NETWORK" || code === "DEPLOYMENT_NETWORK";
export function retryIdentity(store: Store, job: Row) {
  const {
    nextDueAt,
    lastEvaluatedAt,
    createdAt,
    updatedAt,
    op,
    ...definition
  } = job;
  const project = job.projectId ? store.get("projects", job.projectId) : null;
  const stable = (value: any): any =>
    Array.isArray(value)
      ? value.map(stable)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, stable(value[key])]),
          )
        : value;
  return createHash("sha256")
    .update(
      JSON.stringify(
        stable({
          definition,
          project: project
            ? {
                id: project.id,
                root: project.root,
                archived: !!project.archived,
                github: project.github,
                deployments: project.deployments,
              }
            : null,
          credentialVersion:
            store.setting(`integration.version.${job.integration}`) || 0,
        }),
      ),
    )
    .digest("hex");
}
