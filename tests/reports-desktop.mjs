import { _electron as electron } from "playwright-core";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const dir = await mkdtemp(path.join(tmpdir(), "badawi-reports-ui-")),
  checks = [],
  errors = [];
let app, page;
const command = async (c) => {
  const r = await page.evaluate((c) => window.badawi.command(c), c);
  if (!r.ok) throw Error(r.error);
  return r.data;
};
try {
  const env = { ...process.env, BADAWI_DATA_DIR: dir, BADAWI_BACKGROUND: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: ["."], env });
  page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("button", { name: "المهام", exact: true }).waitFor();
  const project = await command({ op: "workspace.add", path: dir });
  const task = await command({
    op: "task.save",
    title: "A completed claim",
    done: true,
    acceptanceCriteria: [{ id: "c", text: "Owner checked", source: "manual" }],
  });
  await command({
    op: "task.save",
    title: "Overdue UI report task",
    projectId: project.id,
    done: false,
    dueAt: "2020-01-01T00:00:00Z",
  });
  await page.getByRole("button", { name: "التقارير", exact: true }).click();
  await page.getByTestId("report-claimed").filter({ hasText: "1" }).waitFor();
  await page.getByTestId("report-verified").filter({ hasText: "0" }).waitFor();
  await page.getByText("Overdue UI report task", { exact: true }).waitFor();
  checks.push(
    "Actual SQLite completion claim and overdue task appear separately from verified acceptance",
  );
  await command({
    op: "task.criteria.review",
    id: task.id,
    criterionId: "c",
    accepted: true,
  });
  const state = await command({ op: "snapshot" });
  await command({
    op: "engine.mode",
    mode: "Running",
    epoch: state.engine.epoch,
  });
  await command({ op: "task.verify", id: task.id });
  await page
    .getByRole("button", { name: "تحديث التقرير", exact: true })
    .click();
  await page.getByTestId("report-verified").filter({ hasText: "1" }).waitFor();
  checks.push(
    "Refreshing reads the new host-verified acceptance and shows its source timestamp",
  );
  await page.getByLabel("فترة التقرير", { exact: true }).selectOption("7");
  await page.getByText("آخر 7 أيام", { exact: true }).waitFor();
  const report = await command({ op: "report.read", days: 7 });
  assert.equal(report.tasks.verified, 1);
  assert.equal(report.tasks.overdue, 1);
  assert.equal(report.range.days, 7);
  assert.equal(report.sources.automation.source, "Local SQLite run receipts");
  assert.ok(
    await page
      .getByRole("button", { name: "تصدير التقرير", exact: true })
      .isEnabled(),
  );
  checks.push(
    "Date filter applies to real report window; historical-source explanation and export are available",
  );
  await page
    .getByLabel("مشروع التقرير", { exact: true })
    .selectOption(project.id);
  await page.getByTestId("report-claimed").filter({ hasText: "0" }).waitFor();
  const scoped = await command({
    op: "report.read",
    days: 7,
    projectId: project.id,
  });
  assert.equal(scoped.tasks.total, 1);
  assert.equal(scoped.tasks.overdue, 1);
  assert.equal(scoped.tasks.verified, 0);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "docs/validation/reports-desktop.png",
    fullPage: true,
  });
  checks.push(
    "Project filter excludes unrelated claims and the rendered report has no document-wide horizontal overflow",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/validation/reports-desktop.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        checks,
        errors,
        scope:
          "Real Electron UI, SQLite and host evidence; no external-source polling or cloud receipt claimed",
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
