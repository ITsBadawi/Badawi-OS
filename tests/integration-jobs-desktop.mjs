import { _electron as electron } from "playwright-core";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const dir = await mkdtemp(path.join(tmpdir(), "badawi-integration-jobs-")),
  checks = [],
  errors = [];
const env = { ...process.env, BADAWI_DATA_DIR: dir, BADAWI_BACKGROUND: "1" };
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
  await page.getByRole("button", { name: "المهام", exact: true }).waitFor();
  await app.evaluate(() => {
    globalThis.__monitorCalls = 0;
    globalThis.fetch = async (input, init) => {
      const u = new URL(String(input));
      if (u.origin !== "https://api.vercel.com" || init.method !== "GET")
        throw Error("Unexpected integration request");
      globalThis.__monitorCalls++;
      return Response.json(
        u.pathname === "/v7/deployments"
          ? {
              deployments: [
                {
                  uid: "dpl_fixture",
                  projectId: "prj_fixture",
                  created: 1792677600000,
                  target: "production",
                },
              ],
            }
          : {
              id: "dpl_fixture",
              projectId: "prj_fixture",
              readyState: "ERROR",
              target: "production",
              createdAt: 1792677600000,
              private: "NEVER_RETURN",
            },
      );
    };
  });
}
try {
  await launch();
  const p = await command({
    op: "workspace.add",
    path: dir,
    name: "Native monitored project",
  });
  await command({
    op: "project.details",
    id: p.id,
    name: p.name,
    description: "",
    technologies: [],
    deployments: { vercel: { projectId: "prj_fixture", target: "production" } },
  });
  await command({
    op: "integration.save",
    integration: "vercel",
    token: "NATIVE_MONITOR_PRIVATE_FIXTURE",
  });
  await command({
    op: "task.save",
    title: "Synthetic overdue monitor trigger",
    done: false,
    dueAt: "2020-01-01T00:00:00Z",
  });
  await page.getByRole("button", { name: "الأتمتة", exact: true }).click();
  await page.getByRole("button", { name: "أتمتة جديدة", exact: true }).click();
  const modal = page.getByRole("dialog").first();
  await modal
    .getByLabel("اسم الأتمتة", { exact: true })
    .fill("Native deployment monitoring");
  await modal
    .getByLabel("نوع المهمة", { exact: true })
    .selectOption("integration");
  await modal.getByLabel("خدمة الفحص", { exact: true }).selectOption("vercel");
  await modal.getByLabel("مشروع الفحص", { exact: true }).selectOption(p.id);
  await modal
    .getByText("prj_fixture · personal · production", { exact: true })
    .waitFor();
  await modal.getByLabel("التوقيت", { exact: true }).selectOption("condition");
  await modal
    .getByLabel("نوع الشرط", { exact: true })
    .selectOption("tasks.overdue");
  await modal.getByLabel("تفعيل الجدولة بعد الحفظ", { exact: true }).check();
  await modal.getByRole("button", { name: "حفظ الأتمتة", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "راجع ربط المشروع والحساب" })
    .waitFor();
  assert.equal((await command({ op: "snapshot" })).jobs.length, 0);
  assert.equal(await app.evaluate(() => globalThis.__monitorCalls), 0);
  checks.push(
    "Native owner editor shows exact project target; enabling without independent integration consent performs no requests and stores no rule",
  );
  await modal
    .getByLabel(
      "أوافق على فحص الخدمات والمشاريع المحددة عند كل تشغيل، بالحساب الحالي وللقراءة فقط.",
      { exact: true },
    )
    .check();
  await modal.getByRole("button", { name: "حفظ الأتمتة", exact: true }).click();
  await modal.waitFor({ state: "hidden" });
  let state = await command({ op: "snapshot" }),
    job = state.jobs[0];
  assert.equal(state.engine.mode, "Stop");
  assert.equal(state.runs.length, 0);
  await command({
    op: "engine.mode",
    mode: "Running",
    epoch: state.engine.epoch,
  });
  const deadline = Date.now() + 35000;
  while (Date.now() < deadline) {
    state = await command({ op: "snapshot" });
    if (state.runs.some((r) => r.jobId === job.id && r.status === "succeeded"))
      break;
    await page.waitForTimeout(500);
  }
  const run = state.runs.find(
    (r) => r.jobId === job.id && r.status === "succeeded",
  );
  assert.ok(run, "actual timer-driven monitor must complete");
  assert.equal(run.result.inspection.status, "failed");
  assert.equal(run.result.inspection.state, "ERROR");
  assert.equal(await app.evaluate(() => globalThis.__monitorCalls), 2);
  assert.equal(
    state.inbox.filter((i) => i.evidence?.type === "integration").length,
    1,
  );
  assert.ok(!JSON.stringify(state).includes("NATIVE_MONITOR_PRIVATE_FIXTURE"));
  assert.ok(!JSON.stringify(state).includes("NEVER_RETURN"));
  await page.getByText("حالة فشل مرصودة", { exact: false }).waitFor();
  checks.push(
    "Real Electron timer executes only bounded GET reads; failed deployment health remains explicit while the inspection run completes with a durable timestamped receipt",
  );
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive());
  await page.screenshot({
    path: "docs/validation/integration-jobs-desktop.png",
    fullPage: true,
  });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide());
  await app.close();
  app = null;
  await launch();
  state = await command({ op: "snapshot" });
  assert.equal(state.jobs[0].grant.hash, job.grant.hash);
  await command({
    op: "engine.mode",
    mode: "Running",
    epoch: state.engine.epoch,
  });
  await page.waitForTimeout(17500);
  state = await command({ op: "snapshot" });
  assert.equal(state.runs.filter((r) => r.jobId === job.id).length, 1);
  assert.equal(await app.evaluate(() => globalThis.__monitorCalls), 0);
  checks.push(
    "Windows-protected credential, exact grant, source receipt and condition latch survive restart without replaying the still-true monitor",
  );
  await command({
    op: "project.details",
    id: p.id,
    name: p.name,
    description: "",
    technologies: [],
    deployments: { vercel: { projectId: "prj_other", target: "production" } },
  });
  state = await command({ op: "snapshot" });
  assert.equal(state.jobs[0].enabled, false);
  assert.equal(state.jobs[0].grant, null);
  await command({ op: "job.run", id: job.id });
  state = await command({ op: "snapshot" });
  assert.equal(state.runs[0].status, "blocked");
  assert.equal(await app.evaluate(() => globalThis.__monitorCalls), 0);
  assert.equal(
    state.inbox.filter((i) => i.evidence?.type === "integration").length,
    1,
  );
  checks.push(
    "Changing the linked deployment revokes the grant; manual execution is blocked before any request or new inspection",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/validation/integration-jobs-desktop.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        checks,
        errors,
        scope:
          "Real Electron UI/timers/SQLite/Windows credential store; synthetic isolated profile and controlled Vercel transport. No owner account or live service acceptance claimed.",
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks, errors }));
} finally {
  if (app) await app.close();
  await rm(dir, { recursive: true, force: true });
}
