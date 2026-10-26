import { _electron as electron } from "playwright-core";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const dir = await mkdtemp(path.join(tmpdir(), "badawi-alerts-ui-")),
  checks = [],
  errors = [];
let app, page;
const command = async (c) => {
  const r = await page.evaluate((c) => window.badawi.command(c), c);
  if (!r.ok) throw Error(r.error);
  return r.data;
};
const env = { ...process.env, BADAWI_DATA_DIR: dir, BADAWI_BACKGROUND: "1" };
delete env.ELECTRON_RUN_AS_NODE;
async function launch() {
  app = await electron.launch({ args: ["."], env });
  page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("button", { name: "المهام", exact: true }).waitFor();
}
try {
  await launch();
  await command({
    op: "preferences.save",
    notifications: false,
    tray: true,
    startup: false,
  });
  await app.evaluate(({ app }) => {
    const { DatabaseSync } = process.getBuiltinModule("node:sqlite"),
      db = new DatabaseSync(app.getPath("userData") + "/badawi.db");
    const job = {
        id: "fixture-backup",
        name: "اختبار تنبيه نسخة متوقفة",
        kind: "backup",
        enabled: false,
        trigger: { type: "manual" },
        missedPolicy: "skip",
        createdAt: new Date().toISOString(),
      },
      run = {
        id: "fixture-interrupted",
        jobId: job.id,
        status: "running",
        createdAt: new Date().toISOString(),
      };
    db.prepare("INSERT INTO jobs(id,data) VALUES(?,?)").run(
      job.id,
      JSON.stringify(job),
    );
    db.prepare("INSERT INTO runs(id,data) VALUES(?,?)").run(
      run.id,
      JSON.stringify(run),
    );
    db.close();
  });
  await app.close();
  app = null;
  await launch();
  let state = await command({ op: "snapshot" });
  assert.equal(state.inbox.length, 1);
  assert.equal(
    state.runs.find((r) => r.id === "fixture-interrupted").status,
    "needsReview",
  );
  assert.ok(state.runs[0].alertedAt);
  await page.getByRole("button", { name: "الوارد", exact: true }).click();
  await page
    .getByText("مراجعة مطلوبة: اختبار تنبيه نسخة متوقفة", { exact: true })
    .waitFor();
  checks.push(
    "Native startup converts a seeded interrupted legacy run into one visible durable review alert",
  );
  await command({
    op: "engine.mode",
    mode: "Running",
    epoch: state.engine.epoch,
  });
  await command({ op: "job.run", id: "fixture-backup" });
  state = await command({ op: "snapshot" });
  assert.ok(
    state.runs.some(
      (r) => r.status === "failed" && r.reason === "RECOVERY_KEY_REQUIRED",
    ),
  );
  await page
    .getByText("تعثر أتمتة: اختبار تنبيه نسخة متوقفة", { exact: true })
    .waitFor();
  assert.equal(state.inbox.length, 2);
  assert.ok(state.inbox.some((i) => i.body.includes("مفتاح الاسترداد")));
  assert.ok(!state.inbox.some((i) => i.body.includes("RECOVERY_KEY_REQUIRED")));
  assert.ok(!state.audit.some((a) => a.event === "notification.dispatched"));
  checks.push(
    "An actual missing-key backup failure becomes a plain-language Inbox alert while disabled desktop notifications remain suppressed",
  );
  await app.close();
  app = null;
  await launch();
  state = await command({ op: "snapshot" });
  assert.equal(state.engine.mode, "Stop");
  assert.equal(state.inbox.length, 2);
  assert.equal(
    state.audit.filter((a) => a.event === "automation.alerted").length,
    2,
  );
  assert.ok(state.runs.every((r) => r.alertedAt));
  assert.equal(state.auditValid, true);
  checks.push(
    "A further restart retains both alerts and does not replay or duplicate notifications",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/validation/automation-alerts-desktop.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        checks,
        errors,
        scope:
          "Actual Electron recovery, failed backup execution, SQLite and Inbox UI in an isolated diagnostic profile. Interrupted legacy rows are seeded fixtures; no cloud request or visible Windows toast claimed.",
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
