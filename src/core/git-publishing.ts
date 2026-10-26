import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { gitExecutable } from "./git.ts";

export type ChangedFile = { path: string; state: string };
export type CommitPreview = {
  root: string;
  head: string | null;
  branch: string;
  message: string;
  selected: string[];
  changes: ChangedFile[];
  fingerprint: string;
  author: string;
  authorName: string;
  authorEmail: string;
  digests: [string, string][];
};

const nil = process.platform === "win32" ? "NUL" : "/dev/null";
const secretPart = /^(?:\.env(?:\..*)?|\.git|\.ssh|\.npmrc|\.pypirc|credentials?|secrets?|id_[a-z0-9_-]+|.*\.(?:pem|key|p12|pfx|kdbx))$/i;

async function repository(root: string) {
  const resolved = await realpath(root);
  const gitDir = path.join(resolved, ".git");
  const st = await lstat(gitDir).catch(() => null);
  if (!st?.isDirectory() || st.isSymbolicLink()) throw Error("GIT_SIMPLE_REPOSITORY_REQUIRED");
  const config = await readFile(path.join(gitDir, "config"), "utf8");
  if (config.length > 256 * 1024 || /\[\s*(?:include|filter|credential|url|http)|worktree\s*=|partialclone|promisor|fsmonitor\s*=|alternates|\[extensions/i.test(config) || existsSync(path.join(gitDir, "objects/info/alternates")))
    throw Error("GIT_UNSAFE_CONFIG");
  if (existsSync(path.join(gitDir, "info/attributes"))) throw Error("GIT_ATTRIBUTES_DENIED");
  return resolved;
}

async function run(root: string, args: string[], signal: AbortSignal, timeout = 15000, token?: string, identity?: { name: string; email: string }) {
  signal.throwIfAborted();
  const binary = gitExecutable();
  const env: NodeJS.ProcessEnv = {
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    PATH: path.dirname(binary),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: nil,
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_NO_LAZY_FETCH: "1",
    GIT_ATTR_NOSYSTEM: "1",
    GIT_LFS_SKIP_SMUDGE: "1",
    LANG: "C.UTF-8",
  };
  if (token) {
    env.GIT_CONFIG_COUNT = "1";
    env.GIT_CONFIG_KEY_0 = "http.https://github.com/.extraheader";
    env.GIT_CONFIG_VALUE_0 = `Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`;
  }
  if (identity) {
    env.GIT_AUTHOR_NAME = identity.name;
    env.GIT_AUTHOR_EMAIL = identity.email;
    env.GIT_COMMITTER_NAME = identity.name;
    env.GIT_COMMITTER_EMAIL = identity.email;
  }
  const fixed = ["--no-pager", "--no-optional-locks", "--no-replace-objects", "-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false", "-c", `core.hooksPath=${nil}`, "-c", `core.attributesFile=${nil}`, "-c", "core.autocrlf=false", "-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", "-c", "credential.helper=", "-c", "protocol.allow=never", ...args];
  return new Promise<string>((resolve, reject) => execFile(binary, fixed, {
    cwd: root, env, shell: false, windowsHide: true, encoding: "utf8", maxBuffer: 1024 * 1024, timeout, signal,
  }, (error, stdout) => error ? reject(Error(signal.aborted ? "CANCELLED" : "GIT_PUBLISH_FAILED")) : resolve(stdout)));
}

function parseStatus(raw: string): ChangedFile[] {
  const parts = raw.split("\0");
  if (parts.at(-1) !== "") throw Error("GIT_STATUS_INVALID");
  const rows: ChangedFile[] = [];
  for (const part of parts.slice(0, -1)) {
    if (part.length < 4 || part[2] !== " ") throw Error("GIT_STATUS_INVALID");
    const state = part.slice(0, 2), name = part.slice(3);
    if (state[0] !== " " && state !== "??") throw Error("GIT_INDEX_NOT_CLEAN");
    if (!name || name.includes("\0") || /[\x00-\x1f]/.test(name)) throw Error("GIT_PATH_DENIED");
    rows.push({ path: name, state });
  }
  if (rows.length > 1000) throw Error("GIT_CHANGE_LIMIT");
  return rows.sort((a, b) => a.path.localeCompare(b.path));
}

function allowedFile(name: string) {
  const parts = name.split("/");
  if (!name || path.isAbsolute(name) || parts.some(p => !p || p === "." || p === ".." || secretPart.test(p)) || name.includes("\\") || name.includes(":"))
    throw Error("GIT_PATH_DENIED");
}

async function state(root: string, signal: AbortSignal) {
  const [head, branch, status, authorName, authorEmail] = await Promise.all([
    run(root, ["rev-parse", "--verify", "HEAD"], signal).catch(() => ""),
    run(root, ["symbolic-ref", "--quiet", "--short", "HEAD"], signal),
    run(root, ["-c", "status.renames=false", "status", "--porcelain=v1", "-z", "--untracked-files=all"], signal),
    run(root, ["config", "--local", "--get", "user.name"], signal).catch(() => ""),
    run(root, ["config", "--local", "--get", "user.email"], signal).catch(() => ""),
  ]);
  const cleanBranch = branch.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_./-]{0,150}$/.test(cleanBranch) || cleanBranch.includes("..")) throw Error("GIT_BRANCH_INVALID");
  return { head: head.trim() || null, branch: cleanBranch, changes: parseStatus(status), authorName: authorName.trim(), authorEmail: authorEmail.trim() };
}

