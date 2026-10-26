import { _electron as electron } from "playwright-core";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const dir = await mkdtemp(path.join(tmpdir(), "badawi-retry-")),
  checks = [],
  errors = [];
const labels = JSON.parse(
  await readFile("src/locales/english.data.json", "utf8"),
);
const en = (s) => labels[s] || s;
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
async function launch(language) {
  app = await electron.launch({ args: ["."], env });
  page = await app.firstWindow();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page
    .getByRole("button", {
      name: language === "en" ? "Dashboard" : "لوحة التحكم",
      exact: true,
    })
    .waitFor();
  await app.evaluate(() => {
    globalThis.__retryCalls = 0;
    globalThis.__retryMode = "fail";
    globalThis.fetch = async (input, init) => {
      const u = new URL(String(input));
      if (u.origin !== "https://api.vercel.com" || init.method !== "GET")
        throw Error("Unexpected request");
      globalThis.__retryCalls++;
      if (globalThis.__retryMode === "fail")
        throw Error("Synthetic offline state");
      return Response.json(
        u.pathname === "/v7/deployments"
          ? {
              deployments: [
                {
                  uid: "dpl_retry",
                  projectId: "prj_retry",
                  created: 1792677600000,
                  target: "production",
                },
              ],
            }
          : {
              id: "dpl_retry",
              projectId: "prj_retry",
              readyState: "READY",
              target: "production",
              createdAt: 1792677600000,
            },
      );
    };
  });
}
async function until(test, timeout = 40000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const state = await command({ op: "snapshot" });
    if (test(state)) return state;
    await page.waitForTimeout(400);
  }
  throw Error("Actual retry state did not arrive before the deadline");
}
try {
  await launch("ar");
  await command({ op: "language.save", language: "en" });
  await page.getByRole("button", { name: "Automation", exact: true }).waitFor();
  await mkdir(path.join(dir, "project"));
  const p = await command({
    op: "workspace.add",
    path: path.join(dir, "project"),
    name: "Retry fixture",
  });
  await command({
    op: "project.details",
    id: p.id,
    name: p.name,
    description: "",
    technologies: [],
    deployments: { vercel: { projectId: "prj_retry", target: "production" } },
  });
  await command({
    op: "integration.save",
    integration: "vercel",
    token: "PRIVATE_NATIVE_RETRY_FIXTURE",
  });
  await page.getByRole("button", { name: "Automation", exact: true }).click();
  await page
    .getByRole("button", { name: en("أتمتة جديدة"), exact: true })
    .click();
  const modal = page.getByRole("dialog");
  await modal
    .getByLabel(en("اسم الأتمتة"), { exact: true })
    .fill("Native retry");
  await modal
    .getByLabel(en("نوع المهمة"), { exact: true })
    .selectOption("integration");
  await modal
    .getByLabel(en("خدمة الفحص"), { exact: true })
    .selectOption("vercel");
  await modal.getByLabel(en("مشروع الفحص"), { exact: true }).selectOption(p.id);
  const retry = modal.getByLabel("Retry connection checks automatically", {
    exact: true,
  });
  assert.equal(await retry.isChecked(), false);
  await retry.check();
  await modal.getByLabel("Maximum attempts", { exact: true }).selectOption("2");
  await modal
    .getByLabel("Delay between attempts in seconds", { exact: true })
    .fill("15");
  await modal.getByLabel(en("التوقيت"), { exact: true }).selectOption("manual");
  await modal
    .getByLabel(
      en(
        "أوافق على فحص الخدمات والمشاريع المحددة عند كل تشغيل، بالحساب الحالي وللقراءة فقط.",
      ),
      { exact: true },
    )
    .check();
  await modal
    .getByLabel(en("تفعيل الجدولة بعد الحفظ"), { exact: true })
    .check();
  await modal
    .getByRole("button", { name: en("حفظ الأتمتة"), exact: true })
    .click();
  await modal.waitFor({ state: "hidden" });
  let state = await command({ op: "snapshot" }),
    job = state.jobs[0];
  assert.deepEqual(job.retry, { maxAttempts: 2, delaySeconds: 15 });
  assert.equal(state.engine.mode, "Stop");
  assert.equal(await app.evaluate(() => globalThis.__retryCalls), 0);
  checks.push(
    "Actual English owner editor defaults retries off, saves reviewed bounded policy separately from integration consent, and sends nothing while stopped",
  );
  await command({
    op: "engine.mode",
    mode: "Running",
    epoch: state.engine.epoch,
  });
  await page
    .getByRole("button", {
      name: en("تشغيل {0}").replace("{0}", "Native retry"),
      exact: true,
    })
    .click();
  state = await until(
    (s) => s.runs.some((r) => r.status === "retryWaiting"),
    5000,
  );
  const first = state.runs[0];
  assert.equal(first.attempts.length, 1);
  assert.equal(state.inbox.length, 0);
  await page
    .getByText("Waiting to retry connection check", { exact: true })
    .waitFor();
  await app.evaluate(() => {
    globalThis.__retryMode = "ok";
  });
  state = await until((s) =>
    s.runs.some((r) => r.id === first.id && r.status === "succeeded"),
  );
  const completed = state.runs.find((r) => r.id === first.id);
  assert.equal(completed.attempts.length, 2);
  assert.equal(state.runs.length, 1);
  assert.equal(await app.evaluate(() => globalThis.__retryCalls), 3);
  assert.equal(
    state.inbox.filter((i) => i.evidence?.type === "integration").length,
    1,
  );
  checks.push(
    "A real Electron timer retries only the failed GET after its delay, completes the same occurrence, retains both attempts and publishes one actual inspection receipt",
  );
  await app.evaluate(() => {
    globalThis.__retryMode = "fail";
  });
  await command({ op: "job.run", id: job.id });
  state = await until(
    (s) => s.runs.some((r) => r.status === "retryWaiting"),
    5000,
  );
  const waiting = state.runs.find((r) => r.status === "retryWaiting");
  await page
    .locator(".run-row")
    .filter({
      has: page.getByText("Waiting to retry connection check", { exact: true }),
    })
    .getByRole("button", { name: en("إلغاء"), exact: true })
    .click();
  state = await until(
    (s) => s.runs.find((r) => r.id === waiting.id)?.status === "cancelled",
    5000,
  );
  assert.equal(state.runs.find((r) => r.id === waiting.id).nextRetryAt, null);
  checks.push(
    "Owner cancels a waiting retry through its actual run-row control; the durable run clears its retry time",
  );
  await command({ op: "job.run", id: job.id });
  state = await until(
    (s) => s.runs.some((r) => r.status === "retryWaiting"),
    5000,
  );
  const pending = state.runs.find((r) => r.status === "retryWaiting");
  await app.close();
  app = null;
  await launch("en");
  state = await command({ op: "snapshot" });
  const recovered = state.runs.find((r) => r.id === pending.id);
  assert.equal(recovered.status, "needsReview");
  assert.equal(recovered.reason, "RETRY_RESTART_REVIEW");
  assert.equal(recovered.attempts.length, 1);
  assert.equal(state.engine.mode, "Stop");
  assert.equal(await app.evaluate(() => globalThis.__retryCalls), 0);
  assert.ok(
    state.inbox.some(
      (i) => i.runId === pending.id || i.kind === "automation-alert",
    ),
  );
  assert.ok(!JSON.stringify(state).includes("PRIVATE_NATIVE_RETRY_FIXTURE"));
  checks.push(
    "Real restart preserves the ledger and protected credential but holds the pending retry for owner review, creates a durable alert and makes no request",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/validation/automation-retry-desktop.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        checks,
        errors,
        scope:
          "Real Electron UI, timer, Windows encryption and SQLite restart; isolated synthetic project and controlled Vercel transport, not owner-account acceptance",
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
        path: "docs/validation/automation-retry-failure.png",
        fullPage: true,
      })
      .catch(() => {});
  throw error;
} finally {
  if (app) await app.close();
  await rm(dir, { recursive: true, force: true });
}
