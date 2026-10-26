import { createHash } from "node:crypto";
import { mkdir, writeFile, lstat } from "node:fs/promises";
import path from "node:path";
import { Store } from "./store.ts";
import {
  canonicalRoot,
  listFiles,
  readBytes,
  safeSegments,
} from "./workspace.ts";
export type ProjectArchive = {
  id: string;
  name: string;
  capturedAt: string;
  excluded?: { path: string; reason: string }[];
  files: { path: string; data: string; sha256: string }[];
};
const digest = (b: Buffer) => createHash("sha256").update(b).digest("hex");
export function backupPaths(paths: string[]) {
  return [
    ...new Set(
      paths.map((p) => {
        const value = p.replaceAll("\\", "/").replace(/\/+$/, "");
        safeSegments(value);
        return value;
      }),
    ),
  ];
}
const scopeHash = (p: any) =>
  JSON.stringify([p.backupInclude || [], p.backupExclude || []]);
export async function captureProjects(
  store: Store,
  signal: AbortSignal,
  projectIds?: string[],
): Promise<ProjectArchive[]> {
  if (
    projectIds?.some((id) => {
      const p = store.get("projects", id);
      return !p?.root || !p.backupFiles || p.archived;
    })
  )
    throw Error("BACKUP_SELECTION_DENIED");
  const out: ProjectArchive[] = [];
  let size = 0,
    count = 0;
  for (const project of store
    .all("projects")
    .filter(
      (p) =>
        p.backupFiles &&
        p.root &&
        !p.archived &&
        (!projectIds || projectIds.includes(p.id)),
    )) {
    signal.throwIfAborted();
    const root = await canonicalRoot(project.root),
      listing = await listFiles(root, signal);
    const includes = backupPaths(project.backupInclude || []),
      excludes = backupPaths(project.backupExclude || []),
      scope = scopeHash(project);
    const matches = (file: string, patterns: string[]) =>
      patterns.some((p) => file === p || file.startsWith(p + "/"));
    if (listing.truncated) throw Error("PROJECT_ARCHIVE_INCOMPLETE");
    const archive: ProjectArchive = {
      id: project.id,
      name: project.name,
      capturedAt: new Date().toISOString(),
      excluded: listing.excluded,
      files: [],
    };
    for (const file of listing.files) {
      signal.throwIfAborted();
      const current = store.get("projects", project.id);
      if (
        !current?.backupFiles ||
        current.root !== project.root ||
        scopeHash(current) !== scope
      )
        throw Error("PERMISSION_REVOKED");
      if (
        (includes.length && !matches(file.path, includes)) ||
        matches(file.path, excludes)
      ) {
        if ((archive.excluded?.length || 0) < 1000)
          archive.excluded?.push({ path: file.path, reason: "ownerExcluded" });
        continue;
      }
      const bytes = await readBytes(root, file.path);
      size += bytes.length;
      if (size > 40 * 1024 * 1024 || ++count > 5000)
        throw Error("PROJECT_ARCHIVE_LIMIT");
      archive.files.push({
        path: file.path,
        data: bytes.toString("base64"),
        sha256: digest(bytes),
      });
    }
    const current = store.get("projects", project.id);
    if (
      !current?.backupFiles ||
      current.root !== project.root ||
      scopeHash(current) !== scope
    )
      throw Error("PERMISSION_REVOKED");
    out.push(archive);
  }
  return out;
}
export function validateProjectArchives(raw: any): ProjectArchive[] {
  try {
    if (!Array.isArray(raw) || raw.length > 100) throw Error();
    let total = 0,
      count = 0;
    const ids = new Set();
    for (const p of raw) {
      if (
        !p ||
        typeof p.id !== "string" ||
        !/^[-\w]{1,100}$/.test(p.id) ||
        ids.has(p.id.toLowerCase()) ||
        typeof p.name !== "string" ||
        p.name.length > 160 ||
        !Array.isArray(p.files)
      )
        throw Error();
      safeSegments(p.id);
      ids.add(p.id.toLowerCase());
      const names = new Set();
      for (const f of p.files) {
        if (
          ++count > 5000 ||
          typeof f.path !== "string" ||
          f.path.length > 600 ||
          typeof f.data !== "string" ||
          f.data.length > 12 * 1024 * 1024 ||
          typeof f.sha256 !== "string"
        )
          throw Error();
        safeSegments(f.path);
        const key = f.path.replaceAll("\\", "/").toLowerCase();
        if (names.has(key)) throw Error();
        names.add(key);
        const bytes = Buffer.from(f.data, "base64");
        total += bytes.length;
        if (
          total > 40 * 1024 * 1024 ||
          bytes.toString("base64") !== f.data ||
          digest(bytes) !== f.sha256
        )
          throw Error();
      }
    }
    return raw;
  } catch {
    throw Error("PROJECT_ARCHIVE_INVALID");
  }
}
export async function restoreProjectFiles(
  raw: any,
  directory: string,
  workfileIds: Set<string> = new Set(),
) {
  const projects = validateProjectArchives(raw);
  for (const p of projects) {
    const prefix = workfileIds.has(p.id)
      ? ["workspaces", p.id, "Files"]
      : ["projects", p.id];
    if (workfileIds.has(p.id)) {
      for (const child of ["Files", "Projects"]) {
        let parent = directory;
        for (const segment of ["workspaces", p.id, child]) {
          parent = path.join(parent, segment);
          await mkdir(parent, { recursive: true });
          const st = await lstat(parent);
          if (!st.isDirectory() || st.isSymbolicLink())
            throw Error("PROJECT_ARCHIVE_PATH");
        }
      }
    }
    for (const file of p.files) {
      const parts = [...prefix, ...safeSegments(file.path)];
      let parent = directory;
      for (const segment of parts.slice(0, -1)) {
        parent = path.join(parent, segment);
        await mkdir(parent, { recursive: true });
        const stat = await lstat(parent);
        if (!stat.isDirectory() || stat.isSymbolicLink())
          throw Error("PROJECT_ARCHIVE_PATH");
      }
      const target = path.join(directory, ...parts);
      if (path.relative(directory, target).startsWith(".."))
        throw Error("PROJECT_ARCHIVE_PATH");
      await writeFile(target, Buffer.from(file.data, "base64"), { flag: "wx" });
    }
  }
}