async function fileDigest(root: string, name: string, state: string) {
  allowedFile(name);
  const parts = name.split("/");
  for (let i = 1; i < parts.length; i++) {
    const ancestor = await lstat(path.join(root, ...parts.slice(0, i)));
    if (!ancestor.isDirectory() || ancestor.isSymbolicLink()) throw Error("GIT_PATH_DENIED");
    if (existsSync(path.join(root, ...parts.slice(0, i), ".gitattributes"))) throw Error("GIT_ATTRIBUTES_DENIED");
  }
  if (existsSync(path.join(root, ".gitattributes"))) throw Error("GIT_ATTRIBUTES_DENIED");
  const target = path.join(root, ...parts);
  const st = await lstat(target).catch(() => null);
  if (!st) {
    if (state !== " D") throw Error("GIT_CHANGE_STALE");
    return "deleted";
  }
  if (!st.isFile() || st.isSymbolicLink() || st.size > 10 * 1024 * 1024 || st.nlink > 1) throw Error("GIT_FILE_DENIED");
  const data = await readFile(target);
  if (data.length > 10 * 1024 * 1024) throw Error("GIT_FILE_DENIED");
  return createHash("sha256").update(data).digest("hex");
}

export async function listChanges(root: string, signal: AbortSignal) {
  const safeRoot = await repository(root);
  const current = await state(safeRoot, signal);
  const changes = await Promise.all(current.changes.map(async row => {
    const stat = await lstat(path.join(safeRoot, row.path)).catch(() => null);
    let blocked = false;
    try { allowedFile(row.path); } catch { blocked = true; }
    if (stat && (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1 || stat.size > 10 * 1024 * 1024)) blocked = true;
    return {
      ...row,
      modifiedAt: stat?.mtime.toISOString() || null,
      modifiedMs: stat?.mtimeMs || null,
      size: stat?.size || null,
      blocked,
    };
  }));
  changes.sort((a, b) => (b.modifiedAt || "").localeCompare(a.modifiedAt || "") || a.path.localeCompare(b.path));
  const statusHash = createHash("sha256").update(JSON.stringify({ head: current.head, branch: current.branch, changes })).digest("hex");
  return { root: safeRoot, head: current.head, branch: current.branch, statusHash, authorName: current.authorName, authorEmail: current.authorEmail, changes };
}

export async function inspectCommit(root: string, selected: string[], message: string, signal: AbortSignal, identity?: { name: string; email: string }): Promise<CommitPreview> {
  const safeRoot = await repository(root);
  if (!message.trim() || message.length > 160 || /[\r\n\x00-\x1f]/.test(message)) throw Error("GIT_MESSAGE_INVALID");
  if (!selected.length || selected.length > 100 || new Set(selected).size !== selected.length) throw Error("GIT_SELECTION_INVALID");
  const current = await state(safeRoot, signal);
  const authorName = identity?.name.trim() || current.authorName;
  const authorEmail = identity?.email.trim() || current.authorEmail;
  if (!authorName || authorName.length > 100 || /[\r\n\x00-\x1f<>]/.test(authorName) || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(authorEmail) || authorEmail.length > 160)
    throw Error("GIT_AUTHOR_REQUIRED");
  const known = new Map(current.changes.map(row => [row.path, row.state]));
  let total = 0;
  const digests: [string, string][] = [];
  for (const name of selected) {
    const status = known.get(name);
    if (!status) throw Error("GIT_SELECTION_INVALID");
    const digest = await fileDigest(safeRoot, name, status);
    digests.push([name, digest]);
    const st = await lstat(path.join(safeRoot, name)).catch(() => null);
    total += st?.size || 0;
    if (total > 40 * 1024 * 1024) throw Error("GIT_FILE_DENIED");
  }
  const sorted = [...selected].sort();
  const fingerprint = createHash("sha256").update(JSON.stringify({ head: current.head, branch: current.branch, changes: current.changes, digests: digests.sort((a, b) => a[0].localeCompare(b[0])) })).digest("hex");
  return { root: safeRoot, head: current.head, branch: current.branch, message: message.trim(), selected: sorted, changes: current.changes, fingerprint, author: `${authorName} <${authorEmail}>`, authorName, authorEmail, digests };
}

