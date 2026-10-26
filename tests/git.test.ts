import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { gitRead } from "../src/core/git.ts";
test("Git wrappers inspect a real repository without writing its index or running helpers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "badawi-git-"));
  const git = "C:/Program Files/Git/cmd/git.exe";
  const run = (args: string[]) =>
    execFileSync(git, args, {
      cwd: dir,
      windowsHide: true,
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: "NUL",
        GIT_CONFIG_NOSYSTEM: "1",
      },
    });
  run(["init", "--initial-branch=main"]);
  await writeFile(join(dir, "readme.md"), "original");
  run(["add", "readme.md"]);
  run([
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-m",
    "Initial fixture",
  ]);
  const index = await readFile(join(dir, ".git/index"));
  await writeFile(join(dir, "readme.md"), "modified");
  assert.match(await gitRead(dir, "status"), /readme.md/);
  assert.match(await gitRead(dir, "log"), /Initial fixture/);
  assert.match(await gitRead(dir, "diff"), /readme.md/);
  assert.equal(await gitRead(dir, "showText", "HEAD", "readme.md"), "original");
  assert.ok((await gitRead(dir, "branches")).trim().length);
  assert.match((await gitRead(dir, "head")).trim(), /^[a-f0-9]{40,64}$/);
  assert.match(await gitRead(dir,'commitEvidence','HEAD'),/Initial fixture/);
  assert.deepEqual(await readFile(join(dir, ".git/index")), index);
  assert.equal(await readFile(join(dir, "readme.md"), "utf8"), "modified");
  await assert.rejects(gitRead(dir, "showText", "HEAD", ".env"), /PATH_DENIED/);
  await assert.rejects(gitRead(dir, "log", "--exec=evil"), /INVALID_REVISION/);
  await writeFile(
    join(dir, ".git/config"),
    "[core]\n fsmonitor = cmd /c echo BAD\n",
  );
  await assert.rejects(gitRead(dir, "status"), /UNSAFE_CONFIG/);
  await rm(dir, { recursive: true });
});
