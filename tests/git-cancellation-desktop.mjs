import { _electron as electron } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const dir = await mkdtemp(path.join(tmpdir(), "badawi-git-cancellation-"));
const gitBinary = path.join(process.env.ProgramFiles || "C:/Program Files", "Git/cmd/git.exe");
const checks = [], errors = [];
let app, page;
const command = async (input) => {
  const response = await page.evaluate((value) => window.badawi.command(value), input);
  if (!response.ok) throw Error(response.error);
  return response.data;
};
const waitMainFlag = async (flag) => {
  for (let i = 0; i < 100; i++) {
    if (await app.evaluate((_, name) => !!globalThis[name], flag)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error(`TEST_PROCESS_DID_NOT_START:${flag}`);
};

try {
  const env = { ...process.env, BADAWI_DATA_DIR: path.join(dir, "data"), BADAWI_BACKGROUND: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: ["."], env });
  page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.getByRole("button", { name: "لوحة التحكم", exact: true }).waitFor();
  const workspace = await command({ op: "workspace.create", path: dir, inbox: false });
  await command({ op: "engine.mode", mode: "Running", epoch: (await command({ op: "snapshot" })).engine.epoch });
  await command({ op: "integration.save", integration: "github", token: "synthetic-test-token" });
  await app.evaluate(() => {
    globalThis.__remoteHead = "a".repeat(40);
    globalThis.__pushOutcome = "unchanged";
    globalThis.__readFailureAfterPush = false;
    globalThis.fetch = async (url) => {
      const target = String(url);
      if (!target.startsWith("https://api.github.com/repos/owner/repo")) throw Error("TEST_UNEXPECTED_ENDPOINT");
      if (globalThis.__readFailureAfterPush) throw Error("TEST_CONFIRMATION_NETWORK_LOST");
      if (target.includes("/compare/")) return Response.json({ message: "not found" }, { status: 404 });
      if (target.includes("/commits/")) return Response.json({ sha: globalThis.__remoteHead });
      return Response.json({ id: 1, private: true, archived: false, default_branch: "main", size: 1 });
    };
    const cp = process.getBuiltinModule("node:child_process"), original = cp.execFile;
    cp.execFile = function (binary, args, options, callback) {
      if (Array.isArray(args) && args.includes("clone") && args.includes("https://github.com/owner/repo.git")) {
        globalThis.__cloneStarted = true;
        return original.call(this, `${process.env.SystemRoot || "C:/Windows"}/System32/ping.exe`, ["-n", "60", "127.0.0.1"], options, callback);
      }
      if (Array.isArray(args) && args.includes("push") && args.includes("https://github.com/owner/repo.git")) {
        globalThis.__pushStarted = true;
        if (globalThis.__pushOutcome === "cancel")
          return original.call(this, `${process.env.SystemRoot || "C:/Windows"}/System32/ping.exe`, ["-n", "60", "127.0.0.1"], options, callback);
        return original.call(this, binary, ["--version"], options, () => {
          if (globalThis.__pushOutcome === "remote-advanced") globalThis.__remoteHead = globalThis.__localHead;
          if (globalThis.__pushOutcome === "read-fails") {
            globalThis.__remoteHead = globalThis.__localHead;
            globalThis.__readFailureAfterPush = true;
            callback(null, "", "");
            return;
          }
          callback(Error("TEST_NETWORK_RESPONSE_LOST"), "", "");
        });
      }
      return original.apply(this, arguments);
    };
  });

  const clonePreview = await command({ op: "project.clone.preview", workspaceId: workspace.id, name: "Cancelled clone", folder: "cancelled-clone", github: { owner: "owner", repo: "repo" } });
  const cloning = command({ op: "project.clone.apply", previewId: clonePreview.previewId }).then(() => null, (error) => error.message);
  await waitMainFlag("__cloneStarted");
  await command({ op: "engine.mode", mode: "Stop", epoch: (await command({ op: "snapshot" })).engine.epoch });
  assert.match(await cloning, /CANCELLED/);
  assert.deepEqual(await readdir(path.join(dir, "Projects")), []);
  assert.equal((await command({ op: "snapshot" })).projects.filter((p) => p.kind !== "workfiles").length, 0);
  checks.push("Stopping during an in-flight clone terminates the process, removes only its new destination and registers no project");

  await command({ op: "engine.mode", mode: "Running", epoch: (await command({ op: "snapshot" })).engine.epoch });
  const project = await command({ op: "project.create", workspaceId: workspace.id, name: "Push outcome test", folder: "push-outcome" });
  const git = (args) => execFileSync(gitBinary, args, { cwd: project.root, encoding: "utf8" }).trim();
  git(["init", "-b", "main"]);
  git(["config", "user.name", "Synthetic Test"]);
  git(["config", "user.email", "test@example.invalid"]);
  await writeFile(path.join(project.root, "proof.txt"), "before\n");
  git(["add", "proof.txt"]);
  git(["commit", "-m", "Initial"]);
  const remoteHead = git(["rev-parse", "HEAD"]);
  await app.evaluate((_, head) => { globalThis.__remoteHead = head; }, remoteHead);
  await writeFile(path.join(project.root, "proof.txt"), "after\n");
  git(["add", "proof.txt"]);
  git(["commit", "-m", "Selected synthetic change"]);
  const localHead = git(["rev-parse", "HEAD"]);
  await app.evaluate((_, head) => { globalThis.__localHead = head; }, localHead);
  await command({ op: "project.details", id: project.id, name: project.name, github: { owner: "owner", repo: "repo", branch: "main" } });

  let preview = await command({ op: "git.push.preview", projectId: project.id });
  await assert.rejects(command({ op: "git.push.apply", previewId: preview.previewId }), /GIT_PUSH_UNCONFIRMED/);
  assert.equal(await app.evaluate(() => globalThis.__remoteHead), remoteHead);
  assert.equal(git(["rev-parse", "HEAD"]), localHead);
  await assert.rejects(command({ op: "git.push.apply", previewId: preview.previewId }), /GIT_PREVIEW_STALE/);
  checks.push("A lost push response with unchanged remote stays unconfirmed and never retries its one-use approval");

  preview = await command({ op: "git.push.preview", projectId: project.id });
  await app.evaluate(() => { globalThis.__pushOutcome = "cancel"; globalThis.__pushStarted = false; });
  const pushing = command({ op: "git.push.apply", previewId: preview.previewId }).then(() => null, (error) => error.message);
  await waitMainFlag("__pushStarted");
  await command({ op: "engine.mode", mode: "Stop", epoch: (await command({ op: "snapshot" })).engine.epoch });
  assert.match(await pushing, /GIT_PUSH_UNCONFIRMED/);
  assert.equal(git(["rev-parse", "HEAD"]), localHead);
  checks.push("Stopping after Push starts reports uncertainty and preserves the local commit");

  await command({ op: "engine.mode", mode: "Running", epoch: (await command({ op: "snapshot" })).engine.epoch });
  await app.evaluate(() => { globalThis.__pushOutcome = "read-fails"; });
  preview = await command({ op: "git.push.preview", projectId: project.id });
  await assert.rejects(command({ op: "git.push.apply", previewId: preview.previewId }), /GIT_PUSH_UNCONFIRMED/);
  await app.evaluate((_, head) => { globalThis.__readFailureAfterPush = false; globalThis.__remoteHead = head; }, remoteHead);
  checks.push("A successful Git response without a confirming remote read remains unconfirmed");

  await app.evaluate(() => { globalThis.__pushOutcome = "remote-advanced"; });
  preview = await command({ op: "git.push.preview", projectId: project.id });
  const receipt = await command({ op: "git.push.apply", previewId: preview.previewId });
  assert.equal(receipt.head, localHead);
  assert.equal(await app.evaluate(() => globalThis.__remoteHead), localHead);
  checks.push("A lost push response is confirmed only when an independent remote read matches the exact local commit");
  assert.deepEqual(errors, []);
  await command({ op: "integration.disconnect", integration: "github" });
  await writeFile("docs/validation/git-cancellation-desktop.json", JSON.stringify({ date: new Date().toISOString(), checks, errors, liveGitHub: false }, null, 2));
  console.log(JSON.stringify({ checks, errors }));
} finally {
  if (app) await app.close();
  const target = path.resolve(dir), parent = path.resolve(tmpdir());
  if (path.dirname(target) !== parent) throw Error("TEST_CLEANUP_PATH_INVALID");
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
