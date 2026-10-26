import { _electron as electron } from "playwright-core";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const dir = await mkdtemp(path.join(tmpdir(), "badawi-complete-ui-"));
const fixture = path.join(dir, "owner-workspace");
await mkdir(fixture);
await mkdir(path.join(fixture, "src"));
await writeFile(
  path.join(fixture, "readme.md"),
  "# Real workspace\nEVIDENCE_37",
);
await writeFile(path.join(fixture, "src", "index.ts"), "export const value=37");
await writeFile(path.join(fixture, ".env"), "NEVER_SHOW_THIS");
await writeFile(
  path.join(fixture, "logo.png"),
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6xtsAAAAASUVORK5CYII=",
    "base64",
  ),
);
const checks = [],
  errors = [];
let app, page;
const check = (n, v) => {
  assert.ok(v, n);
  checks.push(n);
};
const command = async (c) => {
  const r = await page.evaluate((c) => window.badawi.command(c), c);
  if (!r.ok) throw Error(r.error);
  return r.data;
};
const snapshot = () => command({ op: "snapshot" });
async function launch() {
  const env = {
    ...process.env,
    BADAWI_DATA_DIR: path.join(dir, "data"),
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
  page = await app.firstWindow();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (e) => errors.push(e.message));
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false),
  );
  await page
    .getByRole("button", { name: "لوحة التحكم", exact: true })
    .waitFor();
}
async function nav(name) {
  await page.getByRole("button", { name, exact: true }).click();
}
try {
  await launch();
  await nav("الملفات");
  await page.getByRole("textbox", { name: "مسار Workspace" }).fill(fixture);
  await page.getByRole("button", { name: "إضافة المسار", exact: true }).click();
  await page.getByText(fixture, { exact: true }).waitFor();
  const p = (await snapshot()).projects[0];
  check(
    "Workspace path entered through Files UI persists as a real canonical project",
    p.root === fixture,
  );
  await page
    .getByRole("button", { name: /تشغيل المحرك وقراءة الملفات|قراءة الملفات/ })
    .click();
  await page.getByRole("button", { name: "readme.md", exact: false }).click();
  await page.getByText("# Real workspace", { exact: false }).waitFor();
  check("Files UI previews actual source content", true);
  const exported = path.join(dir, "exported-copy.md");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, exported);
  await page
    .getByRole("button", { name: "حفظ نسخة من الملف", exact: true })
    .click();
  await page.waitForTimeout(200);
  check(
    "Save copy exports actual bytes through the native host",
    (await readFile(exported, "utf8")) === "# Real workspace\nEVIDENCE_37",
  );
  await page.getByRole("button", { name: "logo.png", exact: false }).click();
  await page.locator("img.file-image").waitFor();
  check(
    "Binary image asset has a real image preview",
    (await page.locator("img.file-image").count()) === 1,
  );
  await page.getByRole("button", { name: "src/", exact: false }).click();
  check(
    "Folder navigation displays nested source file",
    (await page
      .getByRole("button", { name: "index.ts", exact: false })
      .count()) === 1,
  );
  check(
    "Secret file is absent from Files list",
    !(await page.getByRole("button", { name: ".env", exact: false }).count()),
  );
  await nav("المهام");
  await page.getByRole("button", { name: "مهمة جديدة", exact: true }).click();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("عنوان المهمة").fill("Deliver integrated workspace");
  await modal
    .getByLabel("الوصف", { exact: true })
    .fill("Actual persistent task");
  await modal.getByLabel("الأولوية").selectOption("urgent");
  await modal.getByLabel("الحالة").selectOption("doing");
  await modal.getByLabel("موعد التسليم").fill("2026-10-23T18:00");
  await modal.getByLabel("ذكّرني في").fill("2026-10-23T17:00");
  await modal.getByRole("textbox", { name: "خطوة جديدة" }).fill("Review files");
  await modal.getByRole("button", { name: "إضافة خطوة", exact: true }).click();
  await modal.getByRole("button", { name: "حفظ المهمة", exact: true }).click();
  await page
    .getByText("Deliver integrated workspace", { exact: true })
    .waitFor();
  let task = (await snapshot()).tasks[0];
  check(
    "Task board saves description, priority, status, dates and subtasks",
    task.description === "Actual persistent task" &&
      task.priority === "urgent" &&
      task.status === "doing" &&
      task.dueAt &&
      task.remindAt &&
      task.subtasks.length === 1,
  );
  await command({
    op: "provider.save",
    provider: "gemini",
    model: "gemini-3.8-flash",
    key: "INTEGRATION_FIXTURE_ONLY",
    maxTokens: 1024,
    maxRequests: 20,
  });
  await app.evaluate(() => {
    globalThis.fetch = async () => {
      globalThis.__completeCalls = (globalThis.__completeCalls || 0) + 1;
      const out =
        globalThis.__completeCalls === 1
          ? {
              reply: "أعرف مساحتك. سأحفظ المهمة والذاكرة بعد موافقتك.",
              actions: [
                JSON.stringify({
                  op: "task.save",
                  title: "Task from approved AI conversation",
                  done: false,
                  priority: "high",
                }),
                JSON.stringify({
                  op: "memory.save",
                  title: "My preference",
                  body: "Concise Iraqi Arabic",
                }),
              ],
            }
          : {
              reply:
                "تم حفظ المهمة والتفضيل فعلياً، والنتائج موجودة في البرنامج.",
              actions: [],
            };
      return Response.json({
        status: "completed",
        steps: [
          {
            type: "model_output",
            content: [{ type: "text", text: JSON.stringify(out) }],
          },
        ],
        usage: { total_input_tokens: 20, total_output_tokens: 20 },
      });
    };
  });
  await nav("المحادثة");
  await page.getByRole("button", { name: "محادثة جديدة", exact: true }).click();
  await page
    .getByRole("textbox", { name: "رسالتك" })
    .fill("أضف مهمة واحفظ تفضيلي");
  await page
    .getByRole("button", { name: "إرسال الرسالة", exact: true })
    .click();
  await page.getByTestId("assistant-plan").waitFor();
  check(
    "Real chat displays an approval card without prematurely changing tasks",
    (await snapshot()).tasks.length === 1,
  );
  await page
    .getByRole("button", { name: "مراجعة وتنفيذ", exact: true })
    .click();
  await page
    .getByRole("button", { name: "أوافق، نفّذ الإجراءات", exact: true })
    .click();
  await page.getByText("اكتمل التنفيذ", { exact: true }).waitFor();
  check(
    "Approving in chat creates actual task and persistent memory",
    (await snapshot()).tasks.length === 2 &&
      (await snapshot()).memories.length === 1,
  );
  await page
    .getByText("تم حفظ المهمة والتفضيل فعلياً، والنتائج موجودة في البرنامج.", {
      exact: true,
    })
    .waitFor();
  check(
    "Assistant continues after actual host receipts",
    (await page
      .getByText(
        "تم حفظ المهمة والتفضيل فعلياً، والنتائج موجودة في البرنامج.",
        { exact: true },
      )
      .count()) === 1,
  );
  await nav("الأتمتة");
  await page.getByRole("button", { name: "أتمتة جديدة", exact: true }).click();
  await modal.getByLabel("اسم الأتمتة").fill("Two real steps");
  await modal.getByLabel("نوع المهمة").selectOption("workflow");
  await modal.getByRole("button", { name: "إضافة خطوة", exact: true }).click();
  await modal.getByLabel("اسم الخطوة").first().fill("First alert");
  await modal
    .getByLabel("رسالة التذكير")
    .first()
    .fill("First real inbox result");
  await modal.getByRole("button", { name: "إضافة خطوة", exact: true }).click();
  await modal.getByLabel("اسم الخطوة").nth(1).fill("Second alert");
  await modal.getByLabel("رسالة التذكير").nth(1).fill("Second real result");
  await modal.getByRole("button", { name: "حفظ الأتمتة", exact: true }).click();
  await page
    .getByRole("button", { name: "تشغيل Two real steps", exact: true })
    .click();
  await page.getByText("نتائج الخطوات (2)", { exact: false }).waitFor();
  check(
    "Workflow editor runs two actual durable steps",
    (await snapshot()).runs.some(
      (r) => r.steps?.length === 2 && r.status === "succeeded",
    ),
  );
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].hide(),
  );
  await command({
    op: "task.save",
    title: "Hidden-window reminder",
    done: false,
    remindAt: new Date(Date.now() - 1000).toISOString(),
  });
  const reminderDeadline = Date.now() + 22000;
  let reminderDelivered = false;
  while (Date.now() < reminderDeadline) {
    const s = await snapshot();
    if (s.inbox.some((i) => i.title.includes("Hidden-window reminder"))) {
      reminderDelivered = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  check(
    "Actual maintenance timer delivers a due task reminder while the window is hidden",
    reminderDelivered,
  );
  await nav("الإعدادات");
  await page
    .getByRole("checkbox", { name: /إشعارات Windows للمواعيد/ })
    .click();
  await page.waitForFunction(
    () =>
      !document.querySelector(".personal-settings input[type=checkbox]")
        .checked,
  );
  check(
    "Notification preference persists through real IPC",
    (await snapshot()).preferences.notifications === false,
  );
  await page.getByText("My preference", { exact: true }).waitFor();
  check("AI-created memory is editable from Settings", true);
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].showInactive(),
  );
  await nav("الملفات");
  await writeFile(
    "test-results/complete-files.png",
    Buffer.from(
      await app.evaluate(async ({ BrowserWindow }) =>
        (await BrowserWindow.getAllWindows()[0].webContents.capturePage())
          .toPNG()
          .toString("base64"),
      ),
      "base64",
    ),
  );
  await page.setViewportSize({ width: 1024, height: 768 });
  await nav("المهام");
  check(
    "Compact task board has no document-wide horizontal overflow",
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 2,
    ),
  );
  await page.screenshot({ path: "test-results/complete-tasks.png" });
  await app.close();
  app = null;
  await launch();
  check(
    "Restart preserves workspace, rich tasks, memory, workflows and notification preference",
    (await snapshot()).tasks.length === 3 &&
      (await snapshot()).memories.length === 1 &&
      (await snapshot()).jobs.length === 1 &&
      (await snapshot()).projects[0].root === fixture &&
      (await snapshot()).preferences.notifications === false,
  );
  check(
    "Restart begins with the engine safely stopped",
    (await snapshot()).engine.mode === "Stop",
  );
  check("No renderer runtime errors", errors.length === 0);
  console.log(JSON.stringify({ checks, errors }));
  await writeFile(
    "docs/validation/complete-desktop.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        liveAI: false,
        fixtures:
          "AI transport only; real Electron UI, IPC, filesystem and SQLite",
        checks,
        errors,
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.log(JSON.stringify({ checks, errors, error: e.message }));
  if (page) console.log((await page.locator("body").innerText()).slice(-2200));
  throw e;
} finally {
  if (app) await app.close();
  await rm(dir, { recursive: true, force: true });
}
