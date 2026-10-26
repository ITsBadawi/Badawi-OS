import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  writeFile,
  mkdir,
  symlink,
  link,
  rm,
  readFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readText, listFiles, canonicalRoot } from "../src/core/workspace.ts";
test("root inspection excludes secrets and dependencies and never changes source", async () => {
  const d = await mkdtemp(join(tmpdir(), "badawi-files-"));
  await mkdir(join(d, "node_modules"));
  await writeFile(join(d, "hello.ts"), "export const n=1");
  await writeFile(join(d, ".env.local"), "TOP_SECRET");
  await writeFile(join(d, "node_modules", "a.ts"), "dependency");
  const root = await canonicalRoot(d);
  const files = await listFiles(root);
  assert.deepEqual(
    files.files.map((x) => x.path),
    ["hello.ts"],
  );
  assert.equal(await readText(root, "hello.ts"), "export const n=1");
  assert.equal(await readFile(join(d, "hello.ts"), "utf8"), "export const n=1");
  await assert.rejects(readText(root, ".env.local"), /PATH_DENIED/);
  await assert.rejects(readText(root, "../outside.txt"), /PATH_DENIED/);
  await assert.rejects(readText(root, "C:\\Windows\\win.ini"), /PATH_DENIED/);
  await assert.rejects(readText(root, "hello.ts:secret"), /PATH_DENIED/);
  await rm(d, { recursive: true });
});
test("linked files and binary content cannot leak through previews", async () => {
  const d = await mkdtemp(join(tmpdir(), "badawi-links-"));
  await writeFile(join(d, "a.txt"), "safe");
  await link(join(d, "a.txt"), join(d, "b.txt"));
  await writeFile(join(d, "binary.txt"), Buffer.from([0, 1, 2]));
  const root = await canonicalRoot(d);
  await assert.rejects(readText(root, "b.txt"), /PATH_DENIED/);
  await assert.rejects(readText(root, "binary.txt"), /BINARY/);
  await rm(d, { recursive: true });
});
test("directory junction escape is refused", async () => {
  const d = await mkdtemp(join(tmpdir(), "badawi-junction-"));
  const external = await mkdtemp(join(tmpdir(), "badawi-external-"));
  await writeFile(join(external, "secret.txt"), "outside");
  await symlink(external, join(d, "escape"), "junction");
  await assert.rejects(
    readText(await canonicalRoot(d), "escape/secret.txt"),
    /PATH_DENIED/,
  );
  await rm(d, { recursive: true });
  await rm(external, { recursive: true });
});
test("a scan cancelled while a directory read is pending does not finish the whole directory", async () => {
  const d = await mkdtemp(join(tmpdir(), "badawi-cancel-"));
  await Promise.all(
    Array.from({ length: 50 }, (_, i) =>
      writeFile(join(d, `${i}.txt`), "text"),
    ),
  );
  const control = new AbortController();
  const pending = listFiles(await canonicalRoot(d), control.signal);
  control.abort();
  await assert.rejects(pending);
  await rm(d, { recursive: true });
});
