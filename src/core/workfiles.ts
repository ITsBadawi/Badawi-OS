import { mkdir, lstat, realpath, copyFile, unlink } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { canonicalRoot, safeSegments, readBytes } from "./workspace.ts";
export type FileChange = {
  kind: "mkdir" | "move";
  source?: string;
  destination: string;
};
export type FilePreview = FileChange & {
  root: string;
  fingerprint: string | null;
};

async function absent(target: string) {
  try {
    await lstat(target);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
    throw e;
  }
  throw Error("DESTINATION_EXISTS");
}
async function safeParent(root: string, relative: string) {
  const parts = safeSegments(relative);
  if (parts.some((p) => /[<>"|?*\x00-\x1f]/.test(p)))
    throw Error("PATH_DENIED");
  let parent = root;
  for (const segment of parts.slice(0, -1)) {
    parent = path.join(parent, segment);
    const st = await lstat(parent);
    if (!st.isDirectory() || st.isSymbolicLink()) throw Error("PATH_DENIED");
  }
  const rel = path.relative(root, await realpath(parent));
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw Error("PATH_DENIED");
  return path.join(parent, parts.at(-1)!);
}
export async function createWorkspace(selected: string, inbox: boolean) {
  const root = await canonicalRoot(selected),
    files = path.join(root, "Files"),
    projects = path.join(root, "Projects");
  // Validate all existing children before creating anything. Never adopt links.
  const dirs = [files, projects, ...(inbox ? [path.join(files, "Inbox")] : [])];
  for (const dir of dirs) {
    try {
      const st = await lstat(dir);
      if (!st.isDirectory() || st.isSymbolicLink()) throw Error("PATH_DENIED");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
  for (const dir of dirs) {
    try {
      await mkdir(dir);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
  }
  for (const dir of dirs)
    if ((await lstat(dir)).isSymbolicLink()) throw Error("PATH_DENIED");
  return {
    root,
    files,
    projects,
    inbox: inbox ? path.join(files, "Inbox") : null,
  };
}
export async function previewFileChange(
  root: string,
  change: FileChange,
): Promise<FilePreview> {
  if ((await canonicalRoot(root)) !== root) throw Error("PATH_DENIED");
  const target = await safeParent(root, change.destination);
  await absent(target);
  let fingerprint: string | null = null;
  if (change.kind === "move") {
    if (!change.source) throw Error("PATH_DENIED");
    await safeParent(root, change.source);
    fingerprint = createHash("sha256")
      .update(await readBytes(root, change.source))
      .digest("hex");
  }
  return { ...change, root, fingerprint };
}
export async function applyFileChange(root: string, preview: FilePreview) {
  if (preview.root !== root) throw Error("APPROVAL_STALE");
  const current = await previewFileChange(root, preview);
  if (current.fingerprint !== preview.fingerprint)
    throw Error("APPROVAL_STALE");
  const target = await safeParent(root, preview.destination);
  if (preview.kind === "mkdir") {
    await mkdir(target);
    return {
      kind: "mkdir",
      destination: preview.destination,
      verified: (await lstat(target)).isDirectory(),
    };
  }
  const source = await safeParent(root, preview.source!);
  // Exclusive copy ensures a competing file is never overwritten. Verify both
  // copies before removing the exact source approved by the user.
  await copyFile(source, target, constants.COPYFILE_EXCL);
  try {
    const a = createHash("sha256")
      .update(await readBytes(root, preview.source!))
      .digest("hex");
    const b = createHash("sha256")
      .update(await readBytes(root, preview.destination))
      .digest("hex");
    if (a !== preview.fingerprint || b !== preview.fingerprint)
      throw Error("APPROVAL_STALE");
    await unlink(source);
    return {
      kind: "move",
      source: preview.source,
      destination: preview.destination,
      sha256: b,
      verified: true,
    };
  } catch (e) {
    // Keep source intact on failure; only remove our newly created copy if it
    // still contains the approved bytes. Never delete a concurrent replacement.
    try {
      if (
        createHash("sha256")
          .update(await readBytes(root, preview.destination))
          .digest("hex") === preview.fingerprint
      )
        await unlink(target);
    } catch {}
    throw e;
  }
}
