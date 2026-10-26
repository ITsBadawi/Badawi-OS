import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listFiles, readBytes } from "../src/core/workspace.ts";
test("credential directory and DevKit auth files cannot enter a project snapshot or preview", async () => {
  const dir = await mkdtemp(join(tmpdir(), "badawi-auth-exclusion-"));
  try {
    await mkdir(join(dir, "chatgpt-subscription"));
    await writeFile(
      join(dir, "chatgpt-subscription", "chatgpt-auth.json"),
      "SECRET_FIXTURE",
    );
    await writeFile(join(dir, "chatgpt-auth.json"), "SECRET_FIXTURE");
    await writeFile(join(dir, "readme.md"), "safe");
    assert.deepEqual(
      (await listFiles(dir)).files.map((f) => f.path),
      ["readme.md"],
    );
    await assert.rejects(readBytes(dir, "chatgpt-auth.json"), /PATH_DENIED/);
    await assert.rejects(
      readBytes(dir, "chatgpt-subscription/chatgpt-auth.json"),
      /PATH_DENIED/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
