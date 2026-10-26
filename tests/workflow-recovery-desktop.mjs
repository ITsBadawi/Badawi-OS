import { _electron as electron } from "playwright-core";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const dir = await mkdtemp(path.join(tmpdir(), "badawi-workflow-recovery-")),
  checks = [],
  errors = [];
const env = {
  ...process.env,
  BADAWI_DATA_DIR: path.join(dir, "data"),
  BADAWI_BACKGROUND: "1",
};
delete env.ELECTRON_RUN_AS_NODE;
let app, page;
const command = async (c) => {
  const r = await page.evaluate((c) => window.badawi.command(c), c);
  if (!r.ok) throw Error(r.error);
  return r.data;
};
async function launch() {
  app = await electron.launch({
    ...(process.env.BADAWI_PACKAGED_EXE
      ? { executablePath: path.resolve(process.env.BADAWI_PACKAGED_EXE), args: [] }
      : { args: ["."] }),
    env,
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("button", { name: "الأتمتة", exact: true }).waitFor();
  await app.evaluate(() => {
    globalThis.__recoveryCalls = 0;
    globalThis.__recoveryOffline = true;
    globalThis.fetch = async (input, init) => {
      const u = new URL(String(input));
      if (u.origin !== "https://api.vercel.com" || init.method !== "GET")
        throw Error("Unexpected request");
      globalThis.__recoveryCalls++;
      if (globalThis.__recoveryOffline)
        throw Error("Controlled network failure");
      return Response.json(
        u.pathname === "/v7/deployments"
          ? {
              deployments: [
                {
                  uid: "dpl_recovery",
                  projectId: "prj_recovery",
                  created: 1792677600000,
                  target: "production",
                },
              ],
            }
          : {
              id: "dpl_recovery",
              projectId: "prj_recovery",
              readyState: "READY",
              target: "production",
              createdAt: 1792677600000,
            },
      );
    };
  });
}
try {
  await launch();
  await mkdir(path.join(dir, "project"));
  const p = await command({
    op: "workspace.add",
    path: path.join(dir, "project"),
    name: "Recovery fixture",
  });
  await command({
    op: "project.details",
    id: p.id,
    name: p.name,
    description: "",
    technologies: [],
    deployments: {
      vercel: { projectId: "prj_recovery", target: "production" },
    },
  });
  await command({
    op: "integration.save",
    integration: "vercel",
    token: "PRIVATE_RECOVERY_FIXTURE",
  });
  const job = await command({
    op: "job.save",
    name: "Native partial workflow",
    kind: "workflow",
    enabled: true,
    allowBackgroundIntegration: true,
    trigger: { type: "manual" },
    missedPolicy: "skip",
    steps: [
      {
        name: "Completed prefix",
        kind: "reminder",
        message: "Do not repeat this receipt",
      },
      {
        name: "Read deployment",
        kind: "integration",
        integration: "vercel",
        projectId: p.id,
      },
      {
        name: "Remaining notice",
        kind: "reminder",
        message: "Result: {{previous}}",
      },
    ],
  });
  let state = await command({ op: "snapshot" });
  await command({
    op: "engine.mode",
    mode: "Running",
    epoch: state.engine.epoch,
  });
  await page.getByRole("button", { name: "الأتمتة", exact: true }).click();
  await page
    .getByRole("button", { name: "تشغيل Native partial workflow", exact: true })
    .click();
  await page
    .getByRole("button", { name: "مراجعة استكمال التشغيل", exact: true })
    .waitFor();
  state = await command({ op: "snapshot" });
  const run = state.runs[0];
  assert.equal(run.status, "failed");
  assert.equal(run.steps[0].status, "succeeded");
  const receipt = run.steps[0].result.inboxId;
  assert.equal(await app.evaluate(() => globalThis.__recoveryCalls), 1);
  await page
    .getByRole("button", { name: "تشغيل Native partial workflow", exact: true })
    .click();
  let modal = page.getByRole("dialog");
  await modal
    .getByRole("heading", {
      name: "بدء الأتمتة من الخطوة الأولى؟",
      exact: true,
    })
    .waitFor();
  await modal.getByRole("button", { name: "رجوع", exact: true }).click();
  assert.equal(await app.evaluate(() => globalThis.__recoveryCalls), 1);
  checks.push(
    "Actual partial failure retains a proven first-step receipt; a full restart requires an explicit extra confirmation and cancellation performs no effects",
  );
  await page
    .getByRole("button", { name: "مراجعة استكمال التشغيل", exact: true })
    .click();
  modal = page.getByRole("dialog");
  await modal
    .getByRole("heading", { name: "خطوات سابقة لن تتكرر (1)", exact: true })
    .waitFor();
  await modal
    .getByRole("heading", { name: "الخطوات المتبقية (2)", exact: true })
    .waitFor();
  await modal.getByText(receipt, { exact: true }).waitFor();
  await modal.getByRole("button", { name: "إلغاء", exact: true }).click();
  assert.equal((await command({ op: "snapshot" })).runs[0].status, "failed");
  assert.equal(await app.evaluate(() => globalThis.__recoveryCalls), 1);
  checks.push(
    "Native review displays the exact historical receipt and remaining steps; preview and Cancel do not repeat a step or contact a service",
  );
  await app.close();
  app = null;
  await launch();
  state = await command({ op: "snapshot" });
  assert.equal(state.engine.mode, "Stop");
  assert.equal(state.runs[0].steps[0].proofHash, run.steps[0].proofHash);
  await page.getByRole("button", { name: "الأتمتة", exact: true }).click();
  await page
    .getByRole("button", { name: "مراجعة استكمال التشغيل", exact: true })
    .click();
  modal = page.getByRole("dialog");
  assert.equal(
    await modal
      .getByRole("button", { name: "استكمال الخطوات المتبقية", exact: true })
      .isDisabled(),
    true,
  );
  await modal.getByRole("button", { name: "إلغاء", exact: true }).click();
  await command({
    op: "engine.mode",
    mode: "Running",
    epoch: state.engine.epoch,
  });
  await app.evaluate(() => {
    globalThis.__recoveryOffline = false;
  });
  await page
    .getByRole("button", { name: "مراجعة استكمال التشغيل", exact: true })
    .click();
  modal = page.getByRole("dialog");
  await modal
    .getByRole("button", { name: "استكمال الخطوات المتبقية", exact: true })
    .click();
  await modal.waitFor({ state: "hidden" });
  state = await command({ op: "snapshot" });
  const done = state.runs.find((r) => r.id === run.id);
  assert.equal(done.status, "succeeded");
  assert.equal(done.steps.length, 3);
  assert.equal(done.steps[0].reused, true);
  assert.equal(done.steps[0].result.inboxId, receipt);
  assert.equal(done.recoveryHistory.length, 1);
  assert.equal(done.attempts.length, 2);
  assert.equal(
    state.inbox.filter((i) => i.title === "Completed prefix").length,
    1,
  );
  assert.equal(
    state.inbox.filter((i) => i.title === "Remaining notice").length,
    1,
  );
  assert.equal(await app.evaluate(() => globalThis.__recoveryCalls), 2);
  assert.ok(!JSON.stringify(state).includes("PRIVATE_RECOVERY_FIXTURE"));
  checks.push(
    "Real restart preserves bound proof while starting stopped; a fresh owner review resumes only remaining steps, retaining one prefix receipt and both actual attempts",
  );
  await page.setViewportSize({ width: 1120, height: 800 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  checks.push(
    "Compact native workflow view has no document-wide overflow or renderer errors; controlled transport never touches owner accounts",
  );
  await writeFile(
    "docs/validation/workflow-recovery-desktop.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        checks,
        errors,
        scope:
          "Actual Electron review/cancel/continuation UI, SQLite and protected credential restart, synthetic workflow with controlled Vercel reads; no owner cloud effects or live provider assertion",
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks, errors }));
} catch (error) {
  console.log(JSON.stringify({ checks, errors }));
  if (page)
    await page
      .screenshot({
        path: "docs/validation/workflow-recovery-failure.png",
        fullPage: true,
      })
      .catch(() => {});
  throw error;
} finally {
  if (app) await app.close();
  await rm(dir, { recursive: true, force: true });
}
