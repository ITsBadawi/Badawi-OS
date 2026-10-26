import { _electron as electron } from "playwright-core";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const dir = await mkdtemp(path.join(tmpdir(), "badawi-dashboard-")),
  checks = [],
  errors = [];
const env = {
  ...process.env,
  BADAWI_DATA_DIR: path.join(dir, "data"),
  BADAWI_BACKGROUND: "1",
};
delete env.ELECTRON_RUN_AS_NODE;
let app, page;
const cmd = async (c) => {
  const r = await page.evaluate((c) => window.badawi.command(c), c);
  if (!r.ok) throw Error(r.error);
  return r.data;
};
async function launch() {
  app = await electron.launch({ args: ["."], env });
  page = await app.firstWindow();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page
    .getByRole("button", { name: "لوحة التحكم", exact: true })
    .waitFor();
  await app.evaluate(() => {
    globalThis.__dashboardRequests = 0;
    globalThis.fetch = async () => {
      globalThis.__dashboardRequests++;
      throw Error("No network permitted");
    };
  });
}
try {
  await launch();
  for (const name of ["Alpha", "Beta"]) await mkdir(path.join(dir, name));
  const a = await cmd({
      op: "workspace.add",
      path: path.join(dir, "Alpha"),
      name: "Alpha",
    }),
    b = await cmd({
      op: "workspace.add",
      path: path.join(dir, "Beta"),
      name: "Beta",
    });
  await cmd({
    op: "task.save",
    title: "Alpha overdue",
    done: false,
    projectId: a.id,
    dueAt: "2020-01-01T00:00:00Z",
  });
  await cmd({
    op: "task.save",
    title: "Beta urgent",
    done: false,
    priority: "urgent",
    projectId: b.id,
  });
  const done = await cmd({
    op: "task.save",
    title: "Claimed without proof",
    done: true,
    projectId: a.id,
  });
  const note = await cmd({
    op: "note.save",
    title: "Pinned decision",
    body: "Exact owner note preview",
  });
  await page
    .getByRole("checkbox", { name: "Alpha overdue", exact: true })
    .waitFor();
  await page
    .getByRole("checkbox", { name: "Beta urgent", exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("checkbox", { name: done.title, exact: true }).count(),
    0,
  );
  await page
    .getByLabel("سياق لوحة التحكم", { exact: true })
    .selectOption("project");
  await page.getByLabel("مشروع السياق", { exact: true }).selectOption(a.id);
  await page
    .getByRole("checkbox", { name: "Alpha overdue", exact: true })
    .waitFor();
  await page
    .getByRole("checkbox", { name: "Beta urgent", exact: true })
    .waitFor({ state: "hidden" });
  const state = await cmd({ op: "snapshot" });
  assert.equal(state.engine.mode, "Stop");
  assert.equal(state.tasks.length, 3);
  checks.push(
    "Native dashboard context filters actual tasks/projects while all source records and stopped engine remain unchanged",
  );
  await page.getByRole("button", { name: "تثبيت عنصر", exact: true }).click();
  let modal = page.getByRole("dialog").first();
  await modal.getByLabel("نوع العنصر", { exact: true }).selectOption("note");
  await modal.getByLabel("العنصر", { exact: true }).selectOption(note.id);
  await modal.getByRole("button", { name: "تثبيت", exact: true }).click();
  await modal.waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "ملاحظة · Pinned decision", exact: true })
    .click();
  modal = page.getByRole("dialog").first();
  await modal.getByText("Exact owner note preview", { exact: true }).waitFor();
  await modal.getByRole("button", { name: "إغلاق", exact: true }).click();
  await page
    .getByLabel("سياق لوحة التحكم", { exact: true })
    .selectOption("review");
  await page
    .getByRole("checkbox", { name: "Claimed without proof", exact: true })
    .waitFor();
  await page
    .getByRole("checkbox", { name: "Beta urgent", exact: true })
    .waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "ملاحظة · Pinned decision", exact: true })
    .waitFor();
  checks.push(
    "Owner pins an actual note, previews its exact content and keeps the pin across contexts; review mode exposes unverified completion",
  );
  await page.screenshot({
    path: "docs/validation/dashboard-desktop.png",
    fullPage: true,
  });
  await app.close();
  app = null;
  await launch();
  await page
    .getByRole("button", { name: "ملاحظة · Pinned decision", exact: true })
    .waitFor();
  assert.equal(
    await page.getByLabel("سياق لوحة التحكم", { exact: true }).inputValue(),
    "review",
  );
  await page
    .getByLabel("سياق لوحة التحكم", { exact: true })
    .selectOption("project");
  await page.getByLabel("مشروع السياق", { exact: true }).selectOption(a.id);
  await cmd({ op: "project.archive", id: a.id, archived: true });
  await page
    .getByText(
      "المشروع المختار غير متاح؛ اختر مشروعاً آخر. لم نوسّع العرض إلى بقية المشاريع.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    await page
      .getByRole("checkbox", { name: "Beta urgent", exact: true })
      .count(),
    0,
  );
  await page
    .getByRole("button", { name: "إلغاء تثبيت Pinned decision", exact: true })
    .click();
  await page
    .getByRole("button", { name: "ملاحظة · Pinned decision", exact: true })
    .waitFor({ state: "hidden" });
  assert.equal((await cmd({ op: "snapshot" })).dashboard.pins.length, 0);
  checks.push(
    "Context and pins persist through restart; archiving the focused project leaves an explicit unavailable scope rather than widening it; unpin persists",
  );
  await page.setViewportSize({ width: 1120, height: 800 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  assert.equal(await app.evaluate(() => globalThis.__dashboardRequests), 0);
  assert.deepEqual(errors, []);
  checks.push(
    "No provider/cloud calls, no renderer errors and no document-wide overflow at compact width",
  );
  await writeFile(
    "docs/validation/dashboard-desktop.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        checks,
        errors,
        scope:
          "Actual Electron UI, local synthetic tasks/projects/note, SQLite persistence and restart; no owner profile or external requests",
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
