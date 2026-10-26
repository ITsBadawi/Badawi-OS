import { _electron as electron } from "playwright-core";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  access,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import path from "node:path";
import assert from "node:assert/strict";
const dir = await mkdtemp(path.join(tmpdir(), "badawi-discard-ui-")),
  id = randomUUID(),
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
  app = await electron.launch({
    ...(process.env.BADAWI_PACKAGED_EXE
      ? { executablePath: path.resolve(process.env.BADAWI_PACKAGED_EXE), args: [] }
      : { args: ["."] }),
    env,
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("button", { name: "المهام", exact: true }).waitFor();
  await mkdir(path.join(dir, "staging"));
  const file = path.join(dir, "staging", `${id}.stage`),
    sentinel = path.join(dir, "staging", "keep.stage");
  await writeFile(file, "SYNTHETIC_ENCRYPTED_STAGE");
  await writeFile(sentinel, "KEEP");
  await app.evaluate(
    ({ app }, { id }) => {
      const { DatabaseSync } = process.getBuiltinModule("node:sqlite"),
        db = new DatabaseSync(app.getPath("userData") + "/badawi.db");
      const row = {
        id,
        account: "fixture-old-account",
        status: "checkpointed",
        size: 25,
        offset: 4,
        remoteId: "untouched-cloud-file",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.prepare("INSERT INTO backups(id,data) VALUES(?,?)").run(
        id,
        JSON.stringify(row),
      );
      db.close();
      globalThis.__discardNetwork = 0;
      globalThis.fetch = async () => {
        globalThis.__discardNetwork++;
        throw Error("Unexpected network");
      };
    },
    { id },
  );
  let state = await command({ op: "snapshot" });
  await command({
    op: "engine.mode",
    mode: "Running",
    epoch: state.engine.epoch,
  });
  await page
    .getByRole("button", { name: "النسخ الاحتياطية", exact: true })
    .click();
  await page
    .getByRole("button", { name: "إلغاء تجهيز النسخة", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .filter({
      has: page.getByRole("heading", {
        name: "مراجعة إلغاء التجهيز المحلي",
        exact: true,
      }),
    })
    .waitFor();
  assert.equal(await readFile(file, "utf8"), "SYNTHETIC_ENCRYPTED_STAGE");
  await page.getByRole("button", { name: "تراجع", exact: true }).click();
  assert.equal(await readFile(file, "utf8"), "SYNTHETIC_ENCRYPTED_STAGE");
  checks.push(
    "Native preview describes exact pending local stage and leaves bytes intact on cancellation",
  );
  await page
    .getByRole("button", { name: "إلغاء تجهيز النسخة", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "أوافق على إلغاء التجهيز المحلي",
      exact: true,
    })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "أُلغي التجهيز المحلي" })
    .waitFor();
  await assert.rejects(access(file));
  assert.equal(await readFile(sentinel, "utf8"), "KEEP");
  state = await command({ op: "snapshot" });
  assert.equal(state.backups[0].status, "discarded");
  assert.equal(state.backups[0].remoteId, "untouched-cloud-file");
  assert.equal(await app.evaluate(() => globalThis.__discardNetwork), 0);
  checks.push(
    "Explicit confirmation removes only reviewed temporary bytes, records actual cleanup and makes zero cloud requests",
  );
  await app.close();
  app = null;
  app = await electron.launch({
    ...(process.env.BADAWI_PACKAGED_EXE
      ? { executablePath: path.resolve(process.env.BADAWI_PACKAGED_EXE), args: [] }
      : { args: ["."] }),
    env,
  });
  page = await app.firstWindow();
  await page.getByRole("button", { name: "المهام", exact: true }).waitFor();
  state = await command({ op: "snapshot" });
  assert.equal(state.backups[0].status, "discarded");
  assert.equal(state.engine.mode, "Stop");
  assert.ok(state.audit.some((a) => a.event === "backup.localStageDiscarded"));
  checks.push(
    "Restart preserves the discarded receipt and stopped engine without resuming the old attempt",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/validation/backup-checkpoint-desktop.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        checks,
        errors,
        scope:
          "Real Electron/SQLite/filesystem with synthetic staged bytes in an isolated profile; no Google Drive request or owner file changed",
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
