import { _electron as electron } from "playwright-core";
import {
  mkdtemp,
  rm,
  mkdir,
  writeFile,
  readFile,
  lstat,
} from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
const dir = await mkdtemp(path.join(tmpdir(), "badawi-managed-ui-")),
  root = path.join(dir, "Workspace");
await mkdir(root);
const checks = [],
  errors = [];
let app, page;
try {
  const env = {
    ...process.env,
    BADAWI_DATA_DIR: path.join(dir, "data"),
    BADAWI_BACKGROUND: "1",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: ["."], env });
  page = await app.firstWindow();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("button", { name: "الملفات", exact: true }).click();
  await page
    .getByLabel("مسار مساحة العمل المنظّمة", { exact: true })
    .fill(root);
  await page
    .getByRole("button", { name: "إنشاء Files وProjects", exact: true })
    .click();
  await assert.rejects(lstat(path.join(root, "Files")));
  await page
    .getByRole("button", { name: "إنشاء المساحة", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "تنظيم ملفات العمل", exact: true })
    .waitFor();
  assert.ok((await lstat(path.join(root, "Files", "Inbox"))).isDirectory());
  assert.ok((await lstat(path.join(root, "Projects"))).isDirectory());
  checks.push(
    "Workspace creates separate Files/Projects and Inbox after explicit UI confirmation",
  );
  await writeFile(path.join(root, "Files", "design.txt"), "real design bytes");
  await page
    .getByRole("button", { name: "تشغيل المحرك وقراءة الملفات", exact: true })
    .click();
  await page
    .getByRole("button", { name: "design.txt", exact: false })
    .waitFor();
  await page.getByRole("button", { name: "مجلد جديد", exact: true }).click();
  await page
    .getByLabel("المسار الجديد داخل Files", { exact: true })
    .fill("Designs");
  await page
    .getByRole("button", { name: "معاينة التغيير", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "تنفيذ تغيير الملفات؟", exact: true })
    .waitFor();
  await assert.rejects(lstat(path.join(root, "Files", "Designs")));
  await page
    .getByRole("button", { name: "تنفيذ التغيير المعروض", exact: true })
    .click();
  await page.getByRole("button", { name: "Designs/", exact: false }).waitFor();
  checks.push(
    "Empty folder appears after preview and confirmed real filesystem creation",
  );
  await page.evaluate(
    async (p) => window.badawi.command({ op: "workspace.add", path: p }),
    path.join(root, "Projects"),
  );
  await page.getByRole("button", { name: "design.txt", exact: false }).click();
  await page.getByLabel("تصنيف الملف", { exact: true }).selectOption("design");
  await page.getByLabel("وسوم الملف", { exact: true }).fill("logo, draft");
  await page.getByRole("checkbox", { name: "Projects", exact: true }).check();
  await page
    .getByRole("button", { name: "حفظ تصنيف الملف", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "حُفظ التصنيف والروابط دون تغيير الملف" })
    .waitFor();
  const registry = await page.evaluate(async () => {
    const r = await window.badawi.command({ op: "snapshot" });
    return r.ok
      ? r.data.projects.find((p) => p.kind === "workfiles").fileEntries
      : null;
  });
  assert.equal(registry[0].category, "design");
  assert.deepEqual(registry[0].tags, ["logo", "draft"]);
  assert.equal(registry[0].linkedProjectIds.length, 1);
  checks.push(
    "File classification and logical project link persist without duplicating its bytes",
  );
  await page
    .getByRole("button", { name: "نقل / إعادة تسمية الملف", exact: true })
    .click();
  await page
    .getByLabel("المسار الجديد داخل Files", { exact: true })
    .fill("Designs/renamed.txt");
  await page
    .getByRole("button", { name: "معاينة التغيير", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "تنفيذ تغيير الملفات؟", exact: true })
    .waitFor();
  assert.equal(
    await readFile(path.join(root, "Files", "design.txt"), "utf8"),
    "real design bytes",
  );
  await page
    .getByRole("button", { name: "تنفيذ التغيير المعروض", exact: true })
    .click();
  await page.waitForTimeout(300);
  assert.equal(
    await readFile(path.join(root, "Files", "Designs", "renamed.txt"), "utf8"),
    "real design bytes",
  );
  await assert.rejects(lstat(path.join(root, "Files", "design.txt")));
  checks.push(
    "Reviewed move preserves exact bytes and removes original only after verification",
  );
  await page.getByRole("button", { name: "Designs/", exact: false }).click();
  await page.getByRole("button", { name: "renamed.txt", exact: false }).click();
  await page.getByText("real design bytes", { exact: true }).waitFor();
  checks.push("Moved file opens from its new folder");
  await page.getByLabel("نطاق البحث", { exact: true }).selectOption("content");
  await page
    .getByRole("button", { name: "بناء فهرس المحتوى", exact: true })
    .click();
  await page.getByText(/فُهرس 1 ملف/).waitFor();
  await page
    .getByRole("textbox", { name: "بحث داخل الملفات", exact: true })
    .fill("real design");
  await page
    .getByRole("button", { name: "بحث داخل الملفات", exact: true })
    .click();
  await page
    .locator(".file-search-results")
    .getByText("Designs/renamed.txt:1", { exact: true })
    .waitFor();
  checks.push(
    "Content index is built and queried through the renderer with source-line evidence",
  );
  assert.deepEqual(errors, []);
  await page.screenshot({ path: "test-results/workfiles.png" });
  await writeFile(
    "docs/validation/workfiles-desktop.json",
    JSON.stringify({ date: new Date().toISOString(), checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors }));
} catch (e) {
  console.log(JSON.stringify({ checks, errors, error: e.message }));
  if (page) console.log((await page.locator("body").innerText()).slice(-1800));
  throw e;
} finally {
  if (app) await app.close();
  await rm(dir, { recursive: true, force: true });
}
