import { _electron as electron } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const owner = "itsbadawiit", repo = "badawi-os-parity-test-20261023";
const sha = "5a818f932cc73838875b9b1e09b75f5cf819fda5";
const workflow = "Badawi OS parity check";
const dir = await mkdtemp(path.join(tmpdir(), "badawi-ci-live-"));
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
  const project = await command({ op: "project.create", workspaceId: workspace.id, name: "Synthetic CI acceptance", folder: "synthetic-ci" });
  await command({ op: "project.details", id: project.id, name: project.name, github: { owner, repo, branch: "main" } });
  const task = await command({ op: "task.save", title: "Verify synthetic GitHub CI", done: true, status: "done", projectId: project.id, evidenceCommit: sha, acceptanceCriteria: [{ id: "ci-proof", text: "Synthetic workflow succeeded for the exact commit", source: "ci", target: workflow }] });
  let verification = await command({ op: "task.verify", id: task.id });
  assert.equal(verification.state, "needsReview");
  assert.equal(verification.evidence[0].status, "verified");
  assert.equal(verification.evidence[0].provider, "GitHub Actions");
  assert.match(verification.evidence[0].reference, /\/actions\/runs\/40071870339$/);
  assert.equal(verification.evidence[0].ownerAccepted, false);
  checks.push("Badawi OS read the real private GitHub Actions run for the exact synthetic commit, while withholding owner acceptance");

  await command({ op: "task.criteria.review", id: task.id, criterionId: "ci-proof", accepted: true });
  verification = await command({ op: "task.verify", id: task.id });
  assert.equal(verification.state, "verified");
  assert.equal(verification.evidence[0].status, "verified");
  checks.push("Explicit owner criterion review plus fresh live CI evidence marked only the synthetic task verified");

  await app.close();
  app = null;
  app = await electron.launch({ args: ["."], env });
  page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.getByRole("button", { name: "لوحة التحكم", exact: true }).waitFor();
  assert.equal((await command({ op: "snapshot" })).engine.mode, "Stop");
  await command({ op: "engine.mode", mode: "Running", epoch: (await command({ op: "snapshot" })).engine.epoch });
  verification = await command({ op: "task.verify", id: task.id });
  assert.equal(verification.state, "verified");
  assert.equal(verification.evidence[0].provider, "GitHub Actions");
  checks.push("Restart restored the protected GitHub connection but kept the engine stopped until manually resumed");

  await command({ op: "integration.disconnect", integration: "github" });
  verification = await command({ op: "task.verify", id: task.id });
  assert.equal(verification.state, "unverified");
  assert.equal(verification.evidence[0].status, "unverified");
  checks.push("Disconnecting the private account prevented stale CI evidence from being presented as a fresh success");
  assert.deepEqual(errors, []);
  receipt = { date: new Date().toISOString(), repository: `https://github.com/${owner}/${repo}`, workflowRun: "https://github.com/itsbadawiit/badawi-os-parity-test-20261023/actions/runs/40071870339", commit: sha, checks, errors };
} finally {
  token = "";
  if (app) await app.close();
  const target = path.resolve(dir), parent = path.resolve(tmpdir());
  if (path.dirname(target) !== parent) throw Error("TEST_CLEANUP_PATH_INVALID");
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
if (receipt) {
  await writeFile("docs/validation/ci-live-2026-10-24.json", JSON.stringify({ ...receipt, temporaryProfileRemoved: true }, null, 2));
  console.log(JSON.stringify(receipt));
}
