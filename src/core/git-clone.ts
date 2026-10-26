import { execFile } from "node:child_process";
import { lstat, rm } from "node:fs/promises";
import path from "node:path";
import { gitExecutable, gitRead } from "./git.ts";
import { createEmptyProject } from "./projects.ts";
import { canonicalRoot } from "./workspace.ts";
import type { GitHubLink } from "./github.ts";
async function cloneProcess(
  destination: string,
  link: GitHubLink,
  hasHead: boolean,
  token: string | undefined,
  signal: AbortSignal,
) {
  const binary = gitExecutable(),
    nil = process.platform === "win32" ? "NUL" : "/dev/null";
  const env: NodeJS.ProcessEnv = {
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    PATH: path.dirname(binary),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: nil,
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "Never",
    GIT_LFS_SKIP_SMUDGE: "1",
    GIT_ATTR_NOSYSTEM: "1",
    GIT_CEILING_DIRECTORIES: destination,
    LANG: "C.UTF-8",
  };
  if (token) {
    env.GIT_CONFIG_COUNT = "1";
    env.GIT_CONFIG_KEY_0 = "http.https://github.com/.extraheader";
    env.GIT_CONFIG_VALUE_0 = `Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`;
  }
  const args = [
    "--no-pager",
    "-c",
    `core.hooksPath=${nil}`,
    "-c",
    "core.symlinks=false",
    "-c",
    "init.templateDir=",
    "-c",
    "credential.helper=",
    "-c",
    "http.followRedirects=false",
    "-c",
    "http.sslVerify=true",
    "-c",
    "http.proxy=",
    "-c",
    "protocol.allow=never",
    "-c",
    "protocol.https.allow=always",
    "clone",
    "--depth",
    "1",
    "--single-branch",
    "--no-tags",
    "--no-recurse-submodules",
    ...(hasHead ? ["--branch", link.branch!] : []),
    "--",
    `https://github.com/${link.owner}/${link.repo}.git`,
    ".",
  ];
  await new Promise<void>((resolve, reject) => {
    let timedOut = false,
      finished = false;
    const child = execFile(
      binary,
      args,
      {
        cwd: destination,
        env,
        shell: false,
        windowsHide: true,
        maxBuffer: 256 * 1024,
        encoding: "utf8",
      },
      (error) => {
        finished = true;
        clearTimeout(timer);
        signal.removeEventListener("abort", stop);
        if (signal.aborted) reject(Error("CANCELLED"));
        else if (timedOut) reject(Error("CLONE_TIMEOUT"));
        else if (error) reject(Error("GIT_CLONE_FAILED"));
        else resolve();
      },
    );
    const stop = () => {
      if (finished || !child.pid) return;
      if (process.platform === "win32")
        execFile(
          path.join(
            process.env.SystemRoot || "C:/Windows",
            "System32/taskkill.exe",
          ),
          ["/PID", String(child.pid), "/T", "/F"],
          { windowsHide: true, shell: false, timeout: 5000, maxBuffer: 16384 },
          () => {
            if (!finished) child.kill();
          },
        );
      else child.kill("SIGTERM");
    };
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, 120000);
    signal.addEventListener("abort", stop, { once: true });
    if (signal.aborted) stop();
  });
}
export async function cloneGitHub(
  projectsRoot: string,
  folder: string,
  link: GitHubLink,
  expectedHead: string | null,
  token: string | undefined,
  signal: AbortSignal,
) {
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(link.owner) ||
    !/^[a-zA-Z0-9_.-]{1,100}$/.test(link.repo) ||
    !link.branch ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_./-]{0,150}$/.test(link.branch) ||
    link.branch.includes("..") ||
    (expectedHead !== null && !/^[a-f0-9]{40,64}$/.test(expectedHead))
  )
    throw Error("GITHUB_TARGET_INVALID");
  signal.throwIfAborted();
  const root = await canonicalRoot(projectsRoot),
    destination = await createEmptyProject(root, folder, signal);
  try {
    await cloneProcess(destination, link, !!expectedHead, token, signal);
    signal.throwIfAborted();
    const head = expectedHead
      ? (await gitRead(destination, "head", undefined, undefined, signal)).trim()
      : (await gitRead(destination, "head", undefined, undefined, signal).catch(() => "")).trim() || null;
    if (head !== expectedHead) throw Error("CLONE_REMOTE_CHANGED");
    if (
      (
        await gitRead(destination, "status", undefined, undefined, signal)
      ).trim()
    )
      throw Error("CLONE_CHECKOUT_CHANGED");
    return {
      root: destination,
      head,
      clonedAt: new Date().toISOString(),
      shallow: true,
    };
  } catch (error) {
    // This directory was exclusively created above. Verify its resolved absolute
    // parent and reject links before recursively removing only this failed clone.
    const target = path.resolve(destination),
      parent = path.resolve(root),
      stat = await lstat(target).catch(() => null);
    if (
      path.dirname(target) !== parent ||
      !stat?.isDirectory() ||
      stat.isSymbolicLink()
    )
      throw Error("CLONE_CLEANUP_REQUIRED");
    await rm(target, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 200,
    }).catch(() => {
      throw Error("CLONE_CLEANUP_REQUIRED");
    });
    throw error;
  }
}
