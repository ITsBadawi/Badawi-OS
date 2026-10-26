import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { searchText } from "../src/core/workspace.ts";
test("bounded source search returns file and line evidence but excludes secret files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "badawi-text-search-"));
  try {
    await writeFile(join(dir, "readme.md"), "Heading\nFind THIS fact\nOther");
    await writeFile(join(dir, ".env"), "Find THIS secret");
    const r = await searchText(dir, "this", new AbortController().signal);
    assert.deepEqual(r.matches, [
      { path: "readme.md", line: 2, text: "Find THIS fact" },
    ]);
    assert.equal(r.scannedFiles, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("cancelled text search cannot continue scanning source files", async () => {
  const c = new AbortController();
  c.abort();
  await assert.rejects(searchText("unused", "query", c.signal), /abort/i);
});
