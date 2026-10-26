import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  writeFile,
  mkdir,
  readFile,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/core/store.ts";
import {
  captureProjects,
  restoreProjectFiles,
} from "../src/core/project-archive.ts";
test("explicitly selected project source and binary assets archive exactly; secrets/dependencies and revoked roots do not", async () => {
  const d = await mkdtemp(join(tmpdir(), "badawi-archive-"));
  const s = new Store(":memory:");
  try {
    await mkdir(join(d, "src"));
    await writeFile(join(d, "src", "index.ts"), "export const value=37");
    await writeFile(join(d, "logo.png"), Buffer.from([137, 80, 78, 71, 1, 2]));
    await writeFile(join(d, ".env"), "PRIVATE_NOT_BACKED_UP");
    await mkdir(join(d, "node_modules"));
    await writeFile(join(d, "node_modules", "dep.js"), "DEPENDENCY");
    const p = s.put("projects", {
      name: "Project",
      root: d,
      backupFiles: false,
    });
    assert.equal(
      (await captureProjects(s, new AbortController().signal)).length,
      0,
    );
    s.put("projects", { ...p, backupFiles: true });
    const archives = await captureProjects(s, new AbortController().signal);
    assert.deepEqual(archives[0].files.map((f: any) => f.path).sort(), [
      "logo.png",
      "src/index.ts",
    ]);
    const dest = join(d, "restore");
    await mkdir(dest);
    await restoreProjectFiles(archives, dest);
    assert.equal(
      await readFile(join(dest, "projects", p.id, "src", "index.ts"), "utf8"),
      "export const value=37",
    );
    assert.deepEqual(
      await readFile(join(dest, "projects", p.id, "logo.png")),
      Buffer.from([137, 80, 78, 71, 1, 2]),
    );
    const corrupted = structuredClone(archives);
    corrupted[0].files[0].data = Buffer.from("corrupt").toString("base64");
    await assert.rejects(
      restoreProjectFiles(corrupted, join(d, "new")),
      /ARCHIVE/,
    );
  } finally {
    s.close();
    await rm(d, { recursive: true, force: true });
  }
});
test("malicious archive paths, case aliases and content hashes are validated before any restore writes", async () => {
  const bad = [
    {
      id: "p",
      name: "Bad",
      files: [{ path: "../escape", data: "eA==", sha256: "0".repeat(64) }],
    },
  ];
  await assert.rejects(restoreProjectFiles(bad, "unused"), /ARCHIVE/);
});
