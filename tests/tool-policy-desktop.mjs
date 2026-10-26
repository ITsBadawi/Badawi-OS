import { _electron as electron } from "playwright-core";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const dir = await mkdtemp(path.join(tmpdir(), "badawi-policy-ui-")),
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
  await page.getByRole("button", { name: "الإعدادات", exact: true }).click();
  await page.getByText("سياسات أدوات المساعد", { exact: true }).click();
  await page
    .getByLabel("سياسة حفظ المهام", { exact: true })
    .selectOption("auto");
  await page
    .getByRole("button", {
      name: "أسمح بالتنفيذ التلقائي لهذه الأداة",
      exact: true,
    })
    .waitFor();
  assert.equal(
    (await command({ op: "snapshot" })).toolPolicies.find(
      (p) => p.op === "task.save",
    ).policy,
    "approval",
  );
  await page
    .getByRole("button", {
      name: "أسمح بالتنفيذ التلقائي لهذه الأداة",
      exact: true,
    })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "حُفظت سياسة الأداة" })
    .waitFor();
  assert.equal(
    (await command({ op: "snapshot" })).toolPolicies.find(
      (p) => p.op === "task.save",
    ).policy,
    "auto",
  );
  checks.push(
    "Automatic policy requires an explicit owner confirmation before persistence",
  );
  assert.equal(
    await page
      .getByLabel("سياسة تشغيل أوامر النظام", { exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(
    await page
      .getByLabel("سياسة حذف المهام", { exact: true })
      .locator('option[value="auto"]')
      .evaluate((el) => el.disabled),
    true,
  );
  checks.push(
    "System commands remain locked forbidden and deletion cannot be automatic",
  );
  await app.evaluate(() => {
    globalThis.fetch = async () =>
      Response.json({
        status: "completed",
        steps: [
          {
            type: "model_output",
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  reply: "Requested task action.",
                  actions: [
                    JSON.stringify({
                      op: "task.save",
                      title: "A policy-controlled native task",
                      done: false,
                    }),
                  ],
                }),
              },
            ],
          },
        ],
        usage: { total_input_tokens: 5, total_output_tokens: 5 },
      });
  });
  await command({
    op: "provider.save",
    provider: "gemini",
    key: "fixture",
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
  await page.getByRole("button", { name: "المحادثة", exact: true }).click();
  await page
    .getByRole("textbox", { name: "رسالتك" })
    .fill("Create my task under the policy I selected");
  await page
    .getByRole("button", { name: "إرسال الرسالة", exact: true })
    .click();
  await page.getByText("اكتمل التنفيذ", { exact: true }).waitFor();
  state = await command({ op: "snapshot" });
  assert.equal(state.tasks.length, 1);
  assert.ok(state.plans[0].automaticallyAuthorizedAt);
  assert.equal(state.plans[0].approvedAt, undefined);
  checks.push(
    "Real chat executes a scoped automatic task, persists the receipt and identifies policy authorization accurately",
  );
  await app.close();app=null;app=await electron.launch({args:['.'],env});page=await app.firstWindow();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));await page.getByRole('button',{name:'لوحة التحكم',exact:true}).waitFor();
  state=await command({op:'snapshot'});assert.equal(state.engine.mode,'Stop');assert.equal(state.tasks.length,1);assert.equal(state.plans[0].status,'completed');assert.equal(state.toolPolicies.find(p=>p.op==='task.save').policy,'auto');assert.equal(state.providers.gemini.usedToday,1);checks.push('Restart restores the explicit policy and receipt but never replays the automatic action or AI request');
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/validation/tool-policy-desktop.json",
    JSON.stringify(
      { date: new Date().toISOString(), liveProvider: false, checks, errors },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks, errors }));
} finally {
  if (app) await app.close();
  await rm(dir, { recursive: true, force: true });
}
