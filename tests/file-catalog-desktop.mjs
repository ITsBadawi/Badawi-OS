import { _electron as electron } from "playwright-core";
import {
  mkdtemp,
  rm,
  mkdir,
  writeFile,
  readFile,
  lstat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const dir = await mkdtemp(path.join(tmpdir(), "badawi-catalog-ui-")),
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
  await page.getByRole("button", { name: "الملفات", exact: true }).waitFor();
  await app.evaluate(() => {
    globalThis.__catalogRequests = 0;
    globalThis.fetch = async () => {
      globalThis.__catalogRequests++;
      throw Error("No remote request permitted");
    };
  });
}
try {
  await launch();
  const base = path.join(dir, "Workspace");
  await mkdir(base);
  const work = await cmd({ op: "workspace.create", path: base, inbox: true });
  const codeDir = path.join(base, "Projects", "Code");
  await mkdir(codeDir);
  const code = await cmd({
    op: "workspace.add",
    path: codeDir,
    name: "Code fixture",
  });
  await writeFile(
    path.join(base, "Files", "Inbox", "brief.md"),
    "Owner approved phrase\nExact source evidence",
  );
  await writeFile(
    path.join(base, "Files", "logo.png"),
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lZkAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  await writeFile(path.join(base, "Files", ".env"), "DO_NOT_CATALOG");
  await mkdir(path.join(base, "Files", "Documents"));
  await writeFile(path.join(codeDir, "main.ts"), "const untouchedSource = 37;");
  await writeFile(
    path.join(codeDir, "private-sibling.ts"),
    "const PRIVATE_SIBLING_CONTENT = 99;",
  );
  await page.getByRole("button", { name: "الملفات", exact: true }).click();
  const catalog = page.locator(".central-catalog");
  await catalog
    .getByLabel("مصدر الفهرس المركزي", { exact: true })
    .selectOption(work.id);
  assert.ok(
    await catalog
      .getByRole("button", {
        name: "تحديث قائمة المصادر المعروضة",
        exact: true,
      })
      .isDisabled(),
  );
  const state = await cmd({ op: "snapshot" });
  await cmd({ op: "engine.mode", mode: "Running", epoch: state.engine.epoch });
  await catalog
    .getByRole("button", { name: "تحديث قائمة المصادر المعروضة", exact: true })
    .click();
  await catalog.getByRole("button", { name: /Inbox\/brief.md/ }).waitFor();
  assert.equal(
    await catalog.getByRole("button", { name: /main.ts/ }).count(),
    0,
  );
  assert.equal(await catalog.getByText(".env", { exact: false }).count(), 0);
  checks.push(
    "Native central catalog refresh is gated by engine mode, reads real managed Files and excludes project code and secrets",
  );
  await catalog
    .getByRole("button", { name: "تنظيم Inbox", exact: true })
    .click();
  await catalog
    .getByRole("button", { name: "بحث في الفهرس", exact: true })
    .click();
  await catalog.getByRole("button", { name: /Inbox\/brief.md/ }).click();
  await page
    .locator(".file-preview pre")
    .filter({ hasText: "Owner approved phrase" })
    .waitFor();
  await page
    .getByLabel("تصنيف الملف", { exact: true })
    .selectOption("document");
  await page.getByLabel("وسوم الملف", { exact: true }).fill("client");
  await page
    .getByRole("checkbox", { name: "Code fixture", exact: true })
    .check();
  await page
    .getByRole("button", { name: "حفظ تصنيف الملف", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "حُفظ التصنيف والروابط دون تغيير الملف" })
    .waitFor();
  await catalog
    .getByRole("button", { name: "بحث في الفهرس", exact: true })
    .click();
  await catalog
    .getByRole("button", { name: /Inbox\/brief.md/ })
    .waitFor({ state: "hidden" });
  checks.push(
    "Inbox workflow discovers an unclassified real file, opens exact bytes, saves category/tag/logical project link and removes it from the pending classification filter",
  );
  await page
    .getByRole("button", { name: "نقل / إعادة تسمية الملف", exact: true })
    .click();
  await page
    .getByLabel("المسار الجديد داخل Files", { exact: true })
    .fill("Documents/brief.md");
  await page
    .getByRole("button", { name: "معاينة التغيير", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "تنفيذ تغيير الملفات؟", exact: true })
    .waitFor();
  assert.equal(
    await readFile(path.join(base, "Files", "Inbox", "brief.md"), "utf8"),
    "Owner approved phrase\nExact source evidence",
  );
  await page
    .getByRole("button", { name: "تنفيذ التغيير المعروض", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "تنفيذ تغيير الملفات؟", exact: true })
    .waitFor({ state: "hidden" });
  assert.equal(
    await readFile(path.join(base, "Files", "Documents", "brief.md"), "utf8"),
    "Owner approved phrase\nExact source evidence",
  );
  await assert.rejects(lstat(path.join(base, "Files", "Inbox", "brief.md")));
  await catalog
    .getByRole("checkbox", { name: "ملفات Inbox فقط", exact: true })
    .uncheck();
  await catalog
    .getByLabel("تصنيف البحث المركزي", { exact: true })
    .selectOption("document");
  await catalog.getByLabel("وسم البحث المركزي", { exact: true }).fill("client");
  await catalog
    .getByLabel("المشروع المرتبط بالملفات", { exact: true })
    .selectOption(code.id);
  await catalog.getByLabel("امتداد الملف المركزي", { exact: true }).fill("md");
  await catalog
    .getByLabel("مصدر الفهرس المركزي", { exact: true })
    .selectOption(work.id);
  await catalog
    .getByRole("button", { name: "تحديث قائمة المصادر المعروضة", exact: true })
    .click();
  await catalog.getByRole("button", { name: /Documents\/brief.md/ }).waitFor();
  assert.equal(
    await catalog.getByRole("button", { name: /Inbox\/brief.md/ }).count(),
    0,
  );
  checks.push(
    "Reviewed move preserves bytes and logical project metadata; central category/tag/extension/project filters find only the new path after refresh",
  );
  await catalog
    .getByLabel("طريقة البحث المركزي", { exact: true })
    .selectOption("content");
  await catalog
    .getByLabel("عبارة البحث المركزي", { exact: true })
    .fill("approved phrase");
  await catalog
    .getByRole("button", { name: "فهرسة محتوى المصدر المحدد", exact: true })
    .click();
  await catalog.getByRole("button", { name: /Documents\/brief.md/ }).waitFor();
  await catalog
    .getByText("1: Owner approved phrase", { exact: false })
    .waitFor();
  checks.push(
    "Central content search reads actual indexed text with its line and source timestamps rather than fabricated snippets",
  );
  await catalog
    .getByLabel("مساحة البحث المركزي", { exact: true })
    .selectOption("projects");
  await catalog
    .getByLabel("طريقة البحث المركزي", { exact: true })
    .selectOption("name");
  await catalog.getByLabel("عبارة البحث المركزي", { exact: true }).fill("");
  await catalog.getByLabel("امتداد الملف المركزي", { exact: true }).fill("");
  await catalog
    .getByLabel("تصنيف البحث المركزي", { exact: true })
    .selectOption("");
  await catalog.getByLabel("وسم البحث المركزي", { exact: true }).fill("");
  await catalog
    .getByLabel("المشروع المرتبط بالملفات", { exact: true })
    .selectOption("");
  await catalog
    .getByLabel("مصدر الفهرس المركزي", { exact: true })
    .selectOption(code.id);
  await catalog
    .getByRole("button", { name: "تحديث قائمة المصادر المعروضة", exact: true })
    .click();
  await catalog.getByRole("button", { name: /main.ts/ }).click();
  await page
    .locator(".file-preview pre")
    .filter({ hasText: "const untouchedSource = 37;" })
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "مجلد جديد", exact: true }).count(),
    0,
  );
  assert.equal(
    await readFile(path.join(codeDir, "main.ts"), "utf8"),
    "const untouchedSource = 37;",
  );
  checks.push(
    "Projects catalog opens the actual code reader, hides work-file mutation controls and leaves source bytes unchanged",
  );
  await cmd({ op: "files.index", projectId: code.id });
  await cmd({
    op: "provider.save",
    provider: "gemini",
    model: "gemini-3.8-flash",
    key: "NATIVE_SELECTED_SCOPE_FIXTURE",
    maxTokens: 256,
    maxRequests: 5,
  });
  await app.evaluate(() => {
    globalThis.__scopePayloads = [];
    globalThis.fetch = async (input, init) => {
      if (
        new URL(String(input)).origin !==
        "https://generativelanguage.googleapis.com"
      )
        throw Error("Unexpected remote request");
      globalThis.__scopePayloads.push(String(init.body));
      const response =
        globalThis.__scopePayloads.length === 1
          ? {
              reply: "Checking selected file only",
              actions: [
                JSON.stringify({
                  op: "files.catalog",
                  space: "all",
                  mode: "content",
                  query: "const",
                }),
              ],
            }
          : { reply: "Selected file scope verified", actions: [] };
      return Response.json({
        status: "completed",
        steps: [
          {
            type: "model_output",
            content: [{ type: "text", text: JSON.stringify(response) }],
          },
        ],
      });
    };
  });
  await page
    .getByRole("button", { name: "ناقش الملف مع AI", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "رسالتك", exact: true })
    .fill("Explain only this selected file");
  await page
    .getByRole("button", { name: "إرسال الرسالة", exact: true })
    .click();
  await page
    .getByText("Selected file scope verified", { exact: true })
    .waitFor();
  const payloads = await app.evaluate(() => globalThis.__scopePayloads);
  assert.equal(payloads.length, 2);
  assert.ok(
    payloads.every(
      (p) =>
        !p.includes("PRIVATE_SIBLING_CONTENT") &&
        !p.includes("private-sibling.ts"),
    ),
  );
  assert.ok(payloads[1].includes("untouchedSource"));
  checks.push(
    "Actual file-discussion UI and two controlled provider rounds read only the selected file; the central content tool cannot send indexed sibling names or contents without an independent project grant",
  );
  await app.close();
  app = null;
  await launch();
  await page.getByRole("button", { name: "الملفات", exact: true }).click();
  const reopened = page.locator(".central-catalog");
  await reopened
    .getByLabel("مصدر الفهرس المركزي", { exact: true })
    .selectOption(work.id);
  await reopened
    .getByRole("button", { name: "بحث في الفهرس", exact: true })
    .click();
  await reopened.getByRole("button", { name: /Documents\/brief.md/ }).waitFor();
  assert.equal((await cmd({ op: "snapshot" })).engine.mode, "Stop");
  await rm(path.join(base, "Files", "Documents", "brief.md"));
  await reopened.getByRole("button", { name: /Documents\/brief.md/ }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "الملف لم يعد موجوداً في هذا المسار" })
    .waitFor();
  assert.equal(
    await page
      .locator(".file-preview pre")
      .filter({ hasText: "Owner approved phrase" })
      .count(),
    0,
  );
  checks.push(
    "Central cache and file metadata survive restart; a deleted cached result fails actual preview instead of displaying stale bytes as current",
  );
  await page.setViewportSize({ width: 1120, height: 800 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.equal(await app.evaluate(() => globalThis.__catalogRequests), 0);
  assert.deepEqual(errors, []);
  await page.screenshot({
    path: "docs/validation/file-catalog-desktop.png",
    fullPage: true,
  });
  await writeFile(
    "docs/validation/file-catalog-desktop.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        checks,
        errors,
        scope:
          "Real Electron UI, actual synthetic text/binary files, SQLite catalogs/indexes/classification, reviewed moves and restart; no owner source/profile or live network requests; two provider rounds use controlled transport",
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks, errors }));
} catch (error) {
  console.log(
    JSON.stringify({
      checks,
      errors,
      error: error.message,
      dialogs: await page.getByRole("dialog").allTextContents(),
      statuses: await page.getByRole("status").allTextContents(),
    }),
  );
  await page.screenshot({
    path: "docs/validation/file-catalog-failure.png",
    fullPage: true,
  });
  throw error;
} finally {
  if (app) await app.close();
  await rm(dir, { recursive: true, force: true });
}
