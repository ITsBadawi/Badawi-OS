import { _electron as electron } from "playwright-core";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const dir = await mkdtemp(path.join(tmpdir(), "badawi-games-"));
const checks = [],
  errors = [];
const env = {
  ...process.env,
  BADAWI_DATA_DIR: path.join(dir, "data"),
  BADAWI_BACKGROUND: "1",
};
delete env.ELECTRON_RUN_AS_NODE;
let app, page;
const command = async (c) => {
  const reply = await page.evaluate((c) => window.badawi.command(c), c);
  if (!reply.ok) throw Error(reply.error);
  return reply.data;
};
async function launch() {
  app = await electron.launch({ args: ["."], env });
  page = await app.firstWindow();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.getByRole("button", { name: "الإعدادات", exact: true }).waitFor();
}
async function until(test) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    const state = await command({ op: "snapshot" });
    if (test(state)) return state;
    await page.waitForTimeout(250);
  }
  throw Error("Game detection state did not arrive");
}
try {
  await launch();
  const executable = path
    .basename(await app.evaluate(() => process.execPath))
    .toLowerCase();
  await page.getByRole("button", { name: "الإعدادات", exact: true }).click();
  await page
    .getByRole("textbox", { name: "ملفات تشغيل الألعاب" })
    .fill(executable);
  await page.getByRole("button", { name: "حفظ قائمة الألعاب" }).click();
  let state = await until((s) => s.engine.gamingAutomatic);
  assert.deepEqual(state.gameDetection.names, [executable]);
  assert.equal(state.engine.mode, "Stop");
  checks.push(
    "Owner saves an executable through Settings; the actual Windows process activates Gaming without starting the stopped engine",
  );

  await page.getByRole("button", { name: "لوحة التحكم", exact: true }).click();
  await page.getByRole("switch", { name: "وضع اللعب" }).click();
  state = await until((s) => s.engine.gamingManual && s.engine.gamingAutomatic);
  await page.getByRole("button", { name: "الإعدادات", exact: true }).click();
  await page.getByRole("textbox", { name: "ملفات تشغيل الألعاب" }).fill("");
  await page.getByRole("button", { name: "حفظ قائمة الألعاب" }).click();
  state = await until((s) => !s.engine.gamingAutomatic);
  assert.equal(state.engine.gamingManual, true);
  assert.equal(state.engine.gaming, true);
  checks.push(
    "Removing the watched process clears only automatic Gaming, preserving manual Gaming",
  );

  await app.close();
  await launch();
  state = await command({ op: "snapshot" });
  assert.equal(state.engine.mode, "Stop");
  assert.equal(state.engine.gamingManual, true);
  assert.equal(state.engine.gamingAutomatic, false);
  checks.push(
    "Restart preserves manual Gaming and leaves automatic observation transient",
  );
  assert.deepEqual(errors, []);
  await mkdir("docs/validation", { recursive: true });
  await writeFile(
    "docs/validation/game-detection-desktop.json",
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors }));
} finally {
  await app?.close().catch(() => {});
  await rm(dir, { recursive: true, force: true });
}
