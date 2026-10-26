import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/core/store.ts";
import * as idx from "../src/core/file-index.ts";
import { snapshot } from "../src/core/backup.ts";
test("persistent index searches beyond the old 100-file limit, excludes credentials and stays out of backups", async () => {
  const dir = await mkdtemp(join(tmpdir(), "badawi-index-"));
  let store = new Store(join(dir, "index.db"));
  try {
    const root = join(dir, "files");
    await mkdir(root);
    for (let n = 0; n < 120; n++)
      await writeFile(
        join(root, `${String(n).padStart(3, "0")}.txt`),
        n === 119 ? "final target UNIQUE_INDEX_EVIDENCE" : "ordinary",
      );
    await writeFile(
      join(root, "chatgpt-auth.json"),
      "UNIQUE_INDEX_EVIDENCE SECRET",
    );
    const report = await (idx as any).buildFileIndex(
      store,
      "project",
      root,
      new AbortController().signal,
    );
    assert.equal(report.indexed, 120);
    assert.equal(report.truncated, false);
    store.close();
    store = new Store(join(dir, "index.db"));
    const found = (idx as any).searchFileIndex(
      store,
      "project",
      root,
      "unique_index_evidence",
    );
    assert.deepEqual(
      found.matches.map((m: any) => m.path),
      ["119.txt"],
    );
    assert.equal(found.matches[0].line, 1);
    assert.ok(found.indexedAt);
    assert.equal(
      (idx as any).searchFileIndex(
        store,
        "project",
        join(dir, "other"),
        "target",
      ),
      null,
    );
    assert.ok(!snapshot(store).toString().includes("UNIQUE_INDEX_EVIDENCE"));
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("cancelled reindex preserves the last complete index", async () => {
  const dir = await mkdtemp(join(tmpdir(), "badawi-index-cancel-")),
    store = new Store(":memory:");
  try {
    await writeFile(join(dir, "a.txt"), "before");
    await (idx as any).buildFileIndex(
      store,
      "p",
      dir,
      new AbortController().signal,
    );
    await writeFile(join(dir, "a.txt"), "after");
    const c = new AbortController();
    c.abort();
    await assert.rejects(
      (idx as any).buildFileIndex(store, "p", dir, c.signal),
    );
    assert.equal(
      (idx as any).searchFileIndex(store, "p", dir, "before").matches.length,
      1,
    );
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
