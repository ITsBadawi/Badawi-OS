import { _electron as electron } from "playwright-core";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
let key = "";
for await (const chunk of process.stdin) key += chunk;
key = key.trim();
if (!key) throw Error("KEY_REQUIRED_ON_STDIN");
const dir = await mkdtemp(path.join(tmpdir(), "badawi-live-assistant-"));
let app;
const checks = [],
  modelChecks = [];
try {
  const env = { ...process.env, BADAWI_DATA_DIR: dir, BADAWI_BACKGROUND: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: ["."], env });
  const page = await app.firstWindow();
  await page
    .getByRole("button", { name: "لوحة التحكم", exact: true })
    .waitFor();
  const cmd = async (c) => {
    const r = await page.evaluate((c) => window.badawi.command(c), c);
    if (!r.ok) throw Error(r.error);
    return r.data;
  };
  await cmd({
    op: "provider.save",
    provider: "gemini",
    key,
    model: "gemini-3.8-flash",
    maxTokens: 1024,
    maxRequests: 20,
  });
  key = "";
  const models = await cmd({ op: "provider.models", provider: "gemini" });
  modelChecks.push({
    model: "gemini-3.8-flash",
    listed: models.includes("gemini-3.8-flash"),
  });
  checks.push(
    "Authenticated model discovery uses the actual official Google endpoint",
  );
  await cmd({ op: "engine.mode", mode: "Running", epoch: 0 });
  try {
    await cmd({ op: "provider.check", provider: "gemini" });
    modelChecks[0].generation = "passed";
  } catch (e) {
    modelChecks[0].generation = e.message;
  }
  await cmd({
    op: "provider.save",
    provider: "gemini",
    model: "gemini-2.5-flash",
    maxTokens: 2048,
    maxRequests: 20,
  });
  const chat = await cmd({ op: "chat.create", provider: "gemini" });
  await cmd({
    op: "chat.send",
    chatId: chat.id,
    text: "We are running a synthetic authorized integration test. Use the actual Badawi tools: propose creating exactly one task titled LIVE_BADAWI_INTEGRATION_37 with done=false, priority=high. Also propose memory.save with title LIVE_TEST_PREFERENCE and body Brief replies. Do not merely describe them; return the commands in actions. No other actions.",
  });
  let data = await cmd({ op: "snapshot" });
  assert.equal(data.tasks.length, 0);
  assert.equal(data.memories.length, 0);
  const plan = data.plans.find((p) => p.status === "pending");
  assert.ok(plan, "Model did not propose an executable plan");
  assert.ok(
    plan.actions.some(
      (a) =>
        a.command.op === "task.save" &&
        a.command.title === "LIVE_BADAWI_INTEGRATION_37",
    ),
  );
  assert.ok(plan.actions.some((a) => a.command.op === "memory.save"));
  checks.push(
    "Real Gemini 2.5 Flash produces host-validated task and memory commands; nothing changes before approval",
  );
  await cmd({ op: "assistant.execute", planId: plan.id });
  data = await cmd({ op: "snapshot" });
  assert.equal(data.tasks[0].title, "LIVE_BADAWI_INTEGRATION_37");
  assert.equal(data.memories[0].title, "LIVE_TEST_PREFERENCE");
  assert.equal(data.plans.find((p) => p.id === plan.id).status, "completed");
  checks.push(
    "Real Gemini plan executes in an isolated app database and receives actual host receipts",
  );
  const view = await cmd({ op: "chat.read", chatId: chat.id });
  assert.equal(view.messages.at(-1).status, "complete");
  checks.push(
    "Real model continues the conversation after approved effects, with persisted native history",
  );
  const second = await cmd({ op: "chat.create", provider: "gemini" });
  await cmd({
    op: "chat.send",
    chatId: second.id,
    text: "What task is currently saved and what remembered preference is available? Answer briefly, no actions.",
  });
  const secondView = await cmd({ op: "chat.read", chatId: second.id });
  assert.match(secondView.messages.at(-1).text, /LIVE_BADAWI_INTEGRATION_37/);
  checks.push(
    "A new real conversation knows the saved task and owner-approved memory from live app context",
  );
  const report = {
    date: new Date().toISOString(),
    live: true,
    syntheticOnly: true,
    ownerDataSent: false,
    model: "gemini-2.5-flash",
    modelChecks,
    checks,
    errors: [],
  };
  await writeFile(
    "docs/validation/assistant-live.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} catch (e) {
  const report = {
    date: new Date().toISOString(),
    live: true,
    syntheticOnly: true,
    checks,
    modelChecks,
    errors: [e.message],
  };
  await writeFile(
    "docs/validation/assistant-live.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
  process.exitCode = 1;
} finally {
  key = "";
  if (app) await app.close();
  await rm(dir, { recursive: true, force: true });
}
