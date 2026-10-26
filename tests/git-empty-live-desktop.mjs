import { _electron as electron } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const owner = "itsbadawiit", repo = "badawi-os-empty-parity-test-20261024";
const dir = await mkdtemp(path.join(tmpdir(), "badawi-live-empty-git-"));
let token = execFileSync("gh", ["auth", "token", "--user", owner], { encoding: "utf8", windowsHide: true }).trim();
if (!token) throw Error("GITHUB_TEST_CREDENTIAL_MISSING");
let app, page, receipt = null;
const checks = [], errors = [];
const command = async (input) => {
  const response = await page.evaluate((value) => window.badawi.command(value), input);
  if (!response.ok) throw Error(response.error);
  return response.data;
};
try {
  const env = { ...process.env, BADAWI_DATA_DIR: path.join(dir, "data"), BADAWI_BACKGROUND: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: ["."], env });
  page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.getByRole("button", { name: "لوحة التحكم", exact: true }).waitFor();
  const workspace = await command({ op: "workspace.create", path: dir, inbox: false });
  await command({ op: "engine.mode", mode: "Running", epoch: (await command({ op: "snapshot" })).engine.epoch });
  await command({ op: "integration.save", integration: "github", token });
  token = "";
  const clonePreview = await command({ op: "project.clone.preview", workspaceId: workspace.id, name: "Empty synthetic GitHub validation", folder: "empty-synthetic-github", github: { owner, repo } });
  assert.equal(clonePreview.remoteHead, null);
  const project = await command({ op: "project.clone.apply", previewId: clonePreview.previewId });
  assert.equal(project.cloneReceipt.head, null);
  checks.push("Actual empty private GitHub repository was previewed and cloned without inventing a HEAD commit");
  await writeFile(path.join(project.root, "first-proof.txt"), `Badawi OS first-commit acceptance ${new Date().toISOString()}\n`);
  await writeFile(path.join(project.root, ".env.local"), "synthetic-secret-stays-local\n");
  const preview = await command({ op: "git.commit.preview", projectId: project.id, paths: ["first-proof.txt"], message: "Create first reviewed commit", authorName: "Badawi OS Test", authorEmail: "badawi-test@example.invalid" });
  assert.equal(preview.head, null);
  const committed = await command({ op: "git.commit.apply", previewId: preview.previewId });
  assert.equal(committed.previousHead, null);
  checks.push("First local Commit contains only the selected synthetic file");
  const pushPreview = await command({ op: "git.push.preview", projectId: project.id });
  assert.equal(pushPreview.remoteHead, null);
  assert.equal(pushPreview.localHead, committed.head);
  const pushed = await command({ op: "git.push.apply", previewId: pushPreview.previewId });
  assert.equal(pushed.head, committed.head);
  const checked = await command({ op: "github.check", projectId: project.id });
  assert.equal(checked.remoteHead, committed.head);
  assert.equal(checked.comparison.state, "identical");
  checks.push("First GitHub Push created the branch and was verified against its immutable remote commit");
  assert.deepEqual(errors, []);
  await command({ op: "integration.disconnect", integration: "github" });
  receipt = { date: new Date().toISOString(), repository: `https://github.com/${owner}/${repo}`, private: true, checks, localHead: committed.head, remoteHead: checked.remoteHead, errors };
} finally {
  token = "";
  if (app) await app.close();
  const target = path.resolve(dir), parent = path.resolve(tmpdir());
  if (path.dirname(target) !== parent) throw Error("TEST_CLEANUP_PATH_INVALID");
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
if (receipt) {
  await writeFile("docs/validation/git-empty-live-2026-10-24.json", JSON.stringify({ ...receipt, temporaryProfileRemoved: true }, null, 2));
  console.log(JSON.stringify(receipt));
}
