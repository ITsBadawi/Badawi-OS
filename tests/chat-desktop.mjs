import { _electron as electron } from "playwright-core";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const dir = await mkdtemp(path.join(tmpdir(), "badawi-chat-ui-"));
const live = !!process.env.BADAWI_TEST_GEMINI_KEY;
const model = process.env.BADAWI_TEST_MODEL || "gemini-3.8-flash";
let app;
let page;
const checks = [];
const errors = [];
const check = (name, value) => {
  assert.ok(value, name);
  checks.push(name);
};
const cmd = async (c) => {
  const r = await page.evaluate((c) => window.badawi.command(c), c);
  if (!r.ok) throw Error(r.error);
  return r.data;
};
async function capture(file) {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].showInactive(),
  );
  await page.locator(".chat-message").last().scrollIntoViewIfNeeded();
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.waitForTimeout(250);
  await page.screenshot({ path: file });
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].hide(),
  );
}
async function launch() {
  const env = { ...process.env, BADAWI_DATA_DIR: dir, BADAWI_BACKGROUND: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.BADAWI_TEST_GEMINI_KEY;
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
  if (!live)
    await app.evaluate(() => {
      globalThis.fetch = async (url, init) => {
        if (
          String(url) !==
          "https://generativelanguage.googleapis.com/v1beta/interactions"
        )
          throw Error("unexpected endpoint");
        const b = JSON.parse(init.body);
        if (b.store !== false || b.model !== "gemini-3.8-flash")
          throw Error("bad protocol");
        const text =
          typeof b.input === "string"
            ? b.input
            : b.input.at(-1).content[0].text;
        const out = text.startsWith("Propose ONE")
          ? JSON.stringify({
              name: "Reviewed reminder",
              kind: "reminder",
              message: "Review your notes",
              trigger: { type: "daily", time: "18:00", zone: "Asia/Baghdad" },
              missedPolicy: "skip",
            })
          : text.startsWith("Summarize the following")
            ? "Selected note summary."
            : text.includes("What number")
              ? b.input[0].content[0].text.includes("37")
                ? "37"
                : "CONTEXT_LOST"
              : "I will remember it.";
        return new Response(
          JSON.stringify({
            status: "completed",
            steps: [
              { type: "model_output", content: [{ type: "text", text: out }] },
            ],
            usage: { total_input_tokens: 10, total_output_tokens: 5 },
          }),
        );
      };
    });
}
try {
  await launch();
  await cmd({
    op: "provider.save",
    provider: "gemini",
    model,
    key: process.env.BADAWI_TEST_GEMINI_KEY || "DESKTOP_FIXTURE",
    maxTokens: 1024,
    maxRequests: 10,
  });
  await page.getByRole("button", { name: "المحادثة", exact: true }).click();
  await page.getByRole("button", { name: "محادثة جديدة", exact: true }).click();
  await page
    .getByRole("textbox", { name: "رسالتك" })
    .fill("Remember my number is 37. Reply briefly.");
  await page.getByRole("button", { name: "تشغيل المحرك", exact: true }).click();
  await page
    .getByRole("button", { name: "إرسال الرسالة", exact: true })
    .click();
  await page
    .locator('[data-chat-status="complete"], [data-chat-status="failed"]')
    .waitFor({ timeout: 150000 });
  if (await page.locator('[data-chat-status="failed"]').count())
    throw Error(await page.locator('[data-chat-status="failed"]').innerText());
  check("A real IPC send produces a persisted assistant turn", true);
  await page
    .getByRole("textbox", { name: "رسالتك" })
    .fill("What number did I ask you to remember? Reply with digits only.");
  await page
    .getByRole("button", { name: "إرسال الرسالة", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll('[data-chat-status="complete"]').length === 2 ||
      document.querySelector('[data-chat-status="failed"]'),
    {},
    { timeout: 150000 },
  );
  if (await page.locator('[data-chat-status="failed"]').count())
    throw Error(await page.locator('[data-chat-status="failed"]').innerText());
  check(
    "Follow-up remembers 37",
    (
      await page.locator(".chat-message.assistant").last().textContent()
    ).includes("37"),
  );
  await mkdir("test-results", { recursive: true });
  await capture(`test-results/chat-${live ? "live" : "fixture"}.png`);
  await app.close();
  app = null;
  await launch();
  await page.getByRole("button", { name: "المحادثة", exact: true }).click();
  await page.locator(".chat-thread").first().click();
  check(
    "Conversation survives a full app restart",
    (await page.locator(".chat-message").count()) === 4,
  );
  check(
    "The restored transcript still contains the real follow-up",
    (
      await page.locator(".chat-message.assistant").last().textContent()
    ).includes("37"),
  );
  check(
    "Restart respects Stop",
    (await cmd({ op: "snapshot" })).engine.mode === "Stop",
  );
  if (live) {
    const before = await cmd({ op: "snapshot" });
    await cmd({
      op: "engine.mode",
      mode: "Running",
      epoch: before.engine.epoch,
    });
    // Isolated test-workspace prices/cap are test controls, not the owner's account budget.
    await cmd({
      op: "provider.save",
      provider: "gemini",
      model,
      maxTokens: 1024,
      maxRequests: 10,
      budget: {
        dailyUSD: 0.1,
        inputPerMillion: 1,
        outputPerMillion: 10,
        date: new Date().toISOString().slice(0, 10),
      },
    });
    const note = await cmd({
      op: "note.save",
      title: "Live test note",
      body: "Test-only note: finish a draft, review it, and save the verified result. Summarize these three tasks.",
    });
    const job = await cmd({
      op: "job.save",
      name: "Live note summary",
      kind: "summary",
      provider: "gemini",
      noteIds: [note.id],
      allowBackgroundAI: true,
      enabled: true,
      trigger: { type: "manual" },
      missedPolicy: "skip",
    });
    await cmd({ op: "job.run", id: job.id });
    const after = await cmd({ op: "snapshot" });
    check(
      "Real Gemini note-summary creates a verified run and Inbox result",
      after.runs[0].status === "succeeded" &&
        after.inbox[0].body.length > 10 &&
        after.inbox[0].model === model,
    );
    check(
      "Real provider usage settles a local reservation",
      after.providers.gemini.budgetUsage.spentUSD > 0 &&
        after.providers.gemini.budgetUsage.heldUSD === 0,
    );
    await page
      .getByRole("button", { name: "اقتراح أتمتة", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        document.querySelector("dialog[open]") ||
        document.querySelector(".live-toast"),
      {},
      { timeout: 150000 },
    );
    if (!(await page.getByRole("dialog").count()))
      throw Error(await page.locator(".live-toast").innerText());
    check(
      "Real Gemini automation proposal opens an unsaved disabled draft",
      (await cmd({ op: "snapshot" })).jobs.length === 1 &&
        !(await page
          .getByRole("checkbox", { name: "تفعيل الجدولة بعد الحفظ" })
          .isChecked()),
    );
    await page
      .getByRole("button", { name: "حفظ الأتمتة", exact: true })
      .click();
    const saved = await cmd({ op: "snapshot" });
    check(
      "Reviewed live proposal saves as a disabled local automation",
      saved.jobs.length === 2 &&
        saved.jobs.some((j) => j.id !== job.id && !j.enabled),
    );
  }
  if (!live) {
    let snap = await cmd({ op: "snapshot" });
    await cmd({ op: "engine.mode", mode: "Running", epoch: snap.engine.epoch });
    await page
      .getByRole("button", { name: "اقتراح أتمتة", exact: true })
      .click();
    await page.getByRole("dialog").waitFor();
    check(
      "AI proposal is reviewed before saving",
      (await cmd({ op: "snapshot" })).jobs.length === 0,
    );
    check(
      "AI draft starts disabled",
      !(await page
        .getByRole("checkbox", { name: "تفعيل الجدولة بعد الحفظ" })
        .isChecked()),
    );
    await page.keyboard.press("Escape");
    await app.evaluate(() => {
      globalThis.savedFixtureFetch = globalThis.fetch;
      globalThis.fetch = async () =>
        Response.json({
          status: "completed",
          steps: [
            {
              type: "model_output",
              content: [{ type: "text", text: "not a supported draft" }],
            },
          ],
        });
    });
    await page
      .getByRole("button", { name: "اقتراح أتمتة", exact: true })
      .click();
    await page.getByTestId("draft-error").waitFor();
    await page.waitForTimeout(5500);
    check(
      "A failed draft keeps a visible explanation after the transient toast disappears",
      await page.getByTestId("draft-error").isVisible(),
    );
    await app.evaluate(() => {
      globalThis.fetch = globalThis.savedFixtureFetch;
    });
    await cmd({
      op: "provider.save",
      provider: "gemini",
      model,
      maxTokens: 1024,
      maxRequests: 10,
      budget: {
        dailyUSD: 0.1,
        inputPerMillion: 1,
        outputPerMillion: 10,
        date: "2026-10-21",
      },
    });
    await cmd({
      op: "note.save",
      title: "Recipe note",
      body: "This is the selected note.",
    });
    await page.getByRole("button", { name: "الأتمتة", exact: true }).click();
    await page
      .getByRole("button", { name: "أتمتة جديدة", exact: true })
      .click();
    await page
      .getByLabel("اسم الأتمتة", { exact: true })
      .fill("Summary fixture");
    await page
      .getByLabel("نوع المهمة", { exact: true })
      .selectOption("summary");
    await page
      .getByRole("checkbox", { name: "Recipe note", exact: true })
      .check();
    await page
      .getByRole("checkbox", { name: /أسمح بإرسال هذه النصوص/ })
      .check();
    await page
      .getByRole("checkbox", { name: "تفعيل الجدولة بعد الحفظ" })
      .check();
    await page
      .getByRole("button", { name: "حفظ الأتمتة", exact: true })
      .click();
    await page
      .getByRole("button", { name: "تشغيل Summary fixture", exact: true })
      .click();
    await page.getByRole("button", { name: "الوارد", exact: true }).click();
    await page.getByText("Selected note summary.", { exact: true }).waitFor();
    snap = await cmd({ op: "snapshot" });
    check(
      "Approved recipe reaches provider, Inbox and verified run",
      snap.runs[0].status === "succeeded" &&
        snap.inbox[0].body === "Selected note summary.",
    );
    check(
      "Budget settles reported usage",
      snap.providers.gemini.budgetUsage.spentUSD > 0 &&
        snap.providers.gemini.budgetUsage.heldUSD === 0,
    );
    const timed = await cmd({
      op: "job.save",
      name: "Timer fixture",
      kind: "reminder",
      message: "From the real timer",
      trigger: { type: "once", at: new Date(Date.now() + 1000).toISOString() },
      enabled: true,
      missedPolicy: "skip",
    });
    await page
      .getByText("From the real timer", { exact: true })
      .waitFor({ timeout: 25000 });
    snap = await cmd({ op: "snapshot" });
    check(
      "The real Node timer executes a once schedule into the Inbox",
      snap.runs.some((r) => r.jobId === timed.id && r.status === "succeeded"),
    );
    await page.getByRole("button", { name: "المحادثة", exact: true }).click();
    await cmd({ op: "theme.set", theme: "dark" });
    await page.waitForFunction(
      () =>
        document.documentElement.dataset.theme === "dark" &&
        document.querySelectorAll(".chat-message").length === 4,
    );
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1366, 768),
    );
    await page.waitForTimeout(300);
    check(
      "Chat has no horizontal overflow at 1366 pixels",
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await capture("test-results/chat-dark-compact.png");
  }
  check("No renderer runtime errors", errors.length === 0);
  await writeFile(
    `docs/validation/chat-${live ? "live" : "desktop"}.json`,
    JSON.stringify(
      { date: new Date().toISOString(), live, model, checks, errors },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ live, model, checks, errors }));
} catch (error) {
  await writeFile(
    `docs/validation/chat-${live ? "live" : "desktop"}.json`,
    JSON.stringify(
      {
        date: new Date().toISOString(),
        live,
        model,
        passed: false,
        checks,
        errors: [error.message],
      },
      null,
      2,
    ),
  );
  if (page) console.log((await page.locator("body").innerText()).slice(-4000));
  throw error;
} finally {
  if (app) await app.close();
  await rm(dir, { recursive: true, force: true });
}
