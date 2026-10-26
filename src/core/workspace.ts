import { lstat, realpath, opendir, open } from "node:fs/promises";
import path from "node:path";
const denied =
  /^(chatgpt-subscription|\.?chatgpt-auth.*|\.git|node_modules|dist|build|\.next|coverage|\.cache|vendor|\.env.*|.*\.(pem|key|p12|pfx|crt|cer|sqlite|db|kdbx|exe|dll|msi|scr|lnk|url|bat|cmd|com|sys)|client_secret.*|.*recovery.*key.*|tokens?.*|private|\.ssh|\.aws|\.codex|credentials.*|secrets?.*|id_rsa.*|id_ed25519.*)$/i;
const textExt =
  /\.(md|txt|json|jsonc|ts|tsx|js|jsx|mjs|cjs|css|html|xml|yaml|yml|toml|py|rs|go|java|cs|cpp|c|h|sql|sh|ps1|gitignore)$/i;
export async function canonicalRoot(root: string) {
  if (!path.isAbsolute(root) || root.startsWith("\\\\"))
    throw Error("PATH_DENIED");
  const stat = await lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error("PATH_DENIED");
  return realpath(root);
}
export function safeSegments(relative: string) {
  if (
    !relative ||
    path.isAbsolute(relative) ||
    relative.startsWith("/") ||
    relative.startsWith("\\") ||
    relative.includes(":") ||
    relative.includes("\0")
  )
    throw Error("PATH_DENIED");
  const parts = relative.split(/[\\/]/);
  if (
    parts.some(
      (p) =>
        !p ||
        p === ".." ||
        p === "." ||
        denied.test(p) ||
        /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(p) ||
        p.endsWith(".") ||
        p.endsWith(" "),
    )
  )
    throw Error("PATH_DENIED");
  return parts;
}
async function checked(root: string, relative: string) {
  const parts = safeSegments(relative);
  let target = root;
  for (const part of parts) {
    target = path.join(target, part);
    const st = await lstat(target);
    if (st.isSymbolicLink() || (!st.isDirectory() && st.nlink !== 1))
      throw Error("PATH_DENIED");
  }
  const actual = await realpath(target);
  const rel = path.relative(root, actual);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw Error("PATH_DENIED");
  return actual;
}
export async function readBytes(
  root: string,
  relative: string,
  max = 8 * 1024 * 1024,
) {
  const target = await checked(root, relative);
  const handle = await open(target, "r");
  try {
    const stat = await handle.stat();
    const again = await lstat(target);
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      stat.size > max ||
      again.isSymbolicLink() ||
      again.ino !== stat.ino ||
      again.dev !== stat.dev
    )
      throw Error("PATH_DENIED");
    const bytes = Buffer.alloc(Math.min(stat.size, max) + 1);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    const after = await handle.stat();
    if (
      bytesRead > max ||
      after.size !== stat.size ||
      after.mtimeMs !== stat.mtimeMs
    )
      throw Error("FILE_CHANGED");
    await checked(root, relative);
    return bytes.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}
