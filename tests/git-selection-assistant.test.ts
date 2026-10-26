import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gitExecutable } from "../src/core/git.ts";
import { Store } from "../src/core/store.ts";
import { Service } from "../src/core/service.ts";

const response = (reply: string, actions: any[] = []) => Response.json({
  status: "completed",
  steps: [{ type: "model_output", content: [{ type: "text", text: JSON.stringify({ reply, actions: actions.map((action) => JSON.stringify(action)) }) }] }],
  usage: { total_input_tokens: 20, total_output_tokens: 10 },
});

test("AI can propose an exact changed-file selection after reading names, but owner approval only preselects files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "badawi-ai-git-selection-"));
  const git = (args: string[]) => execFileSync(gitExecutable(), args, { cwd: root, encoding: "utf8" }).trim();
  const store = new Store(":memory:");
  const secrets = new Map<string, string>();
  let projectId = "", observation: any, calls = 0;
  const payloads: string[] = [];
  const service = new Service(store, {
    pickProject: async () => null, saveText: async () => false, pickKey: async () => null,
    pickRestoreDirectory: async () => null, openAuth: async () => {},
    secrets: { get: (key) => secrets.get(key), set: (key, value) => { secrets.set(key, value); }, remove: (key) => { secrets.delete(key); } },
  }, path.join(root, "stage"), async (_url, init) => {
    calls++;
    payloads.push(String(init?.body));
    return calls === 1
      ? response("I will inspect changed filenames", [{ op: "git.changes", projectId }])
      : response("I suggest only selected.txt, excluding local.txt", [{ op: "git.selection.propose", projectId, head: observation.head, statusHash: observation.statusHash, paths: ["selected.txt"], explanation: "The owner asked to include selected.txt and exclude local.txt" }]);
  });
  try {
    git(["init", "-b", "main"]);
    git(["config", "user.name", "Badawi Test"]);
    git(["config", "user.email", "badawi@example.invalid"]);
    await writeFile(path.join(root, "README.md"), "initial\n");
    git(["add", "README.md"]);
    git(["commit", "-m", "Initial"]);
    await writeFile(path.join(root, "selected.txt"), "synthetic selected\n");
    await writeFile(path.join(root, "local.txt"), "synthetic local\n");
    await writeFile(path.join(root, ".env.local"), "synthetic secret\n");
    const project = store.put("projects", { name: "AI selection", root, aiRead: true, archived: false });
    projectId = project.id;
    await service.command({ op: "provider.save", provider: "gemini", model: "gemini-3.8-flash", key: "fixture", maxTokens: 1024, maxRequests: 10 });
    await service.command({ op: "engine.mode", mode: "Running", epoch: service.snapshot().engine.epoch });
    observation = await service.command({ op: "git.changes", projectId });
    const head = observation.head;
    const chat = await service.command({ op: "chat.create", provider: "gemini", source: { projectId } });
    await service.command({ op: "chat.send", chatId: chat.id, text: "Upload selected.txt and not local.txt", projectId });
    assert.equal(calls, 2);
    assert.ok(!payloads[1].includes(".env.local"));
    const plan = store.all("plans")[0];
    assert.equal(plan.status, "pending");
    assert.equal(plan.actions[0].command.op, "git.selection.propose");
    assert.deepEqual(await service.command({ op: "git.selection.read", projectId }), { proposal: null });
    assert.equal(git(["rev-parse", "HEAD"]), head);
    await service.command({ op: "assistant.execute", planId: plan.id });
    const selected = await service.command({ op: "git.selection.read", projectId });
    assert.deepEqual(selected.proposal.paths, ["selected.txt"]);
    assert.equal(git(["rev-parse", "HEAD"]), head);
    assert.match(git(["status", "--porcelain"]), /local\.txt/);
    assert.match(git(["status", "--porcelain"]), /selected\.txt/);
  } finally {
    service.close(); store.close();
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
