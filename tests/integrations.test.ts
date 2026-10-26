import { test } from "node:test";
import assert from "node:assert/strict";
import { generate, type ProviderRequest } from "../src/core/providers.ts";
import {
  encryptBackup,
  decryptBackup,
  restoreSnapshot,
  restoreBytes,
} from "../src/core/backup.ts";
import { Store } from "../src/core/store.ts";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
const req: ProviderRequest = {
  provider: "openai",
  model: "owner-chosen",
  prompt: "approved text",
  maxTokens: 512,
};
test("OpenAI preserves all text items, store=false and no tools; usage normalized", async () => {
  let payload: any;
  const result = await generate(
    req,
    "fixture-key",
    new AbortController().signal,
    async (url, init) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      payload = JSON.parse(init!.body as string);
      return new Response(
        JSON.stringify({
          status: "completed",
          output: [
            {
              type: "message",
              content: [
                { type: "output_text", text: "First" },
                { type: "output_text", text: "Second" },
              ],
            },
          ],
          usage: { input_tokens: 12, output_tokens: 4 },
        }),
      );
    },
  );
  assert.equal(result.text, "First\nSecond");
  assert.equal(result.usage?.input, 12);
  assert.equal(payload.store, false);
  assert.equal(payload.tools, undefined);
  assert.equal(payload.input, "approved text");
});
test("Gemini text-only stateless protocol maps usage and cannot execute tool proposals", async () => {
  const result = await generate(
    { ...req, provider: "gemini", model: "gemini-3.8-flash" },
    "key",
    new AbortController().signal,
    async (url, init) => {
      assert.equal(
        url,
        "https://generativelanguage.googleapis.com/v1beta/interactions",
      );
      const p = JSON.parse(init!.body as string);
      assert.equal(p.store, false);
      assert.equal(p.generation_config.max_output_tokens, 512);
      return new Response(
        JSON.stringify({
          status: "completed",
          steps: [
            {
              type: "model_output",
              content: [{ type: "text", text: "Summary" }],
            },
          ],
          usage: { total_input_tokens: 8, total_output_tokens: 3 },
        }),
      );
    },
  );
  assert.equal(result.text, "Summary");
  assert.equal(result.usage?.output, 3);
  await assert.rejects(
    generate(
      { ...req, provider: "gemini" },
      "key",
      new AbortController().signal,
      async () =>
        new Response(
          JSON.stringify({
            status: "completed",
            steps: [
              { type: "function_call", name: "writeFile", arguments: {} },
            ],
          }),
        ),
    ),
    /UNEXPECTED_TOOL/,
  );
});
test("HTTP auth errors are sanitized; missing usage remains unknown; refusal fails", async () => {
  await assert.rejects(
    generate(
      req,
      "key",
      new AbortController().signal,
      async () => new Response("secret-provider-body", { status: 401 }),
    ),
    /AUTH_INVALID/,
  );
  const result = await generate(
    req,
    "key",
    new AbortController().signal,
    async () =>
      new Response(
        JSON.stringify({
          status: "completed",
          output: [
            { type: "message", content: [{ type: "output_text", text: "ok" }] },
          ],
        }),
      ),
  );
  assert.equal(result.usage, null);
  await assert.rejects(
    generate(
      req,
      "key",
      new AbortController().signal,
      async () =>
        new Response(JSON.stringify({ status: "incomplete", output: [] })),
    ),
    /INCOMPLETE/,
  );
});
test("encrypted backup rejects ciphertext edits and wrong recovery key", () => {
  const key = randomBytes(32);
  const artifact = encryptBackup(
    Buffer.from("private snapshot"),
    key,
    "backup-1",
  );
  assert.equal(decryptBackup(artifact, key).toString(), "private snapshot");
  assert.throws(
    () => decryptBackup(artifact, randomBytes(32)),
    /BACKUP_INTEGRITY/,
  );
  artifact[artifact.length - 1] ^= 1;
  assert.throws(() => decryptBackup(artifact, key), /BACKUP_INTEGRITY/);
});
test("restoring into a new directory disables jobs and excludes credentials", async () => {
  const s = new Store(":memory:");
  s.put("notes", { title: "safe", body: "restorable" });
  s.put("jobs", {
    name: "daily",
    kind: "reminder",
    trigger: { type: "manual" },
    missedPolicy: "skip",
    enabled: true,
  });
  s.db
    .prepare("INSERT INTO secrets VALUES(?,?)")
    .run("gemini", Buffer.from("secret"));
  const d = await mkdtemp(join(tmpdir(), "badawi-restore-"));
  await restoreSnapshot(s, join(d, "new"));
  const r = new Store(join(d, "new", "badawi.db"));
  assert.equal(r.all("notes")[0].body, "restorable");
  assert.equal(r.all("jobs")[0].enabled, false);
  assert.equal(r.db.prepare("SELECT COUNT(*) n FROM secrets").get()!.n, 0);
  r.close();
  await assert.rejects(restoreSnapshot(s, join(d, "new")), /DESTINATION/);
  s.close();
  await rm(d, { recursive: true });
});
test("malformed backup row types are rejected before a restore directory is created", async () => {
  const d = await mkdtemp(join(tmpdir(), "badawi-invalid-"));
  const malformed = {
    format: 1,
    tables: {
      projects: [],
      notes: [{ id: "a", title: "note", body: { script: "invalid" } }],
      tasks: [],
      jobs: [],
      inbox: [],
    },
  };
  await assert.rejects(
    restoreBytes(Buffer.from(JSON.stringify(malformed)), join(d, "new")),
    /BACKUP_SCHEMA/,
  );
  assert.deepEqual(await readdir(d), []);
  await rm(d, { recursive: true });
});
