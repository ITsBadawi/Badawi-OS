import type { Store } from "./store.ts";
export const policyOperations = [
  "condition.preview",
  "report.read",
  "files.catalog",
  "files.list",
  "files.read",
  "files.search",
  "git.read",
  "git.changes",
  "git.selection.propose",
  "task.list",
  "task.read",
  "note.read",
  "files.classify",
  "task.save",
  "task.verify",
  "task.remove",
  "note.save",
  "note.remove",
  "memory.save",
  "memory.remove",
  "project.pick",
  "project.archive",
  "project.permissions",
  "project.details",
  "project.create",
  "github.check",
  "deployment.check",
  "job.save",
  "job.remove",
  "job.run",
  "backup.run",
  "backup.list",
  "desktop.openFolder",
  "shell.exec",
  "code.write",
] as const;
export type ToolPolicy = "readOnly" | "auto" | "approval" | "forbidden";
const reads = new Set([
  "condition.preview",
  "report.read",
  "files.catalog",
  "files.list",
  "files.read",
  "files.search",
  "git.read",
  "git.changes",
  "task.list",
  "task.read",
  "note.read",
  "github.check",
  "deployment.check",
  "backup.list",
]);
const automatic = new Set(["task.save", "note.save", "memory.save"]);
const locked = new Set(["shell.exec", "code.write"]);
export function toolPolicy(store: Store, op: string): ToolPolicy {
  if (!policyOperations.includes(op as any) || locked.has(op))
    return "forbidden";
  const selected = store.setting("tool.policies")?.[op];
  if (selected !== undefined)
    return ["readOnly", "auto", "approval", "forbidden"].includes(selected)
      ? selected
      : "forbidden";
  return reads.has(op) &&
    !["github.check", "backup.list", "deployment.check"].includes(op)
    ? "readOnly"
    : "approval";
}
export function setToolPolicy(store: Store, op: string, policy: ToolPolicy) {
  if (
    !policyOperations.includes(op as any) ||
    (locked.has(op) && policy !== "forbidden")
  )
    throw Error("TOOL_POLICY_LOCKED");
  if (policy === "auto" && !automatic.has(op) && !reads.has(op))
    throw Error("TOOL_AUTO_NOT_ALLOWED");
  // Network reads use the engine and retain explicit action approval in this
  // release; they cannot be nested inside a running AI generation.
  if (
    policy === "auto" &&
    ["github.check", "backup.list", "deployment.check"].includes(op)
  )
    throw Error("TOOL_AUTO_NOT_ALLOWED");
  store.setting("tool.policies", {
    ...store.setting("tool.policies"),
    [op]: policy,
  });
  store.audit("tool.policyChanged", { tool: op, policy });
}
export function assertToolPolicy(store: Store, op: string) {
  const policy = toolPolicy(store, op);
  if (policy === "forbidden") throw Error("TOOL_FORBIDDEN");
  if (policy === "readOnly" && !reads.has(op)) throw Error("TOOL_READ_ONLY");
  return policy;
}
export function automaticAction(store: Store, command: any) {
  if (toolPolicy(store, command.op) !== "auto" || !automatic.has(command.op))
    return false;
  if (command.op === "task.save") {
    const prior = command.id ? store.get("tasks", command.id) : null;
    if (
      command.confirmDeadlineChange ||
      (prior?.deadlineFixed &&
        (command.deadlineFixed === false ||
          (command.dueAt !== undefined && command.dueAt !== prior.dueAt)))
    )
      return false;
  }
  return true;
}
export function policySnapshot(store: Store) {
  return policyOperations.map((op) => ({
    op,
    policy: toolPolicy(store, op),
    automaticAllowed:
      automatic.has(op) ||
      (reads.has(op) &&
        !["github.check", "backup.list", "deployment.check"].includes(op)),
    locked: locked.has(op),
  }));
}
