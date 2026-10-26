import { _electron as electron } from "playwright-core";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const dir = await mkdtemp(path.join(tmpdir(), "badawi-conditions-ui-")),
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
  page.setDefaultTimeout(12000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("button", { name: "المهام", exact: true }).waitFor();
}
try {
  await launch();
  const task = await command({
    op: "task.save",
    title: "Synthetic overdue condition source",
    done: false,
    dueAt: "2020-01-01T00:00:00Z",
  });
  await page.getByRole("button", { name: "الأتمتة", exact: true }).click();
  await page.getByRole("button", { name: "أتمتة جديدة", exact: true }).click();
  const modal = page.getByRole("dialog").first();
  await modal
    .getByLabel("اسم الأتمتة", { exact: true })
    .fill("Native overdue condition");
  await modal.getByLabel("التوقيت", { exact: true }).selectOption("condition");
  await modal
    .getByLabel("نوع الشرط", { exact: true })
    .selectOption("tasks.overdue");
  await modal.getByLabel("حد عدد المهام", { exact: true }).fill("1");
  await modal
    .getByLabel("رسالة التذكير", { exact: true })
    .fill("CONDITION_NATIVE_TIMER");
  await modal
    .getByRole("button", { name: "معاينة الشرط الآن", exact: true })
    .click();
  await modal.getByText("الشرط متحقق", { exact: true }).waitFor();
  await modal.getByLabel("تفعيل الجدولة بعد الحفظ", { exact: true }).check();
  await modal.getByRole("button", { name: "حفظ الأتمتة", exact: true }).click();
  let state = await command({ op: "snapshot" }),
    job = state.jobs.find((j) => j.name === "Native overdue condition");
  assert.equal(job.trigger.type, "condition");
  assert.equal(job.nextDueAt, null);
  assert.ok(!state.inbox.some((i) => i.body === "CONDITION_NATIVE_TIMER"));
  checks.push(
    "Owner editor previews actual local overdue count and saves an enabled condition without running while Stop",
  );
  await command({
    op: "engine.mode",
    mode: "Running",
    epoch: state.engine.epoch,
  });
  const deadline = Date.now() + 35000;
  let observed = false;
  while (Date.now() < deadline) {
    state = await command({ op: "snapshot" });
    if (
      state.runs.some((x) => x.jobId === job.id && x.status === "succeeded") &&
      state.inbox.some((i) => i.body === "CONDITION_NATIVE_TIMER")
    ) {
      observed = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  assert.ok(observed, "Actual timer did not deliver the conditional reminder");
  assert.equal(state.runs.filter((r) => r.jobId === job.id).length, 1);
  assert.equal(
    state.jobs.find((j) => j.id === job.id).conditionState.observation.matched,
    true,
  );
  checks.push(
    "Actual local timer observes the condition and delivers one durable reminder with a timestamped observation",
  );
  await app.close();
  app = null;
  await launch();
  state = await command({ op: "snapshot" });
  assert.equal(state.engine.mode, "Stop");
  await command({
    op: "engine.mode",
    mode: "Running",
    epoch: state.engine.epoch,
  });
  await page.waitForTimeout(17500);
  state = await command({ op: "snapshot" });
  assert.equal(state.runs.filter((r) => r.jobId === job.id).length, 1);
  assert.equal(
    state.inbox.filter((i) => i.body === "CONDITION_NATIVE_TIMER").length,
    1,
  );
  checks.push(
    "Restart restores the matching latch and a fresh real timer cycle does not replay the still-true condition",
  );
  await command({
    op: "task.save",
    id: task.id,
    title: task.title,
    done: true,
  });
  await command({ op: "job.run", id: job.id });
  state = await command({ op: "snapshot" });
  assert.ok(
    state.runs.some(
      (r) =>
        r.jobId === job.id &&
        r.status === "skipped" &&
        r.reason === "CONDITION_NOT_MET",
    ),
  );
  assert.equal(
    state.inbox.filter((i) => i.body === "CONDITION_NATIVE_TIMER").length,
    1,
  );
  await page.getByRole("button", { name: "الأتمتة", exact: true }).click();
  await page.getByText("تم التخطي", { exact: true }).waitFor();
  await page.screenshot({
    path: "docs/validation/conditions-desktop.png",
    fullPage: true,
  });
  checks.push(
    "A manual run rechecks a changed condition and visibly records skipped without another reminder or false success",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/validation/conditions-desktop.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        checks,
        errors,
        scope:
          "Real Electron UI, SQLite and two actual timer cycles in an isolated profile; synthetic tasks and reminders, no provider or cloud call",
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks, errors }));
} catch (error) {
  if (app && page) {
    const debug = await command({ op: "snapshot" });
    console.log(
      JSON.stringify({
        checks,
        error: error.message,
        jobs: debug.jobs,
        runs: debug.runs,
        inbox: debug.inbox.map((i) => ({ title: i.title, body: i.body })),
        engine: debug.engine,
      }),
    );
  }
  throw error;
} finally {
  if (app) await app.close();
  await rm(dir, { recursive: true, force: true });
}
