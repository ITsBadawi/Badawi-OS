import { _electron as electron } from "playwright-core";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const dir = await mkdtemp(path.join(tmpdir(), "badawi-side-ai-")),
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
  app = await electron.launch({ args: ["."], env });
  page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("button", { name: "الملاحظات", exact: true }).click();
  await page
    .getByRole("button", { name: "المحادثة مع AI", exact: false })
    .click();
  await page
    .getByRole("complementary", { name: "مساعد Badawi الجانبي", exact: true })
    .waitFor();
  assert.equal(
    await page
      .locator('.nav-item[aria-current="page"]')
      .getAttribute("aria-label"),
    "الملاحظات",
  );
  checks.push(
    "Assistant opens beside the current page without navigating away",
  );
  await app.evaluate(() => {
    globalThis.__sideRequests = 0;
    globalThis.fetch = async (url, init) => {
      if (
        String(url) !==
        "https://generativelanguage.googleapis.com/v1beta/interactions"
      )
        throw Error("Unexpected endpoint");
      globalThis.__sideRequests++;
      globalThis.__sideLastInput = JSON.parse(init.body).input;
      return Response.json({
        status: "completed",
        steps: [
          {
            type: "model_output",
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  reply: "Your local assistant is connected.",
                  actions: [],
                }),
              },
            ],
          },
        ],
        usage: { total_input_tokens: 10, total_output_tokens: 10 },
      });
    };
  });
  await command({
    op: "provider.save",
    provider: "gemini",
    key: "fixture-secret",
    model: "fixture-model",
    maxTokens: 500,
    maxRequests: 20,
  });
  let state = await command({ op: "snapshot" });
  await command({
    op: "engine.mode",
    mode: "Running",
    epoch: state.engine.epoch,
  });
  await page
    .getByRole("textbox", { name: "رسالتك" })
    .fill("Hello from the side panel");
  await page
    .getByRole("button", { name: "إرسال الرسالة", exact: true })
    .click();
  await page
    .getByText("Your local assistant is connected.", { exact: true })
    .waitFor();
  assert.equal(await app.evaluate(() => globalThis.__sideRequests), 1);
  await page
    .getByRole("textbox", { name: "رسالتك" })
    .fill("Keep the previous message in context");
  await page
    .getByRole("button", { name: "إرسال الرسالة", exact: true })
    .click();
  await page
    .getByText("Your local assistant is connected.", { exact: true })
    .last()
    .waitFor();
  assert.equal(await app.evaluate(() => globalThis.__sideRequests), 2);
  assert.ok(
    (
      await app.evaluate(() => JSON.stringify(globalThis.__sideLastInput))
    ).includes("Hello from the side panel"),
  );
  await page.screenshot({
    path: "docs/validation/assistant-panel-desktop.png",
  });
  checks.push(
    "Side assistant uses real provider dispatch and persisted multi-turn chat",
  );
  await page
    .getByRole("button", { name: "فتح المحادثة كاملة", exact: true })
    .click();
  await page
    .getByText("Your local assistant is connected.", { exact: true })
    .last()
    .waitFor();
  assert.equal(
    await page
      .locator('.nav-item[aria-current="page"]')
      .getAttribute("aria-label"),
    "المحادثة",
  );
  checks.push("Full conversation continues the same side-panel history");
  await page.getByRole("button", { name: "الإعدادات", exact: true }).click();
  await page
    .getByLabel("مزود AI الافتراضي", { exact: true })
    .selectOption("openai");
  await page
    .getByRole("status")
    .filter({ hasText: "حُفظ مزوّدك الافتراضي" })
    .waitFor();
  assert.equal((await command({ op: "snapshot" })).defaultProvider, "openai");
  await page
    .getByRole("button", { name: "المحادثة مع AI", exact: false })
    .click();
  await page
    .getByRole("button", { name: "المحادثات والخدمة", exact: true })
    .click();
  assert.equal(
    await page
      .getByLabel("خدمة المحادثة الجديدة", { exact: true })
      .inputValue(),
    "openai",
  );
  assert.equal(await app.evaluate(() => globalThis.__sideRequests), 2);
  checks.push(
    "Explicit default-provider change controls new conversations without dispatching or changing old chats",
  );
  await page.keyboard.press("Escape");
  assert.equal(
    await page
      .getByRole("complementary", { name: "مساعد Badawi الجانبي", exact: true })
      .count(),
    0,
  );
  checks.push("Escape closes the assistant while preserving the current page");
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/validation/assistant-panel-desktop.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        liveProvider: false,
        transport:
          "Controlled Gemini response; real Electron UI, chat, IPC and persistence",
        checks,
        errors,
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
