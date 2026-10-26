import { lstat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { Store } from "./store.ts";
import { canonicalRoot, listFiles, safeSegments } from "./workspace.ts";
const same = (a: string, b: string) =>
  process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
function overlaps(a: string, b: string) {
  const rel = path.relative(a, b);
  return !rel || (!rel.startsWith("..") && !path.isAbsolute(rel));
}
export async function inspectWorkspaceLink(
  store: Store,
  id: string,
  selected: string,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const project = store.get("projects", id);
  if (!project || project.kind !== "workfiles" || project.archived)
    throw Error("MANAGED_FILES_REQUIRED");
  const workspaceRoot = await canonicalRoot(selected),
    root = await canonicalRoot(path.join(workspaceRoot, "Files")),
    projectsRoot = await canonicalRoot(path.join(workspaceRoot, "Projects"));
  if (
    !same(root, path.join(workspaceRoot, "Files")) ||
    !same(projectsRoot, path.join(workspaceRoot, "Projects"))
  )
    throw Error("PATH_DENIED");
  const checkScope = () => {
    if (JSON.stringify(store.get("projects", id)) !== JSON.stringify(project))
      throw Error("PERMISSION_REVOKED");
    for (const p of store.all("projects"))
      if (
        p.id !== id &&
        p.root &&
        (overlaps(p.root, root) || overlaps(root, p.root))
      )
        throw Error("WORKSPACE_OVERLAP");
  };
  checkScope();
  let inboxRoot: string | null = null;
  const inbox = path.join(root, "Inbox"),
    inboxStat = await lstat(inbox).catch((e) => {
      if (e.code === "ENOENT") return null;
      throw e;
    });
  if (inboxStat) {
    if (!inboxStat.isDirectory() || inboxStat.isSymbolicLink())
      throw Error("PATH_DENIED");
    inboxRoot = await canonicalRoot(inbox);
    if (!same(inboxRoot, inbox)) throw Error("PATH_DENIED");
  }
  const listing = await listFiles(root, signal),
    files = new Map(
      listing.files.map((f) => [
        process.platform === "win32" ? f.path.toLowerCase() : f.path,
        f.path,
      ]),
    );
  let present = 0,
    missing = 0,
    removedLinks = 0;
  const missingPaths: string[] = [];
  const entries = (project.fileEntries || []).map((entry: any) => {
    const normalized = safeSegments(entry.path).join("/"),
      actual = files.get(
        process.platform === "win32" ? normalized.toLowerCase() : normalized,
      );
    if (actual) present++;
    else {
      missing++;
      missingPaths.push(normalized);
    }
    const links = (entry.linkedProjectIds || []).filter((pid: string) => {
      const p = store.get("projects", pid);
      return p && p.kind !== "workfiles";
    });
    removedLinks += (entry.linkedProjectIds || []).length - links.length;
    return { ...entry, path: actual || normalized, linkedProjectIds: links };
  });
  signal.throwIfAborted();
  checkScope();
  const target = { workspaceRoot, root, projectsRoot, inboxRoot };
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ project, target, entries, files: listing.files }))
    .digest("hex");
  return {
    projectId: id,
    name: project.name,
    oldRoot: project.root || null,
    ...target,
    entries,
    present,
    missing,
    missingPaths,
    removedLinks,
    truncated: listing.truncated,
    observedAt: new Date().toISOString(),
    fingerprint,
  };
}
