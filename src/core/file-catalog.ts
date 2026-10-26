import path from "node:path";
import type { Store, Row } from "./store.ts";
import { canonicalRoot, listFiles } from "./workspace.ts";
export type CatalogQuery = {
  space?: "files" | "projects" | "all";
  projectId?: string;
  mode?: "name" | "content";
  query?: string;
  extension?: string;
  category?: "design" | "document" | "asset" | "other" | "unclassified";
  tag?: string;
  linkedProjectId?: string;
  inboxOnly?: boolean;
  sourceOffset?: number;
  offset?: number;
  limit?: number;
};
type Manifest = {
  catalogedAt: string;
  truncated: boolean;
  files: { path: string; size: number; modified: number }[];
};
export async function refreshCatalog(
  store: Store,
  projectIds: string[],
  signal: AbortSignal,
) {
  if (
    !projectIds.length ||
    projectIds.length > 10 ||
    new Set(projectIds).size !== projectIds.length
  )
    throw Error("CATALOG_SCOPE_INVALID");
  const pending: { id: string; root: string; data: Manifest }[] = [];
  for (const id of projectIds) {
    signal.throwIfAborted();
    const p = store.get("projects", id);
    if (!p?.root || p.archived) throw Error("PROJECT_NOT_FOUND");
    const root = await canonicalRoot(p.root),
      listing = await listFiles(root, signal);
    const current = store.get("projects", id);
    if (!current || current.archived || current.root !== p.root)
      throw Error("PERMISSION_REVOKED");
    pending.push({
      id,
      root: p.root,
      data: {
        catalogedAt: new Date().toISOString(),
        truncated:
          listing.truncated ||
          listing.excluded.some((e) => e.reason === "fileAbove8MiB"),
        files: listing.files,
      },
    });
  }
  signal.throwIfAborted();
  store.transaction(() => {
    for (const row of pending) {
      const p = store.get("projects", row.id);
      if (!p || p.archived || p.root !== row.root)
        throw Error("PERMISSION_REVOKED");
      store.db
        .prepare(
          "INSERT INTO file_catalog(project_id,root,data) VALUES(?,?,?) ON CONFLICT(project_id) DO UPDATE SET root=excluded.root,data=excluded.data",
        )
        .run(row.id, row.root, JSON.stringify(row.data));
    }
  });
  return {
    sources: pending.map((p) => ({
      projectId: p.id,
      catalogedAt: p.data.catalogedAt,
      files: p.data.files.length,
      truncated: p.data.truncated,
    })),
  };
}
export function queryCatalog(
  store: Store,
  input: CatalogQuery,
  allowed?: Set<string>,
  allowedPaths?: Map<string, Set<string>>,
) {
  const space = input.space || "files";
  if (input.mode === "content" && !input.query?.trim())
    throw Error("INVALID_SEARCH");
  if (input.projectId && allowed && !allowed.has(input.projectId))
    throw Error("AI_SOURCE_APPROVAL_REQUIRED");
  const eligible = store
    .all("projects")
    .filter(
      (p) =>
        p.root &&
        !p.archived &&
        (!input.projectId || p.id === input.projectId) &&
        (!allowed || allowed.has(p.id)) &&
        (space === "all" ||
          (space === "files"
            ? p.kind === "workfiles"
            : p.kind !== "workfiles")),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const sourceOffset = input.sourceOffset || 0,
    projects = eligible.slice(sourceOffset, sourceOffset + 10);
  const matches: any[] = [],
    sources: any[] = [];
  let matched = 0,
    unindexedFiles = 0;
  const query = (input.query || "").trim().toLocaleLowerCase(),
    extension = (input.extension || "").replace(/^\./, "").toLocaleLowerCase();
  for (const p of projects) {
    const cached = store.db
      .prepare("SELECT root,data FROM file_catalog WHERE project_id=?")
      .get(p.id) as { root: string; data: string } | undefined;
    const manifest: Manifest | null =
      cached && cached.root === p.root ? JSON.parse(cached.data) : null;
    const indexed = store.db
      .prepare(
        "SELECT root,json_extract(data,'$.indexedAt') AS indexedAt,json_extract(data,'$.truncated') AS truncated,CASE WHEN ? THEN data ELSE NULL END AS data FROM file_index WHERE project_id=?",
      )
      .get(input.mode === "content" ? 1 : 0, p.id) as
      | {
          root: string;
          indexedAt: string;
          truncated: number;
          data: string | null;
        }
      | undefined;
    const content =
      indexed && indexed.root === p.root && indexed.data
        ? JSON.parse(indexed.data)
        : null;
    const contentByPath: Map<string, { body: string; modified: number }> =
      new Map((content?.files || []).map((f: any) => [f.path, f]));
    const metadata: Map<string, any> = new Map(
      (p.fileEntries || []).map((f: any) => [f.path.toLocaleLowerCase(), f]),
    );
    sources.push({
      projectId: p.id,
      name: p.name,
      space: p.kind === "workfiles" ? "files" : "projects",
      catalogedAt: manifest?.catalogedAt || null,
      contentIndexedAt:
        indexed && indexed.root === p.root ? indexed.indexedAt : null,
      truncated: manifest?.truncated || false,
      contentTruncated:
        indexed && indexed.root === p.root ? !!indexed.truncated : false,
      files: manifest
        ? manifest.files.filter(
            (f) =>
              !allowedPaths?.has(p.id) ||
              allowedPaths
                .get(p.id)!
                .has(
                  process.platform === "win32" ? f.path.toLowerCase() : f.path,
                ),
          ).length
        : null,
    });
    let inboxPrefix: string | null = null;
    if (p.kind === "workfiles" && p.inboxRoot) {
      const rel = path.relative(p.root, p.inboxRoot);
      if (rel && !rel.startsWith("..") && !path.isAbsolute(rel))
        inboxPrefix = rel.split(path.sep).join("/") + "/";
    }
    for (const f of manifest?.files || []) {
      if (
        allowedPaths?.has(p.id) &&
        !allowedPaths
          .get(p.id)!
          .has(process.platform === "win32" ? f.path.toLowerCase() : f.path)
      )
        continue;
      const meta = metadata.get(f.path.toLocaleLowerCase());
      if (
        extension &&
        path.extname(f.path).slice(1).toLocaleLowerCase() !== extension
      )
        continue;
      if (
        input.category &&
        (meta?.category || "unclassified") !== input.category
      )
        continue;
      if (
        input.tag &&
        !meta?.tags?.some(
          (t: string) =>
            t.toLocaleLowerCase() === input.tag!.toLocaleLowerCase(),
        )
      )
        continue;
      if (
        input.linkedProjectId &&
        !meta?.linkedProjectIds?.includes(input.linkedProjectId)
      )
        continue;
      if (input.inboxOnly && (!inboxPrefix || !f.path.startsWith(inboxPrefix)))
        continue;
      let hit:
        { line: number; text: string; contentIndexedAt: string } | undefined;
      if (input.mode === "content") {
        const text = contentByPath.get(f.path);
        if (!text || text.modified !== f.modified) {
          unindexedFiles++;
          continue;
        }
        const lines = text.body.split("\n"),
          line = lines.findIndex((l) => l.toLocaleLowerCase().includes(query));
        if (line < 0) continue;
        hit = {
          line: line + 1,
          text: lines[line].slice(0, 240),
          contentIndexedAt: content.indexedAt,
        };
      } else if (query && !f.path.toLocaleLowerCase().includes(query)) continue;
      matched++;
      if (
        matched <= (input.offset || 0) ||
        matches.length >= (input.limit || 50)
      )
        continue;
      matches.push({
        projectId: p.id,
        projectName: p.name,
        space: p.kind === "workfiles" ? "files" : "projects",
        ...f,
        extension: path.extname(f.path).slice(1).toLocaleLowerCase(),
        category: meta?.category || "unclassified",
        tags: meta?.tags || [],
        linkedProjectIds: meta?.linkedProjectIds || [],
        inbox: !!inboxPrefix && f.path.startsWith(inboxPrefix),
        catalogedAt: manifest!.catalogedAt,
        ...hit,
      });
    }
  }
  return {
    matches,
    sources,
    matched,
    unindexedFiles,
    offset: input.offset || 0,
    hasMore: matched > (input.offset || 0) + matches.length,
    sourceOffset,
    nextSourceOffset:
      sourceOffset + 10 < eligible.length ? sourceOffset + 10 : null,
    totalSources: eligible.length,
    cached: true,
  };
}
