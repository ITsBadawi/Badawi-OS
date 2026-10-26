import { _electron as electron } from "playwright-core";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const dir = await mkdtemp(path.join(tmpdir(), "badawi-task-planning-"));
const checks = [],
  errors = [];
let app, page;
const command = async (c) => {
  const r = await page.evaluate((c) => window.badawi.command(c), c);
  if (!r.ok) throw Error(r.error);
  return r.data;
};
const snap = () => command({ op: "snapshot" });
async function launch() {
  const env = {
    ...process.env,
    BADAWI_DATA_DIR: path.join(dir, "data"),
    BADAWI_BACKGROUND: "1",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: ["."], env });
  page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("button", { name: "المهام", exact: true }).click();
}
try {
  await launch();
  await page.getByRole("button", { name: "مهمة جديدة", exact: true }).click();
  let modal = page.getByRole("dialog").first();
  await modal
    .getByLabel("عنوان المهمة", { exact: true })
    .fill("Recurring UI evidence");
  await modal
    .getByLabel("موعد التسليم", { exact: true })
    .fill("2027-01-10T12:00");
  await modal
    .getByLabel("تكرار المهمة", { exact: true })
    .selectOption("weekly");
  await modal.getByRole("checkbox", { name: /موعد ثابت/ }).check();
  await modal.getByRole("button", { name: "حفظ المهمة", exact: true }).click();
  await page
    .getByRole("button", { name: "Recurring UI evidence", exact: true })
    .waitFor();
  const initial = (await snap()).tasks[0];
  assert.equal(initial.recurrence.frequency, "weekly");
  assert.equal(initial.deadlineFixed, true);
  checks.push("Editor persists recurrence and fixed deadline through real IPC");
  await page.getByRole("button", { name: "قائمة · List", exact: true }).click();
  assert.equal(await page.locator(".task-column").count(), 1);
  checks.push("List displays a single unified task list");
  await page
    .getByRole("button", { name: "تقويم · Calendar", exact: true })
    .click();
  await page.getByLabel("بداية التقويم", { exact: true }).fill("2027-01-10");
  await page.getByLabel("فترة التقويم", { exact: true }).selectOption("1");
  assert.equal(
    await page
      .getByRole("button", { name: "Recurring UI evidence", exact: true })
      .count(),
    1,
  );
  checks.push("Day calendar places the task on its Baghdad date");
  await page.getByLabel("فترة التقويم", { exact: true }).selectOption("7");
  assert.equal(await page.locator(".task-column").count(), 8);
  checks.push("Week calendar renders seven dates and an undated group");
  await page
    .getByRole("button", { name: "Recurring UI evidence", exact: true })
    .click();
  modal = page.getByRole("dialog").first();
  await modal
    .getByLabel("موعد التسليم", { exact: true })
    .fill("2027-01-11T12:00");
  await modal.getByRole("button", { name: "حفظ المهمة", exact: true }).click();
  await page
    .getByRole("heading", { name: "تغيير موعد ثابت؟", exact: true })
    .waitFor();
  assert.equal((await snap()).tasks[0].dueAt, initial.dueAt);
  checks.push("Fixed date does not change before confirmation");
  await page
    .getByRole("button", { name: "أوافق على تغيير الموعد", exact: true })
    .click();
  await modal.getByRole("button", { name: "حفظ المهمة", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelectorAll("[role=dialog]").length === 0,
  );
  assert.notEqual((await snap()).tasks[0].dueAt, initial.dueAt);
  checks.push("Confirmed deadline edit is committed");
  await page.getByRole("button", { name: "إكمال المهمة", exact: true }).click();
  assert.equal((await snap()).tasks.length, 2);
  checks.push("Completing in the renderer creates exactly one next occurrence");
  await page.setViewportSize({ width: 1024, height: 768 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 2,
    ),
  );
  checks.push("Calendar fits compact window");
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/task-planning.png" });
  await app.close();
  app = null;
  await launch();
  const restored = await snap();
  assert.equal(restored.tasks.length, 2);
  assert.equal(restored.tasks.filter((x) => x.done).length, 1);
  assert.equal(restored.engine.mode, "Stop");
  checks.push("Restart preserves recurrence and completion");
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/validation/task-planning-desktop.json",
    JSON.stringify(
      { date: new Date().toISOString(), checks, errors, externalAI: false },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks, errors }));
} catch (e) {
  console.log(JSON.stringify({ checks, errors, error: e.message }));
  if (page) console.log((await page.locator("body").innerText()).slice(-2500));
  throw e;
} finally {
  if (app) await app.close();
  await rm(dir, { recursive: true, force: true });
}
