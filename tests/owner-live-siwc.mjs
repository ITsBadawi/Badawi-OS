import { _electron as electron } from "playwright-core";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";

const profile = await mkdtemp(path.join(tmpdir(), "badawi-owner-live-siwc-"));
const env = { ...process.env, BADAWI_DATA_DIR: profile };
delete env.BADAWI_BACKGROUND;
delete env.ELECTRON_RUN_AS_NODE;
let app, page, lastStatus = "";
async function launch() {
  app = await electron.launch({ args: ["."], env });
  page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  await page.getByRole("button", { name: "الإعدادات", exact: true }).click();
}
async function command(c) {
  const r = await page.evaluate((c) => window.badawi.command(c), c);
  if (!r.ok) throw Error(r.error);
  return r.data;
}
async function state() {
  const s = await command({ op: "snapshot" });
  return {
    status: s.chatgpt?.status,
    sharing: !!s.chatgpt?.sharing,
    error: s.chatgpt?.error || null,
    model: s.providers.chatgpt.model || null,
    engine: s.engine.mode,
  };
}
let ticker, input;
try {
  await launch();
  console.log(JSON.stringify({ event: "READY", profile, instruction: "Sign in using the official browser page opened from the test app" }));
  await page.getByRole("button", { name: "Continue with ChatGPT" }).click();
  ticker = setInterval(async () => {
    try {
      const s = await state();
      const next = JSON.stringify(s);
      if (next !== lastStatus) {
        lastStatus = next;
        console.log(JSON.stringify({ event: "STATUS", ...s }));
      }
    } catch (error) {
      console.log(JSON.stringify({ event: "STATUS_ERROR", code: error.message }));
    }
  }, 2000);
  input = readline.createInterface({ input: process.stdin, terminal: false });
  for await (const line of input) {
    try {
      if (line.trim() === "status") console.log(JSON.stringify({ event: "STATUS", ...(await state()) }));
      if (line.trim() === "models") {
        const models = await command({ op: "provider.models", provider: "chatgpt" });
        console.log(JSON.stringify({ event: "MODELS", models }));
      }
      if (line.trim() === "check") {
        const models = await command({ op: "provider.models", provider: "chatgpt" });
        if (!models.length) throw Error("NO_MODELS");
        const s = await command({ op: "snapshot" });
        await command({ op: "provider.save", provider: "chatgpt", model: models[0], maxTokens: 512, maxRequests: 10, budget: null });
        await command({ op: "engine.mode", mode: "Running", epoch: s.engine.epoch });
        const result = await command({ op: "provider.check", provider: "chatgpt" });
        console.log(JSON.stringify({ event: "CHECK", model: result.model, text: result.text.slice(0, 200) }));
      }
      if (line.trim() === "plan") {
        const models = await command({ op: "provider.models", provider: "chatgpt" });
        const model = models.find((item) => item === "gpt-6.1-sol") || models[0];
        if (!model) throw Error("NO_MODELS");
        await command({ op: "provider.save", provider: "chatgpt", model, maxTokens: 2048, maxRequests: 10, budget: null });
        const before = await command({ op: "snapshot" });
        if (before.engine.mode !== "Running")
          await command({ op: "engine.mode", mode: "Running", epoch: before.engine.epoch });
        const flexible = await command({
          op: "task.save", title: "Synthetic flexible report", done: false,
          dueAt: "2026-10-26T09:00:00Z",
        });
        const fixed = await command({
          op: "task.save", title: "Synthetic fixed release", done: false,
          dueAt: "2026-10-26T12:00:00Z", deadlineFixed: true,
        });
        const chat = await command({ op: "chat.create", provider: "chatgpt" });
        const result = await command({
          op: "chat.send", chatId: chat.id,
          text: "Plan my next two days from the current task list. First use task.list to inspect current tasks. Propose moving only Synthetic flexible report to 2026-10-27T09:00:00Z; leave Synthetic fixed release unchanged. Do not claim the move happened before I approve it.",
        });
        const assistant = result.messages.at(-1);
        const planned = (await command({ op: "snapshot" })).plans.find((item) => item.id === assistant.planId);
        console.log(JSON.stringify({
          event: "PLAN_PROPOSAL", model, reply: assistant.text?.slice(0, 500),
          readTaskList: !!assistant.toolReceipts?.some((receipt) => receipt.operation === "task.list"),
          actions: planned?.actions?.map((action) => action.command) || [],
          status: planned?.status || null,
        }));
        if (!planned || planned.status !== "pending" || planned.actions.length !== 1 ||
          planned.actions[0].command.op !== "task.save" ||
          planned.actions[0].command.id !== flexible.id ||
          planned.actions[0].command.dueAt !== "2026-10-27T09:00:00Z" ||
          planned.actions[0].command.confirmDeadlineChange)
          throw Error("PLAN_NOT_EXACT_SAFE_PROPOSAL");
        const unapproved = await command({ op: "snapshot" });
        if (unapproved.tasks.find((item) => item.id === flexible.id)?.dueAt !== "2026-10-26T09:00:00Z")
          throw Error("PLAN_CHANGED_TASK_BEFORE_APPROVAL");
        await command({ op: "assistant.execute", planId: planned.id });
        const approved = await command({ op: "snapshot" });
        if (approved.tasks.find((item) => item.id === flexible.id)?.dueAt !== "2026-10-27T09:00:00Z" ||
          approved.tasks.find((item) => item.id === fixed.id)?.dueAt !== "2026-10-26T12:00:00Z")
          throw Error("PLAN_APPROVAL_RESULT_MISMATCH");
        console.log(JSON.stringify({ event: "PLAN_SUCCESS", model, taskListRead: !!assistant.toolReceipts?.some((receipt) => receipt.operation === "task.list"), exactFlexibleChange: true, fixedDeadlineUnchanged: true }));
      }
      if (line.trim() === "restart") {
        await app.close();
        await launch();
        console.log(JSON.stringify({ event: "RESTART", ...(await state()) }));
      }
      if (line.trim() === "disconnect") {
        await command({ op: "provider.disconnect", provider: "chatgpt" });
        console.log(JSON.stringify({ event: "DISCONNECT", ...(await state()) }));
      }
      if (line.trim() === "quit") break;
    } catch (error) {
      console.log(JSON.stringify({ event: "COMMAND_ERROR", code: error.message }));
    }
  }
} finally {
  if (ticker) clearInterval(ticker);
  input?.close();
  process.stdin.pause();
  await app?.close().catch(() => {});
  await rm(profile, { recursive: true, force: true });
}
process.exit(0);
