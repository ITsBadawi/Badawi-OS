import { _electron as electron } from "playwright-core";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const dir = await mkdtemp(path.join(tmpdir(), "badawi-localization-")),
  checks = [],
  errors = [];
let app, page;
const env = {
  ...process.env,
  BADAWI_DATA_DIR: path.join(dir, "data"),
  BADAWI_BACKGROUND: "1",
};
delete env.ELECTRON_RUN_AS_NODE;
const command = async (c) => {
  const r = await page.evaluate((c) => window.badawi.command(c), c);
  if (!r.ok) throw Error(r.error);
  return r.data;
};
async function launch(language) {
  app = await electron.launch({ args: ["."], env });
  page = await app.firstWindow();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page
    .getByRole("button", {
      name: language === "en" ? "Dashboard" : "لوحة التحكم",
      exact: true,
    })
    .waitFor();
  await app.evaluate(() => {
    globalThis.__localeRequests = 0;
    globalThis.fetch = async () => {
      globalThis.__localeRequests++;
      throw Error("No network permitted");
    };
  });
}
const navigate = (name) =>
  page.locator(".sidebar").getByRole("button", { name, exact: true }).click();
async function assertEnglish() {
  const leaks = await page.evaluate(() => {
    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
      ),
      found = [];
    while (walker.nextNode()) {
      const node = walker.currentNode,
        el = node.parentElement,
        text = node.textContent.trim();
      if (
        !el ||
        el.closest("option,script,style") ||
        !el.checkVisibility() ||
        !/[\u0600-\u06ff]/.test(text)
      )
        continue;
      const stripped = text
        .replaceAll("عنوان المستخدم", "OWNER")
        .replaceAll("ملاحظة المستخدم", "OWNER")
        .replaceAll("مهمة المستخدم", "OWNER")
        .replaceAll("مشروع المستخدم", "OWNER");
      if (/[\u0600-\u06ff]/.test(stripped)) found.push(text);
    }
    return [...new Set(found)];
  });
  assert.deepEqual(leaks, [], "Untranslated visible app labels");
}
try {
  await launch("ar");
  await mkdir(path.join(dir, "project"));
  await command({
    op: "workspace.add",
    path: path.join(dir, "project"),
    name: "مشروع المستخدم",
  });
  await command({
    op: "note.save",
    title: "عنوان المستخدم",
    body: "ملاحظة المستخدم",
  });
  await command({ op: "task.save", title: "مهمة المستخدم", done: false });
  await navigate("الإعدادات");
  await page.getByLabel("Language / اللغة", { exact: true }).selectOption("en");
  await page.getByRole("button", { name: "Settings", exact: true }).waitFor();
  await page
    .getByRole("status")
    .filter({ hasText: "App language saved" })
    .waitFor();
  assert.deepEqual(
    await page.evaluate(() => [
      document.documentElement.lang,
      document.documentElement.dir,
    ]),
    ["en", "ltr"],
  );
  await assertEnglish();
  checks.push(
    "Owner changes Arabic to English through actual Settings; labels, direction and success message update without changing engine or credentials",
  );
  await page.setViewportSize({width:1120,height:800});
  for (const name of [
    "Dashboard",
    "Tasks",
    "Chat",
    "Projects",
    "Files",
    "Notes",
    "Automation",
    "Inbox",
    "Backups",
    "Reports",
    "Verification log",
    "Settings",
  ]) {
    await navigate(name);
    await page.locator("main h1").waitFor();
    await assertEnglish();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Overflow on ${name}`,
    );
  }
  checks.push(
    "All twelve native pages display English app labels and fit the window, while Arabic owner titles remain unchanged",
  );
  await page.getByRole("button",{name:"Change appearance",exact:true}).click();
  await page.waitForFunction(()=>document.documentElement.dataset.theme==="dark");
  await page.locator("summary").filter({hasText:"Assistant tool policies"}).click();
  await assertEnglish();
  await page.getByRole("button",{name:"Change appearance",exact:true}).click();
  await page.waitForFunction(()=>document.documentElement.dataset.theme==="light");
  await page.keyboard.press("Control+k");
  await page.getByRole("dialog").waitFor();
  await page.getByRole("dialog").locator("input").fill("عنوان المستخدم");
  await page.getByRole("dialog").getByRole("button").filter({hasText:"عنوان المستخدم"}).waitFor();
  await assertEnglish();
  await page.getByRole("dialog").getByRole("button",{name:"Close",exact:true}).click();
  await page.keyboard.press("Control+j");
  await page.locator(".assistant-panel").waitFor();
  await assertEnglish();
  await page.keyboard.press("Escape");
  await page.locator(".assistant-panel").waitFor({state:"hidden"});
  const launcher = await page.locator(".assistant-launch").boundingBox();
  const sidebar = await page.locator(".sidebar").boundingBox();
  assert.ok(launcher.x>sidebar.x+sidebar.width,"English launcher stays outside the sidebar");
  checks.push("English light/dark modes, expanded tool permissions, real Ctrl+K search and side assistant work; launcher follows LTR layout");
  await navigate("Tasks");
  for (const view of ["List", "Calendar", "Kanban"]) {
    await page.getByRole("button", { name: view, exact: true }).click();
    assert.equal(
      await page
        .getByRole("button", { name: view, exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    await assertEnglish();
  }
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await assertEnglish();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  checks.push(
    "List, Calendar and Kanban switch correctly; the actual task editor and calendar labels are translated",
  );
  await navigate("Notes");
  await page.getByText("عنوان المستخدم", { exact: true }).first().click();
  assert.equal(await page.getByRole("dialog").locator("textarea").inputValue(),"ملاحظة المستخدم");
  const before = await command({ op: "snapshot" });
  assert.equal(before.notes[0].body, "ملاحظة المستخدم");
  assert.equal(before.tasks[0].title, "مهمة المستخدم");
  assert.equal(before.engine.mode, "Stop");
  await page.screenshot({
    path: "docs/validation/localization-english-notes.png",
    fullPage: true,
  });
  assert.equal(await app.evaluate(() => globalThis.__localeRequests), 0);
  await app.close();
  app = null;
  await launch("en");
  assert.equal((await command({ op: "snapshot" })).language, "en");
  await navigate("Settings");
  await page.getByLabel("Language / اللغة", { exact: true }).selectOption("ar");
  await page.getByRole("button", { name: "الإعدادات", exact: true }).waitFor();
  assert.deepEqual(
    await page.evaluate(() => [
      document.documentElement.lang,
      document.documentElement.dir,
    ]),
    ["ar", "rtl"],
  );
  assert.equal(
    (await command({ op: "snapshot" })).notes[0].body,
    "ملاحظة المستخدم",
  );
  checks.push(
    "English preference survives a real restart; switching back restores Arabic RTL and keeps exact original owner data",
  );
  assert.equal(await app.evaluate(() => globalThis.__localeRequests), 0);
  assert.deepEqual(errors, []);
  checks.push(
    "No external requests or renderer errors; all checks use an isolated synthetic profile",
  );
  await writeFile(
    "docs/validation/localization-desktop.json",
    JSON.stringify({ date: new Date().toISOString(), checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors }));
} catch (error) {
  if (page) {
    console.log(
      JSON.stringify({
        text: (await page.locator("body").innerText()).slice(-12000),
        errors,
      }),
    );
    await page
      .screenshot({
        path: "docs/validation/localization-failure.png",
        fullPage: true,
      })
      .catch(() => {});
  }
  throw error;
} finally {
  if (app) await app.close();
  await rm(dir, { recursive: true, force: true });
}