export async function applyCommit(root: string, preview: CommitPreview, signal: AbortSignal) {
  const fresh = await inspectCommit(root, preview.selected, preview.message, signal, { name: preview.authorName, email: preview.authorEmail });
  if (JSON.stringify(fresh) !== JSON.stringify(preview)) throw Error("GIT_PREVIEW_STALE");
  await run(fresh.root, ["--literal-pathspecs", "add", "--all", "--", ...fresh.selected], signal);
  const staged = (await run(fresh.root, ["diff", "--cached", "--name-only", "-z", "--no-renames", "--"], signal)).split("\0").filter(Boolean).sort();
  if (JSON.stringify(staged) !== JSON.stringify(fresh.selected)) throw Error("GIT_STAGE_MISMATCH");
  const afterStage = await Promise.all(fresh.selected.map(name => fileDigest(fresh.root, name, fresh.changes.find(row => row.path === name)!.state)));
  const beforeStage = fresh.selected.map(name => preview.digests.find(row => row[0] === name)![1]);
  if (JSON.stringify(afterStage) !== JSON.stringify(beforeStage)) throw Error("GIT_PREVIEW_STALE");
  const head = (await run(fresh.root, ["rev-parse", "--verify", "HEAD"], signal).catch(() => "")).trim() || null;
  if (head !== fresh.head) throw Error("GIT_PREVIEW_STALE");
  await run(fresh.root, ["commit", "--no-verify", "--no-gpg-sign", "-m", fresh.message, "--"], signal, 30000, undefined, { name: fresh.authorName, email: fresh.authorEmail });
  const committed = (await run(fresh.root, ["rev-parse", "--verify", "HEAD"], signal)).trim();
  if (committed === fresh.head) throw Error("GIT_COMMIT_UNCONFIRMED");
  return { head: committed, previousHead: fresh.head, branch: fresh.branch, selected: fresh.selected };
}

export async function inspectPush(root: string, branch: string, remoteHead: string | null, signal: AbortSignal) {
  const safeRoot = await repository(root);
  const current = await state(safeRoot, signal);
  if (current.branch !== branch || !current.head || (remoteHead !== null && !/^[a-f0-9]{40,64}$/.test(remoteHead)) || current.head === remoteHead)
    throw Error("GIT_PUSH_TARGET_INVALID");
  if (remoteHead)
    await run(safeRoot, ["merge-base", "--is-ancestor", remoteHead, current.head], signal).catch(() => {
      throw Error("GIT_PUSH_NOT_FAST_FORWARD");
    });
  return { root: safeRoot, branch, localHead: current.head, remoteHead, dirty: current.changes.length > 0, statusHash: createHash("sha256").update(JSON.stringify(current.changes)).digest("hex") };
}

export async function pushToGitHub(root: string, branch: string, localHead: string, remoteHead: string | null, statusHash: string, owner: string, repo: string, token: string, signal: AbortSignal) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(owner) || !/^[a-zA-Z0-9_.-]{1,100}$/.test(repo) || !token)
    throw Error("GIT_PUSH_TARGET_INVALID");
  const fresh = await inspectPush(root, branch, remoteHead, signal);
  if (fresh.localHead !== localHead || fresh.statusHash !== statusHash) throw Error("GIT_PREVIEW_STALE");
  signal.throwIfAborted();
  try {
    await run(fresh.root, ["-c", "protocol.https.allow=always", "-c", "http.followRedirects=false", "-c", "http.sslVerify=true", "push", "--porcelain", "--no-follow-tags", "--no-verify", `https://github.com/${owner}/${repo}.git`, `HEAD:refs/heads/${branch}`], signal, 120000, token);
  } catch (error) {
    // Once Git has started, an abort cannot prove whether GitHub accepted the
    // commit before the connection closed. Keep that ambiguity visible.
    if (signal.aborted) throw Error("GIT_PUSH_UNCONFIRMED");
    throw error;
  }
  return { localHead, branch, owner, repo };
}
