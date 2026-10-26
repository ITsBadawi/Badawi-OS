import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, lstat } from "node:fs/promises";
import path from "node:path";
export type GitTool =
  "status" | "log" | "diff" | "showText" | "branches" | "head"|'commitEvidence';
export function gitExecutable() {
  const choices =
    process.platform === "win32"
      ? [
          path.join(
            process.env.ProgramFiles || "C:/Program Files",
            "Git/cmd/git.exe",
          ),
          path.join(process.env.LOCALAPPDATA || "", "Programs/Git/cmd/git.exe"),
        ]
      : ["/usr/bin/git", "/bin/git"];
  const found = choices.find(existsSync);
  if (!found) throw Error("GIT_NOT_INSTALLED");
  return found;
}
export async function gitRead(
  root: string,
  tool: GitTool,
  revision = "HEAD",
  file = "",
  signal?: AbortSignal,
) {
  const gitDir = path.join(root, ".git");
  const st = await lstat(gitDir).catch(() => null);
  if (!st?.isDirectory() || st.isSymbolicLink())
    throw Error("GIT_SIMPLE_REPOSITORY_REQUIRED");
  const config = await readFile(path.join(gitDir, "config"), "utf8");
  if (
    /\[include|worktree\s*=|partialclone|promisor|fsmonitor\s*=|alternates|\[extensions/i.test(
      config,
    ) ||
    existsSync(path.join(gitDir, "objects/info/alternates"))
  )
    throw Error("GIT_UNSAFE_CONFIG");
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9_./~^{}@-]{0,150}$/.test(revision) ||
    revision.includes("..")
  )
    throw Error("GIT_INVALID_REVISION");
  if (
    file &&
    (file.startsWith("/") ||
      file.includes("..") ||
      file.includes(":") ||
      file.includes("\\") ||
      file
        .split("/")
        .some((p) => /^\.env|\.pem$|\.key$|^credentials|^secrets?/i.test(p)))
  )
    throw Error("PATH_DENIED");
  const commands: Record<GitTool, string[]> = {
    commitEvidence:['show','--no-patch','--no-show-signature','--format=%H%n%aI%n%s',revision,'--'],
    head: ["rev-parse", "--verify", "HEAD"],
    status: ["status", "--porcelain=v1", "--untracked-files=no"],
    log: ["log", "-50", "--format=%h %aI %s", "--no-show-signature"],
    diff: [
      "diff",
      "--no-ext-diff",
      "--no-textconv",
      "--no-renames",
      "--stat",
      "--",
    ],
    showText: ["show", "--no-ext-diff", "--no-textconv", `${revision}:${file}`],
    branches: ["branch", "--list", "--format=%(refname:short)"],
  };
  if (!(tool in commands)) throw Error("GIT_TOOL_DENIED");
  if (tool === "showText" && !file) throw Error("PATH_DENIED");
  const args = [
    "--no-pager",
    "--no-optional-locks",
    "--no-replace-objects",
    "-c",
    "core.fsmonitor=false",
    "-c",
    "core.untrackedCache=false",
    "-c",
    "core.hooksPath=NUL",
    "-c",
    "core.attributesFile=NUL",
    "-c",
    "diff.external=",
    "-c",
    "protocol.allow=never",
    ...commands[tool],
  ];
  const env: NodeJS.ProcessEnv = {
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    PATH: path.dirname(gitExecutable()),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_NO_LAZY_FETCH: "1",
    GIT_ATTR_NOSYSTEM: "1",
    GIT_LFS_SKIP_SMUDGE: "1",
    LANG: "C.UTF-8",
  };
  return new Promise<string>((resolve, reject) =>
    execFile(
      gitExecutable(),
      args,
      {
        cwd: root,
        env,
        shell: false,
        windowsHide: true,
        timeout: 10000,
        maxBuffer: 512 * 1024,
        encoding: "utf8",
        signal,
      },
      (err, stdout) =>
        err
          ? reject(Error(signal?.aborted ? "CANCELLED" : "GIT_READ_FAILED"))
          : resolve(stdout),
    ),
  );
}
