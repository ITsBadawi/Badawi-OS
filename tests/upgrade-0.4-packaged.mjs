import { _electron as electron } from "playwright-core";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const dir = await mkdtemp(path.join(tmpdir(), "badawi-upgrade-0.4-"));
const oldExe = path.resolve("release/Badawi-OS-0.3.0-Windows/Badawi OS.exe");
const targetVersion = process.env.BADAWI_UPGRADE_TARGET_VERSION || "0.4.0";
const newExe = path.resolve(`release/Badawi-OS-${targetVersion}-Windows/Badawi OS.exe`);
const env = { ...process.env, BADAWI_DATA_DIR: path.join(dir, "data"), BADAWI_BACKGROUND: "1" };
delete env.ELECTRON_RUN_AS_NODE;
let app, page, receipt = null;
const checks = [], errors = [];
const launch = async (executablePath) => {
  app = await electron.launch({ executablePath, args: [], env });
  page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.getByRole("button", { name: "لوحة التحكم", exact: true }).waitFor();
};
const command = async (input) => {
  const response = await page.evaluate((value) => window.badawi.command(value), input);
  if (!response.ok) throw Error(response.error);
  return response.data;
};
try {
  await launch(oldExe);
  assert.equal((await command({ op: "snapshot" })).version, "0.3.0");
  const task = await command({ op: "task.save", title: "Synthetic pre-upgrade task", done: false, description: "Preserve this test record" });
  const note = await command({ op: "note.save", title: "Synthetic pre-upgrade note", body: "Retain exact test bytes" });
  await app.close();
  app = null;
  checks.push("The preserved 0.3.0 package created only synthetic task and note records in an isolated profile");

  await launch(newExe);
  const state = await command({ op: "snapshot" });
  assert.equal(state.version, targetVersion);
  assert.equal(state.engine.mode, "Stop");
  assert.equal(state.tasks.find((row) => row.id === task.id)?.description, "Preserve this test record");
  assert.equal(state.notes.find((row) => row.id === note.id)?.body, "Retain exact test bytes");
  assert.equal((await readdir(path.join(dir, "data"))).filter((name) => /^before-update-.*\.db$/.test(name)).length, 0);
  checks.push(`Opening ${targetVersion} over the isolated 0.3.0 profile preserved exact records, started Stopped and made no permanent local update copy`);
  assert.deepEqual(errors, []);
  receipt = { date: new Date().toISOString(), from: "0.3.0", to: targetVersion, checks, errors, ownerProfileTouched: false };
} finally {
  if (app) await app.close();
  const target = path.resolve(dir), parent = path.resolve(tmpdir());
  if (path.dirname(target) !== parent) throw Error("TEST_CLEANUP_PATH_INVALID");
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
if (receipt) {
  await writeFile(`docs/validation/upgrade-${targetVersion}-packaged.json`, JSON.stringify({ ...receipt, temporaryProfileRemoved: true }, null, 2));
  console.log(JSON.stringify(receipt));
}
