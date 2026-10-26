import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/core/store.ts";
import { refreshCatalog, queryCatalog } from "../src/core/file-catalog.ts";
import { buildFileIndex } from "../src/core/file-index.ts";
test("central catalog separates work files and code, joins current classification/links and searches actual indexed text without including secrets", async () => {
  const dir = await mkdtemp(join(tmpdir(), "badawi-catalog-")),
    s = new Store(":memory:");
  try {
    const a = join(dir, "Files"),
      b = join(dir, "Code");
    await mkdir(a);
    await mkdir(b);
    await mkdir(join(a, "Inbox"));
    await writeFile(join(a, "design.png"), Buffer.from([137, 80, 78, 71]));
    await writeFile(
      join(a, "Inbox", "brief.md"),
      "Exact indexed client phrase",
    );
    await writeFile(join(a, ".env"), "PRIVATE_CREDENTIAL");
    await writeFile(join(b, "main.ts"), "project source code");
    const code = s.put("projects", { name: "Code", root: b }),
      files = s.put("projects", {
        name: "Files",
        kind: "workfiles",
        root: a,
        inboxRoot: join(a, "Inbox"),
        fileEntries: [
          {
            path: "design.png",
            category: "design",
            tags: ["client"],
            linkedProjectIds: [code.id],
          },
        ],
      });
    await refreshCatalog(s, [files.id, code.id], new AbortController().signal);
    let v = queryCatalog(s, { space: "files" });
    assert.equal(v.matches.length, 2);
    assert.ok(v.matches.every((f) => f.projectId === files.id));
    assert.ok(v.sources[0].catalogedAt);
    v = queryCatalog(s, {
      space: "files",
      category: "design",
      tag: "client",
      linkedProjectId: code.id,
      extension: "png",
    });
    assert.equal(v.matches[0].path, "design.png");
    assert.equal(v.matches.length, 1);
    assert.equal(
      queryCatalog(s, { space: "files", inboxOnly: true }).matches[0].path,
      "Inbox/brief.md",
    );
    assert.equal(
      queryCatalog(s, { space: "projects" }).matches[0].path,
      "main.ts",
    );
    await buildFileIndex(s, files.id, a, new AbortController().signal);
    v = queryCatalog(s, {
      space: "files",
      mode: "content",
      query: "client phrase",
    });
    assert.equal(v.matches[0].line, 1);
    assert.ok(v.matches[0].contentIndexedAt);
    assert.ok(v.matches[0].text.includes("client phrase"));
    assert.ok(
      !JSON.stringify(queryCatalog(s, { space: "all" })).includes(".env"),
    );
    assert.equal(
      queryCatalog(s, { space: "all" }, new Set([code.id])).matches.length,
      1,
    );
    s.put("projects", { ...files, fileEntries: [] });
    assert.equal(
      queryCatalog(s, { space: "files", category: "design" }).matches.length,
      0,
    );
  } finally {
    s.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("refresh removes deleted files, refuses revoked or cancelled roots, and root changes never expose a prior cache", async () => {
  const dir = await mkdtemp(join(tmpdir(), "badawi-catalog-scope-")),
    s = new Store(":memory:");
  try {
    await writeFile(join(dir, "keep.md"), "indexed body");
    const p = s.put("projects", {
      name: "Files",
      kind: "workfiles",
      root: dir,
    });
    await refreshCatalog(s, [p.id], new AbortController().signal);
    const before = queryCatalog(s, { space: "files" }).sources[0].catalogedAt;
    const pending = refreshCatalog(s, [p.id], new AbortController().signal);
    s.put("projects", { ...p, root: join(dir, "revoked") });
    await assert.rejects(pending, /PERMISSION_REVOKED/);
    s.put("projects", p);
    assert.equal(
      queryCatalog(s, { space: "files" }).sources[0].catalogedAt,
      before,
    );
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(refreshCatalog(s, [p.id], controller.signal));
    assert.equal(
      queryCatalog(s, { space: "files" }).sources[0].catalogedAt,
      before,
    );
    s.put("projects", { ...p, root: join(dir, "other") });
    assert.equal(queryCatalog(s, { space: "files" }).matches.length, 0);
    assert.equal(
      queryCatalog(s, { space: "files" }).sources[0].catalogedAt,
      null,
    );
    s.put("projects", p);
    await rm(join(dir, "keep.md"));
    await refreshCatalog(s, [p.id], new AbortController().signal);
    assert.equal(queryCatalog(s, { space: "files" }).matches.length, 0);
  } finally {
    s.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("source and result pagination cover the full catalog rather than treating a bounded page as exhaustive; changed metadata refuses stale indexed content", async () => {
  const dir = await mkdtemp(join(tmpdir(), "badawi-catalog-pages-")),
    s = new Store(":memory:");
  try {
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) {
      const root = join(dir, String(i));
      await mkdir(root);
      await writeFile(join(root, "item.md"), "old EVIDENCEWORD");
      ids.push(
        s.put("projects", { name: `Files ${i}`, kind: "workfiles", root }).id,
      );
    }
    await refreshCatalog(s, ids.slice(0, 10), new AbortController().signal);
    await refreshCatalog(s, ids.slice(10), new AbortController().signal);
    let v = queryCatalog(s, { space: "files", limit: 3 });
    assert.equal(v.matches.length, 3);
    assert.equal(v.matched, 10);
    assert.equal(v.hasMore, true);
    assert.equal(v.nextSourceOffset, 10);
    const first = v.matches.map((f) => f.projectId),
      next = queryCatalog(s, {
        space: "files",
        offset: 3,
        limit: 3,
      }).matches.map((f) => f.projectId);
    assert.ok(next.every((id) => !first.includes(id)));
    v = queryCatalog(s, { space: "files", sourceOffset: 10 });
    assert.equal(v.matches.length, 2);
    assert.equal(v.nextSourceOffset, null);
    assert.equal(v.totalSources, 12);
    const p = s.get("projects", ids[0])!;
    await buildFileIndex(s, p.id, p.root, new AbortController().signal);
    await writeFile(
      join(p.root, "item.md"),
      "newly changed longer EVIDENCEWORD",
    );
    await refreshCatalog(s, [p.id], new AbortController().signal);
    v = queryCatalog(s, {
      space: "files",
      projectId: p.id,
      mode: "content",
      query: "EVIDENCEWORD",
    });
    assert.equal(v.matches.length, 0);
    assert.equal(v.unindexedFiles, 1);
    await buildFileIndex(s, p.id, p.root, new AbortController().signal);
    v = queryCatalog(s, {
      space: "files",
      projectId: p.id,
      mode: "content",
      query: "EVIDENCEWORD",
    });
    assert.equal(v.matches.length, 1);
    assert.ok(v.matches[0].text.includes("newly changed"));
  } finally {
    s.close();
    await rm(dir, { recursive: true, force: true });
  }
});
