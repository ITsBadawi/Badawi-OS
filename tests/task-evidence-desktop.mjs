import { _electron as electron } from "playwright-core";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const dir = await mkdtemp(path.join(tmpdir(), "badawi-evidence-ui-")),
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
  page.setDefaultTimeout(12000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("button", { name: "المهام", exact: true }).click();
  await page.getByRole("button", { name: "مهمة جديدة", exact: true }).click();
  let modal = page.getByRole("dialog").first();
  await modal
    .getByLabel("عنوان المهمة", { exact: true })
    .fill("Acceptance UI task");
  await modal
    .getByRole("button", { name: "إضافة معيار إنجاز", exact: true })
    .click();
  await modal
    .getByLabel("معيار الإنجاز 1", { exact: true })
    .fill("Owner inspected the result");
  await modal.getByLabel("الحالة", { exact: true }).selectOption("done");
  await modal.getByRole("button", { name: "حفظ المهمة", exact: true }).click();
  await page
    .getByRole("button", { name: "Acceptance UI task", exact: true })
    .waitFor();
  let state = await command({ op: "snapshot" }),
    task = state.tasks[0];
  assert.equal(task.verificationStatus.state, "unverified");
  checks.push(
    "Editor persists acceptance criteria while a completion claim remains unverified",
  );
  await command({
    op: "engine.mode",
    mode: "Running",
    epoch: state.engine.epoch,
  });
  await page.getByText("معايير وأدلة الإنجاز", { exact: true }).click();
  await page.getByLabel("راجعت المعيار 1 وأؤكد تحققه", { exact: true }).click();
  await page.getByRole("status").filter({ hasText: "حُفظت مراجعتك" }).waitFor();
  await page
    .getByRole("button", { name: "فحص أدلة المهمة", exact: true })
    .click();
  await page.getByText("متحقق منها", { exact: true }).waitFor();
  state = await command({ op: "snapshot" });
  assert.equal(state.tasks[0].verificationStatus.state, "verified");
  assert.equal(
    state.tasks[0].verification.evidence[0].provider,
    "Owner review",
  );
  checks.push(
    "Explicit owner criterion review creates timestamped provenance and a verified receipt",
  );
  await page
    .getByRole("button", { name: "Acceptance UI task", exact: true })
    .click();
  modal = page.getByRole("dialog").first();
  await modal
    .getByLabel("الوصف", { exact: true })
    .fill("Changed requirements after review");
  await modal.getByRole("button", { name: "حفظ المهمة", exact: true }).click();
  state = await command({ op: "snapshot" });
  assert.equal(state.tasks[0].verificationStatus.state, "unverified");
  assert.equal(state.tasks[0].verificationStatus.stale, true);
  checks.push(
    "Editing task meaning invalidates previous owner review and verification",
  );
  await app.close();
  app = null;
  app = await electron.launch({ args: ["."], env });
  page = await app.firstWindow();
  page.setDefaultTimeout(12000);
  await page.getByRole("button", { name: "المهام", exact: true }).click();
  state = await command({ op: "snapshot" });
  assert.equal(
    state.tasks[0].acceptanceCriteria[0].text,
    "Owner inspected the result",
  );
  assert.equal(state.tasks[0].verificationStatus.state, "unverified");
  assert.equal(state.engine.mode, "Stop");
  checks.push(
    "Restart preserves criteria and stale evidence without restoring a false verified state",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/validation/task-evidence-desktop.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        checks,
        errors,
        scope:
          "Real Electron UI, IPC, SQLite and explicit manual evidence; no external deployment/CI claimed",
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