export async function previewFile(root: string, relative: string) {
  if (/\.(png|jpg|jpeg|gif|webp)$/i.test(relative)) {
    const bytes = await readBytes(root, relative);
    const ext = path.extname(relative).slice(1).toLowerCase();
    return {
      kind: "image",
      data: `data:image/${ext === "jpg" ? "jpeg" : ext};base64,${bytes.toString("base64")}`,
      size: bytes.length,
    };
  }
  try {
    return { kind: "text", text: await readText(root, relative) };
  } catch (error) {
    if (
      (error as Error).message === "FILE_TYPE_DENIED" ||
      (error as Error).message === "BINARY_FILE"
    ) {
      const target = await checked(root, relative);
      return {
        kind: "metadata",
        size: (await lstat(target)).size,
        path: relative,
      };
    }
    throw error;
  }
}
export async function readText(root: string, relative: string) {
  const target = await checked(root, relative);
  if (
    !textExt.test(relative) &&
    !/^\.gitignore$/i.test(path.basename(relative))
  )
    throw Error("FILE_TYPE_DENIED");
  const handle = await open(target, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 1048576)
      throw Error("PATH_DENIED");
    const again = await lstat(target);
    if (
      again.isSymbolicLink() ||
      again.ino !== stat.ino ||
      again.dev !== stat.dev
    )
      throw Error("PATH_DENIED");
    const data = Buffer.alloc(Math.min(stat.size, 1048576) + 1);
    const { bytesRead } = await handle.read(data, 0, data.length, 0);
    if (bytesRead > 1048576) throw Error("FILE_TOO_LARGE");
    const result = data.subarray(0, bytesRead);
    if (result.includes(0)) throw Error("BINARY_FILE");
    const after = await handle.stat();
    if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs)
      throw Error("FILE_CHANGED");
    await checked(root, relative);
    return new TextDecoder("utf-8", { fatal: true }).decode(result);
  } finally {
    await handle.close();
  }
}
export async function listFiles(root: string, signal?: AbortSignal) {
  const files: { path: string; size: number; modified: number }[] = [];
  const excluded: { path: string; reason: string }[] = [];
  const directories: string[] = [];
  let scanned = 0;
  let truncated = false;
  const stack = [""];
  while (stack.length) {
    signal?.throwIfAborted();
    const dir = stack.pop()!;
    const directory = dir ? await checked(root, dir) : root;
    const entries = await opendir(directory, { bufferSize: 32 });
    for await (const entry of entries) {
      signal?.throwIfAborted();
      if (++scanned > 10000) {
        truncated = true;
        stack.length = 0;
        break;
      }
      if (denied.test(entry.name) || entry.isSymbolicLink()) {
        if (excluded.length < 1000)
          excluded.push({
            path: dir ? `${dir}/${entry.name}` : entry.name,
            reason: entry.isSymbolicLink()
              ? "linkedPath"
              : "secretsOrDependencies",
          });
        continue;
      }
      const relative = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        directories.push(relative);
        if (relative.split("/").length < 15) stack.push(relative);
        else truncated = true;
      } else if (entry.isFile()) {
        try {
          const target = await checked(root, relative);
          const stat = await lstat(target);
          if (stat.size <= 8 * 1048576)
            files.push({
              path: relative,
              size: stat.size,
              modified: stat.mtimeMs,
            });
          else if (excluded.length < 1000)
            excluded.push({ path: relative, reason: "fileAbove8MiB" });
        } catch {}
      }
    }
    signal?.throwIfAborted();
    if (scanned % 100 === 0) await new Promise((r) => setImmediate(r));
  }
  return {
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
    truncated,
    scanned,
    excluded,
    directories: directories.sort(),
  };
}
export async function searchText(
  root: string,
  query: string,
  signal: AbortSignal,
  onlyPaths?: Set<string>,
) {
  signal.throwIfAborted();
  if (!query.trim() || query.length > 200) throw Error("INVALID_SEARCH");
  const listing = onlyPaths
      ? { files: [...onlyPaths].map((path) => ({ path })), truncated: false }
      : await listFiles(root, signal),
    matches: { path: string; line: number; text: string }[] = [];
  let scannedFiles = 0,
    truncated = listing.truncated || listing.files.length > 100;
  for (const file of listing.files.slice(0, 100)) {
    signal.throwIfAborted();
    let body: string;
    try {
      body = await readText(root, file.path);
    } catch (error) {
      signal.throwIfAborted();
      if (onlyPaths) throw error;
      continue;
    }
    scannedFiles++;
    if (body.length > 32768) truncated = true;
    const lines = body.slice(0, 32768).split("\n");
    for (let i = 0; i < lines.length; i++)
      if (lines[i].toLocaleLowerCase().includes(query.toLocaleLowerCase())) {
        matches.push({
          path: file.path,
          line: i + 1,
          text: lines[i].slice(0, 240),
        });
        if (matches.length >= 50)
          return { matches, scannedFiles, truncated: true };
      }
  }
  signal.throwIfAborted();
  return { matches, scannedFiles, truncated };
}
