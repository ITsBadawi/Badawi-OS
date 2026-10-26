import { _electron as electron } from "playwright-core";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const dir = await mkdtemp(path.join(tmpdir(), "badawi-backup-ui-")),
  root = path.join(dir, "Source");
await mkdir(root);
await mkdir(path.join(root, "docs"));
await writeFile(
  path.join(root, "docs", "keep.txt"),
  "Selected content ".repeat(2000),
);
await writeFile(path.join(root, "docs", "exclude.txt"), "never archive");
const checks = [],
  errors = [];
let app, page;
const command = async (c) => {
  const r = await page.evaluate((c) => window.badawi.command(c), c);
  if (!r.ok) throw Error(r.error);
  return r.data;
};
try {
  const env = {
    ...process.env,
    BADAWI_DATA_DIR: path.join(dir, "data"),
    BADAWI_BACKGROUND: "1",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    ...(process.env.BADAWI_PACKAGED_EXE
      ? { executablePath: path.resolve(process.env.BADAWI_PACKAGED_EXE), args: [] }
      : { args: ["."] }),
    env,
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => errors.push(e.message));
  await app.evaluate(async ({ dialog, shell }, dir) => {
    const { createHash } = process.getBuiltinModule("node:crypto");
    const remote = new Map();
    const f = (globalThis.__backupTest = {
      uploads: 0,
      ids: 0,
      trashWrites: 0,
    });
    const original = globalThis.fetch;
    dialog.showSaveDialog = async () => ({
      canceled: false,
      filePath: dir + "/recovery.json",
    });
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
    shell.openExternal = async (url) => {
      const u = new URL(url);
      const callback = new URL(u.searchParams.get("redirect_uri"));
      callback.search = new URLSearchParams({
        state: u.searchParams.get("state"),
        code: "fixture-code",
      }).toString();
      const r = await original(callback);
      await r.text();
    };
    globalThis.fetch = async (input, init = {}) => {
      const url = String(input),
        u = new URL(url);
      if (url === "https://oauth2.googleapis.com/token")
        return Response.json({
          access_token: "fixture-access",
          refresh_token: "fixture-refresh",
          expires_in: 3600,
        });
      if (url.includes("/about?fields=user"))
        return Response.json({ user: { permissionId: "fixture-account" } });
      if (url.includes("/about?fields=storageQuota"))
        return Response.json({
          storageQuota: {
            limit: "10737418240",
            usage: "1073741824",
            usageInDrive: "536870912",
          },
        });
      if (url.includes("/generateIds?"))
        return Response.json({ ids: [`fixture-${++f.ids}`] });
      if (url.endsWith("/files?fields=id")) {
        const meta = JSON.parse(init.body);
        if (remote.has(meta.id)) return new Response("", { status: 409 });
        remote.set(meta.id, {
          ...meta,
          createdTime: new Date().toISOString(),
          bytes: Buffer.alloc(0),
        });
        return Response.json({ id: meta.id });
      }
      const id = u.pathname.split("/").at(-1);
      if (url.includes("uploadType=resumable"))
        return new Response("", {
          headers: {
            location: `https://www.googleapis.com/upload/drive/v3/files/${id}-session`,
          },
        });
      if (id.endsWith("-session")) {
        const file = remote.get(id.replace(/-session$/, ""));
        f.uploads++;
        file.bytes = Buffer.concat([file.bytes, Buffer.from(init.body)]);
        return Response.json({ id: file.id });
      }
      if (u.pathname === "/drive/v3/files" && init.method !== "POST")
        return Response.json({
          files: [...remote.values()]
            .filter((v) => v.appProperties?.badawiKind === "backup")
            .map(({ bytes, ...v }) => ({ ...v, size: String(bytes.length) })),
        });
      const file = remote.get(id);
      if (file) {
        if (init.method === "PATCH" && JSON.parse(init.body).trashed) {
          file.trashed = true;
          f.trashWrites++;
        }
        if (u.searchParams.get("alt") === "media")
          return new Response(file.bytes);
        const { bytes, ...meta } = file;
        return Response.json({
          ...meta,
          size: String(bytes.length),
          md5Checksum: createHash("md5").update(bytes).digest("hex"),
        });
      }
      throw Error("Unexpected controlled Drive request");
    };
  }, dir);
  const p = await command({ op: "workspace.add", path: root });
  await command({
    op: "project.permissions",
    id: p.id,
    aiRead: false,
    backupFiles: true,
    monitor: false,
  });
  await command({
    op: "drive.setup",
    clientId: "fixture-client.apps.googleusercontent.com",
    clientSecret: "fixture-secret",
  });
  await command({ op: "drive.connect" });
  await command({ op: "backup.keyExport" });
  await page
    .getByRole("button", { name: "النسخ الاحتياطية", exact: true })
    .click();
  await page.getByText("Source · تُنسخ ملفاته", { exact: false }).click();
  await page.getByLabel("تضمين Source", { exact: true }).fill("docs");
  await page
    .getByLabel("استثناء Source", { exact: true })
    .fill("docs/exclude.txt");
  await page
    .getByRole("button", { name: "حفظ نطاق النسخ", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "حُفظ نطاق النسخ" })
    .waitFor();
  let state = await command({ op: "snapshot" });
  await command({
    op: "engine.mode",
    mode: "Running",
    epoch: state.engine.epoch,
  });
  await page
    .getByRole("button", { name: "تحديث سعة Drive", exact: true })
    .click();
  await page.getByText(/المستخدم:.*السعة:/).waitFor();
  state = await command({ op: "snapshot" });
  assert.equal(state.drive.quota.available, 9663676416);
  checks.push("Capacity UI reads the official authenticated quota fields");
  await page
    .getByLabel("تاريخ انتهاء باقة Drive", { exact: true })
    .fill("2026-12-31");
  await page
    .getByRole("button", { name: "حفظ تذكير الباقة", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "حُفظ تاريخ الباقة" })
    .waitFor();
  assert.equal(
    (await command({ op: "snapshot" })).drive.planExpiry,
    "2026-12-31",
  );
  checks.push(
    "Owner-defined plan expiry is saved through the real settings flow",
  );
  await page
    .getByRole("button", { name: "إنشاء أو استئناف نسخة", exact: true })
    .click();
  await page.getByText("تم التحقق", { exact: true }).waitFor();
  state = await command({ op: "snapshot" });
  const backup = state.backups[0];
  assert.ok(backup.size < backup.plainSize / 3);
  checks.push(
    "Selected source is compressed, encrypted, uploaded, downloaded and verified through the real host",
  );
  const initialUploads = await app.evaluate(
    () => globalThis.__backupTest.uploads,
  );
  await page
    .getByRole("button", { name: "إنشاء أو استئناف نسخة", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "لم يتغير المحتوى" })
    .waitFor();
  assert.equal(
    await app.evaluate(() => globalThis.__backupTest.uploads),
    initialUploads,
  );
  checks.push(
    "Second unchanged backup checks the remote object without another upload",
  );
  await page
    .getByRole("button", { name: "قراءة نسخ Drive", exact: true })
    .click();
  await page
    .getByRole("button", { name: "اختيار ملف / مجلد للاستعادة", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "استعادة ملفات محددة", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByLabel("ملف أو مجلد الاستعادة", { exact: true })
      .locator("option")
      .filter({ hasText: "docs/exclude.txt" })
      .count(),
    0,
  );
  checks.push("Manifest excludes the owner-excluded file");
  await page
    .getByLabel("ملف أو مجلد الاستعادة", { exact: true })
    .selectOption("docs/keep.txt");
  await page
    .getByRole("button", { name: "مراجعة استعادة الاختيار", exact: true })
    .click();
  await page
    .getByRole("button", { name: "اختيار مجلد والاستعادة", exact: true })
    .click();
  await page.getByText("تمت الاستعادة إلى:", { exact: false }).waitFor();
  const output = (await readdir(dir)).find((v) =>
    v.startsWith("Badawi-Restored-"),
  );
  assert.ok(output);
  assert.equal(
    await readFile(
      path.join(dir, output, "projects", p.id, "docs", "keep.txt"),
      "utf8",
    ),
    "Selected content ".repeat(2000),
  );
  assert.deepEqual(await readdir(path.join(dir, output)), ["projects"]);
  checks.push(
    "Selected file restores exact bytes into a new folder without an active database",
  );
  for (let i = 0; i < 3; i++) {
    await command({
      op: "note.save",
      title: `Retention sample ${i}`,
      body: "Synthetic only",
    });
    await command({ op: "backup.run" });
  }
  state = await command({ op: "snapshot" });
  assert.equal(state.backups.length, 4);
  await app.evaluate(
    ({ app }, ids) => {
      const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
      const db = new DatabaseSync(app.getPath("userData") + "/badawi.db");
      for (let i = 0; i < ids.length; i++) {
        const r = db.prepare("SELECT data FROM backups WHERE id=?").get(ids[i]);
        const b = JSON.parse(r.data);
        b.createdAt = `2025-01-0${4 - i}T00:00:00Z`;
        db.prepare("UPDATE backups SET data=? WHERE id=?").run(
          JSON.stringify(b),
          b.id,
        );
      }
      db.close();
    },
    state.backups.map((b) => b.id),
  );
  await command({ op: "snapshot" });
  await page.getByLabel("حماية من التنظيف", { exact: true }).last().click();
  await page.getByRole("status").filter({ hasText: "حُميت النسخة" }).waitFor();
  await page.getByLabel("عدد النسخ المحتفظ بها", { exact: true }).fill("2");
  await page.getByLabel("عمر النسخ قبل التنظيف", { exact: true }).fill("1");
  await page
    .getByRole("button", { name: "حفظ سياسة الاحتفاظ", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "حُفظت سياسة الاحتفاظ" })
    .waitFor();
  await page
    .getByRole("button", { name: "معاينة تنظيف النسخ", exact: true })
    .click();
  await page
    .getByRole("button", { name: "مراجعة نقل النسخ إلى السلة", exact: true })
    .waitFor();
  assert.equal(
    await app.evaluate(() => globalThis.__backupTest.trashWrites),
    0,
  );
  await page
    .getByRole("button", { name: "مراجعة نقل النسخ إلى السلة", exact: true })
    .click();
  await page
    .getByRole("button", { name: "أوافق على نقل النسخ المعروضة", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "تم التحقق من نقل النسخ" })
    .waitFor();
  state = await command({ op: "snapshot" });
  assert.equal(state.backups.filter((b) => b.status === "trashed").length, 1);
  assert.equal(state.backups.filter((b) => b.status === "verified").length, 3);
  assert.equal(state.backups.filter((b) => b.protected).length, 1);
  assert.equal(
    await app.evaluate(() => globalThis.__backupTest.trashWrites),
    1,
  );
  checks.push(
    "Retention settings, protected copy, exact preview, explicit confirmation and remote trash receipt preserve three healthy copies",
  );
  const secondRoot = path.join(dir, "Second");
  await mkdir(secondRoot);
  await writeFile(path.join(secondRoot, "second-only.txt"), "SECOND_PROJECT_ONLY");
  const second = await command({ op: "workspace.add", path: secondRoot });
  await command({ op: "project.permissions", id: second.id, aiRead: false, backupFiles: true, monitor: false });
  const waitForState = async (predicate) => {
    const until = Date.now() + 25000;
    while (Date.now() < until) {
      const current = await command({ op: "snapshot" });
      if (predicate(current)) return current;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw Error("SCHEDULED_BACKUP_TIMEOUT");
  };
  const scheduled = await command({
    op: "job.save", name: "Selected project timer", kind: "backup", projectId: p.id,
    trigger: { type: "once", at: new Date(Date.now() + 2500).toISOString() },
    enabled: true, missedPolicy: "skip",
  });
  state = await waitForState((s) => s.runs.some((r) => r.jobId === scheduled.id && r.status === "succeeded"));
  const selectedBackup = state.backups.find((b) => JSON.stringify(b.projectIds) === JSON.stringify([p.id]));
  assert.ok(selectedBackup?.remoteId);
  const selectedManifest = await command({ op: "backup.inspect", fileId: selectedBackup.remoteId });
  assert.deepEqual(selectedManifest.projects.map((item) => item.id), [p.id]);
  assert.deepEqual(selectedManifest.projects[0].files.map((file) => file.path), ["docs/keep.txt"]);
  checks.push("The real Node timer uploads and verifies an encrypted backup containing only the scheduled project and its allowed file scope");
  await command({ op: "engine.mode", mode: "Pause", epoch: state.engine.epoch });
  const beforeMissedUploads = await app.evaluate(() => globalThis.__backupTest.uploads);
  const at = new Date(Date.now() + 2500).toISOString();
  const skipped = await command({ op: "job.save", name: "Skip blocked backup", kind: "backup", projectId: second.id, trigger: { type: "once", at }, enabled: true, missedPolicy: "skip" });
  const heldJob = await command({ op: "job.save", name: "Review blocked backup", kind: "backup", projectId: second.id, trigger: { type: "once", at }, enabled: true, missedPolicy: "coalesceLatest" });
  state = await waitForState((s) => s.runs.some((r) => r.jobId === heldJob.id && r.status === "blocked"));
  assert.equal(state.runs.some((r) => r.jobId === skipped.id), false);
  const held = state.runs.find((r) => r.jobId === heldJob.id);
  assert.equal(held.reason, "catchupApproval");
  assert.equal(await app.evaluate(() => globalThis.__backupTest.uploads), beforeMissedUploads);
  checks.push("Paused due backups obey skip or owner-review policy without uploading either occurrence");
  await command({ op: "engine.mode", mode: "Running", epoch: state.engine.epoch });
  await command({ op: "run.resume", id: held.id });
  state = await command({ op: "snapshot" });
  assert.equal(state.runs.find((r) => r.id === held.id).status, "succeeded");
  const resumedBackup = state.backups.find((b) => JSON.stringify(b.projectIds) === JSON.stringify([second.id]));
  const resumedManifest = await command({ op: "backup.inspect", fileId: resumedBackup.remoteId });
  assert.deepEqual(resumedManifest.projects.map((item) => item.id), [second.id]);
  assert.deepEqual(resumedManifest.projects[0].files.map((file) => file.path), ["second-only.txt"]);
  await assert.rejects(command({ op: "run.resume", id: held.id }), /RUN_NOT_RESUMABLE/);
  checks.push("One-use owner review runs only the held project's actual encrypted backup and refuses replay");
  assert.equal(
    await readFile(path.join(root, "docs", "exclude.txt"), "utf8"),
    "never archive",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/validation/backup-features-desktop.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        liveDrive: false,
        transport:
          "Controlled OAuth/Drive responses; real Electron, SQLite, encryption, filesystem, settings and restore",
        checks,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks, errors }));
} catch (e) {
  console.log(JSON.stringify({ checks, errors, error: e.message }));
  if (page) console.log((await page.locator("body").innerText()).slice(-2200));
  throw e;
} finally {
  if (app) await app.close();
  await rm(dir, { recursive: true, force: true });
}
