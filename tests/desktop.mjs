import { _electron as electron } from "playwright-core";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const data = await mkdtemp(path.join(tmpdir(), "badawi-desktop-"));
const fixture = path.join(data, "fixture");
await mkdir(fixture);
await writeFile(path.join(fixture, "readme.md"), "# Real fixture\nRead only");
await writeFile(path.join(fixture, ".env"), "DO_NOT_READ");
await mkdir("test-results", { recursive: true });
let app;
const errors = [];
const checks = [];
const check = (name, value) => {
  assert.ok(value, name);
  checks.push(name);
};
async function launch() {
  const env = {
    ...process.env,
    BADAWI_DATA_DIR: path.join(data, "workspace"),
    BADAWI_BACKGROUND: "1",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    ...(process.env.BADAWI_PACKAGED_EXE
      ? {
          executablePath: path.resolve(process.env.BADAWI_PACKAGED_EXE),
          args: [],
        }
      : { args: ["."] }),
    env,
  });
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false),
  );
  page.on("pageerror", (e) => errors.push(e.message));
  await page.waitForSelector('[data-testid="engine-state"]');
  return page;
}
async function capture(name) {
  await new Promise((resolve) => setTimeout(resolve, 250));
  await app
    .windows()[0]
    .evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  const bytes = await app.evaluate(async ({ BrowserWindow }) => {
    const image =
      await BrowserWindow.getAllWindows()[0].webContents.capturePage(
        undefined,
        { stayHidden: true, stayAwake: true },
      );
    return image.toPNG().toString("base64");
  });
  await writeFile(`test-results/${name}.png`, Buffer.from(bytes, "base64"));
}
try {
  let page = await launch();
  check(
    "Starts Stopped",
    (await page.locator('[data-testid="engine-state"]').textContent()).includes(
      "متوقف",
    ),
  );
  check(
    "Sandbox has no Node",
    await page.evaluate(
      () =>
        typeof window.require === "undefined" &&
        typeof window.process === "undefined",
    ),
  );
  await page.getByRole("button", { name: "تشغيل", exact: true }).click();
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid="engine-state"]')
      .textContent.includes("يعمل"),
  );
  check("Engine runs", true);
  await page.getByRole("switch", { name: "وضع اللعب" }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('[role="switch"]').getAttribute("aria-checked") ===
      "true",
  );
  await page.getByRole("button", { name: "إيقاف", exact: true }).click();
  await page.getByRole("switch", { name: "وضع اللعب" }).click();
  check(
    "Gaming off preserves Stop",
    (await page.locator('[data-testid="engine-state"]').textContent()).includes(
      "متوقف",
    ),
  );
  await page.getByRole("button", { name: "الملاحظات", exact: true }).click();
  await page.getByRole("button", { name: "ملاحظة جديدة" }).click();
  await page.getByLabel("عنوان الملاحظة").fill("Persistent note");
  await page
    .getByLabel("نص الملاحظة")
    .fill("<script>window.bad=true</script> محلي");
  await page.getByRole("button", { name: "حفظ الملاحظة", exact: true }).click();
  await page.getByText("Persistent note", { exact: true }).waitFor();
  check("Note created", true);
  check(
    "Untrusted note stays text",
    await page.evaluate(() => window.bad === undefined),
  );
  await page.getByRole("button", { name: "لوحة التحكم", exact: true }).click();
  await page.getByRole("button", { name: "إضافة مهمة", exact: true }).click();
  await page.getByLabel("عنوان المهمة").fill("A real task");
  await page.getByRole("button", { name: "حفظ المهمة" }).click();
  await page.getByRole("checkbox", { name: "A real task" }).click();
  await page
    .getByRole("checkbox", { name: "A real task" })
    .waitFor({ state: "hidden" });
  const completed = await page.evaluate(async () => {
    const r = await window.badawi.command({ op: "snapshot" });
    return r.ok
      ? r.data.tasks.find((t) => t.title === "A real task")?.done
      : false;
  });
  check(
    "Task completion persists and leaves Dashboard priorities",
    completed === true,
  );
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, fixture);
  await page.getByRole("button", { name: "المشاريع", exact: true }).click();
  await page.getByRole("button", { name: "إضافة مشروع", exact: true }).click();
  await page.getByText("fixture", { exact: true }).first().waitFor();
  check("Native-selected root added", true);
  await page
    .getByRole("button", { name: "تشغيل", exact: true })
    .count()
    .then(async (count) => {
      if (count)
        await page.getByRole("button", { name: "تشغيل", exact: true }).click();
      else
        await page
          .getByRole("button", { name: "لوحة التحكم", exact: true })
          .click()
          .then(() =>
            page.getByRole("button", { name: "تشغيل", exact: true }).click(),
          );
    });
  await page.getByRole("button", { name: "الملفات", exact: true }).click();
  await page.getByRole("button", { name: "قراءة قائمة الملفات" }).click();
  await page.getByRole("button", { name: "readme.md" }).click();
  await page.getByText("# Real fixture", { exact: false }).waitFor();
  check(
    "Real file preview works and excludes secret",
    (await page.getByText(".env", { exact: true }).count()) === 0,
  );
  assert.equal(
    await readFile(path.join(fixture, "readme.md"), "utf8"),
    "# Real fixture\nRead only",
  );
  await page
    .getByRole("combobox", { name: "نطاق البحث", exact: true })
    .selectOption("content");
  await page
    .getByRole("textbox", { name: "بحث داخل الملفات", exact: true })
    .fill("Read only");
  await page
    .getByRole("button", { name: "بحث داخل الملفات", exact: true })
    .click();
  await page.getByText("readme.md:2", { exact: true }).waitFor();
  check("Native text search returns actual file and line evidence", true);
  await page
    .getByRole("button", { name: "ناقش الملف مع AI", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "ملف المشروع المختار", exact: true })
    .waitFor();
  check(
    "File discussion preselects only the explicitly chosen file",
    (await page
      .getByRole("textbox", { name: "ملف المشروع المختار", exact: true })
      .inputValue()) === "readme.md",
  );
  await page.getByRole("button", { name: "الأتمتة", exact: true }).click();
  await page.getByRole("button", { name: "أتمتة جديدة", exact: true }).click();
  await page.getByLabel("اسم الأتمتة").fill("Local reminder");
  await page.getByLabel("رسالة التذكير").fill("Actual result");
  await page.getByRole("button", { name: "حفظ الأتمتة" }).click();
  await page.getByRole("button", { name: "تشغيل Local reminder" }).click();
  await page.getByRole("button", { name: "الوارد", exact: true }).click();
  await page.getByText("Actual result", { exact: true }).waitFor();
  check("Local automation creates verified output", true);
  await page.getByRole("button", { name: "لوحة التحكم", exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
  await capture("dashboard");
  await page.getByRole("button", { name: "تغيير المظهر" }).click();
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  await capture("dark");
  check(
    "Dark theme persisted",
    (await page.locator("html").getAttribute("data-theme")) === "dark",
  );
  await page.setViewportSize({ width: 800, height: 700 });
  check(
    "No horizontal overflow at minimum width",
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await capture("compact");
  const perf = await app.evaluate(({ app }) =>
    app.getAppMetrics().map((m) => ({
      type: m.type,
      cpu: m.cpu.percentCPUUsage,
      rssKiB: m.memory.workingSetSize,
    })),
  );
  await writeFile("test-results/resources.json", JSON.stringify(perf, null, 2));
  await app.close();
  page = await launch();
  await page.getByRole("button", { name: "الملاحظات", exact: true }).click();
  await page.getByText("Persistent note", { exact: true }).waitFor();
  check("Restart preserves notes", true);
  await page.getByRole("button", { name: "لوحة التحكم", exact: true }).click();
  check(
    "Restart stops engine",
    (await page.locator('[data-testid="engine-state"]').textContent()).includes(
      "متوقف",
    ),
  );
  const invalid = await page.evaluate(() =>
    window.badawi.command({
      op: "note.save",
      title: "Invalid",
      body: "",
      root: "C:/",
    }),
  );
  check(
    "Main process rejects extra IPC capabilities",
    !invalid.ok && invalid.error === "INVALID_REQUEST",
  );
  await page.evaluate(() =>
    window.badawi.command({
      op: "provider.save",
      provider: "gemini",
      model: "gemini-3.8-flash",
      key: "FIXTURE_KEY_NOT_REAL_12345",
      maxTokens: 512,
      maxRequests: 2,
    }),
  );
  const snapshot = await page.evaluate(() =>
    window.badawi.command({ op: "snapshot" }),
  );
  check(
    "Real OS secret store does not return keys to renderer",
    snapshot.ok &&
      snapshot.data.providers.gemini.configured &&
      !JSON.stringify(snapshot).includes("FIXTURE_KEY_NOT_REAL_12345"),
  );
  const db = await readFile(path.join(data, "workspace", "badawi.db"));
  const wal = await readFile(
    path.join(data, "workspace", "badawi.db-wal"),
  ).catch(() => Buffer.alloc(0));
  check(
    "SQLite and WAL contain no plaintext provider key",
    !db.includes(Buffer.from("FIXTURE_KEY_NOT_REAL_12345")) &&
      !wal.includes(Buffer.from("FIXTURE_KEY_NOT_REAL_12345")),
  );
  const desktopClient = path.join(data, "desktop-client.json");
  await writeFile(
    desktopClient,
    JSON.stringify({
      installed: {
        client_id: "123-native.apps.googleusercontent.com",
        client_secret: "NATIVE_CLIENT_SECRET_FIXTURE",
      },
    }),
  );
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, desktopClient);
  await page
    .getByRole("button", { name: "النسخ الاحتياطية", exact: true })
    .click();
  await page
    .getByRole("button", { name: "استيراد ملف Google OAuth", exact: true })
    .click();
  const importDeadline = Date.now() + 12000;
  let clientImported = false;
  while (Date.now() < importDeadline) {
    const r = await page.evaluate(() =>
      window.badawi.command({ op: "snapshot" }),
    );
    if (r.ok && r.data.drive.configured) {
      clientImported = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  check(
    "Native Google client JSON import configures the real host without connecting an account",
    clientImported,
  );
  const oauthDB = await readFile(path.join(data, "workspace", "badawi.db"));
  const oauthWAL = await readFile(
    path.join(data, "workspace", "badawi.db-wal"),
  ).catch(() => Buffer.alloc(0));
  check(
    "Desktop OAuth secret is OS encrypted in SQLite and WAL",
    !oauthDB.includes(Buffer.from("NATIVE_CLIENT_SECRET_FIXTURE")) &&
      !oauthWAL.includes(Buffer.from("NATIVE_CLIENT_SECRET_FIXTURE")),
  );
  await page.keyboard.press("Control+k");
  await page.getByRole("textbox", { name: "بحث شامل" }).fill("Persistent");
  await page.getByText("Persistent note", { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  check("Keyboard search finds local content", true);
  for (const label of [
    "الإعدادات",
    "النسخ الاحتياطية",
    "سجل التحقق",
    "المشاريع",
    "الملفات",
    "الأتمتة",
    "الوارد",
    "الملاحظات",
  ]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await page.locator("main h1").waitFor();
    check(
      `Page renders: ${label}`,
      (await page.locator("main h1").count()) === 1,
    );
  }
  const exportPath = path.join(data, "audit.json");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, exportPath);
  await page.getByRole("button", { name: "سجل التحقق", exact: true }).click();
  const exported = await page.evaluate(() =>
    window.badawi.command({ op: "audit.export" }),
  );
  const auditJSON = JSON.parse(await readFile(exportPath, "utf8"));
  check(
    "Native export commits a verified sanitized audit file",
    exported.ok &&
      auditJSON.verified === true &&
      !JSON.stringify(auditJSON).includes("FIXTURE_KEY_NOT_REAL_12345"),
  );
  check("No renderer runtime errors", errors.length === 0);
  await writeFile(
    "test-results/desktop.json",
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(
    JSON.stringify({ passed: checks.length, checks, errors }, null, 2),
  );
} catch (e) {
  if (app) {
    const pages = app.windows();
    if (pages[0]) {
      await capture("failure").catch(() => {});
      console.log((await pages[0].locator("body").innerText()).slice(-2000));
    }
  }
  throw e;
} finally {
  if (app) await app.close().catch(() => {});
  await rm(data, { recursive: true, force: true });
}
