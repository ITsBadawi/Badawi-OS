import { Store } from "./store.ts";
import { canonicalRoot, listFiles, readText } from "./workspace.ts";
type Index = {
  indexedAt: string;
  indexed: number;
  truncated: boolean;
  files: { path: string; body: string; modified: number }[];
};
/** A local cache in its own table: never part of project records or backups. */
export async function buildFileIndex(
  store: Store,
  projectId: string,
  root: string,
  signal: AbortSignal,
  validateScope?: () => void,
) {
  signal.throwIfAborted();
  const canonical = await canonicalRoot(root),
    listing = await listFiles(canonical, signal);
  const files: Index["files"] = [];
  let bytes = 0,
    truncated = listing.truncated;
  for (const file of listing.files) {
    signal.throwIfAborted();
    if (files.length >= 1000) {
      truncated = true;
      break;
    }
    let body: string;
    try {
      body = await readText(canonical, file.path);
    } catch (e) {
      signal.throwIfAborted();
      if (["FILE_TYPE_DENIED", "BINARY_FILE"].includes((e as Error).message))
        continue;
      truncated = true;
      continue;
    }
    if (body.length > 32768) truncated = true;
    body = body.slice(0, 32768);
    bytes += Buffer.byteLength(body);
    if (bytes > 16 * 1024 * 1024) {
      truncated = true;
      break;
    }
    files.push({ path: file.path, body, modified: file.modified });
  }
  signal.throwIfAborted();
  validateScope?.();
  const index: Index = {
    indexedAt: new Date().toISOString(),
    indexed: files.length,
    truncated,
    files,
  };
  store.db
    .prepare(
      "INSERT INTO file_index(project_id,root,data) VALUES(?,?,?) ON CONFLICT(project_id) DO UPDATE SET root=excluded.root,data=excluded.data",
    )
    .run(projectId, canonical, JSON.stringify(index));
  return { indexedAt: index.indexedAt, indexed: index.indexed, truncated };
}
export function searchFileIndex(
  store: Store,
  projectId: string,
  root: string,
  query: string,
) {
  if (!query.trim() || query.length > 200) throw Error("INVALID_SEARCH");
  const row = store.db
    .prepare("SELECT root,data FROM file_index WHERE project_id=?")
    .get(projectId) as { root: string; data: string } | undefined;
  if (!row || row.root !== root) return null;
  const index = JSON.parse(row.data) as Index,
    matches: { path: string; line: number; text: string }[] = [];
  for (const file of index.files) {
    const lines = file.body.split("\n");
    for (let line = 0; line < lines.length; line++)
      if (lines[line].toLocaleLowerCase().includes(query.toLocaleLowerCase())) {
        matches.push({
          path: file.path,
          line: line + 1,
          text: lines[line].slice(0, 240),
        });
        if (matches.length === 50)
          return {
            matches,
            scannedFiles: index.indexed,
            truncated: true,
            indexedAt: index.indexedAt,
          };
      }
  }
  return {
    matches,
    scannedFiles: index.indexed,
    truncated: index.truncated,
    indexedAt: index.indexedAt,
  };
}
