import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/core/store.ts";
import { captureProjects } from "../src/core/project-archive.ts";
import * as backup from "../src/core/backup.ts";
test("backup selection narrows allowlisted files and records exclusions; includes never override secret denial", async () => {
  const dir = await mkdtemp(join(tmpdir(), "badawi-selection-")),
    s = new Store(":memory:");
  try {
    await mkdir(join(dir, "docs"));
    await writeFile(join(dir, "docs", "keep.txt"), "keep");
    await writeFile(join(dir, "docs", "skip.txt"), "skip");
    await writeFile(join(dir, "code.ts"), "code");
    await writeFile(join(dir, ".env"), "SECRET");
    s.put("projects", {
      id: "p",
      name: "Selection",
      root: dir,
      backupFiles: true,
      backupInclude: ["docs"],
      backupExclude: ["docs/skip.txt"],
    });
    const archive = await captureProjects(s, new AbortController().signal);
    assert.deepEqual(
      archive[0].files.map((f) => f.path),
      ["docs/keep.txt"],
    );
    assert.ok(
      archive[0].excluded?.some(
        (e) => e.path === "docs/skip.txt" && e.reason === "ownerExcluded",
      ),
    );
    assert.ok(archive[0].excluded?.some((e) => e.path === ".env"));
  } finally {
    s.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("selective restore writes only the chosen folder/file and never creates an active database", async () => {
  const dir = await mkdtemp(join(tmpdir(), "badawi-selective-")),
    s = new Store(":memory:");
  try {
    const root = join(dir, "source");
    await mkdir(root);
    await mkdir(join(root, "docs"));
    await writeFile(join(root, "docs", "one.txt"), "one");
    await writeFile(join(root, "docs", "two.txt"), "two");
    await writeFile(join(root, "other.txt"), "other");
    s.put("projects", { id: "p", name: "Project", root, backupFiles: true });
    const plain = backup.snapshot(
      s,
      await captureProjects(s, new AbortController().signal),
    );
    const selected = join(dir, "selected");
    await (backup as any).restoreSelected(plain, selected, {
      projectId: "p",
      path: "docs/one.txt",
    });
    assert.deepEqual(await readdir(join(selected, "projects", "p", "docs")), [
      "one.txt",
    ]);
    assert.equal(
      await readFile(
        join(selected, "projects", "p", "docs", "one.txt"),
        "utf8",
      ),
      "one",
    );
    assert.deepEqual(await readdir(selected), ["projects"]);
    const folder = join(dir, "folder");
    await (backup as any).restoreSelected(plain, folder, {
      projectId: "p",
      path: "docs",
    });
    assert.deepEqual(
      (await readdir(join(folder, "projects", "p", "docs"))).sort(),
      ["one.txt", "two.txt"],
    );
    await assert.rejects(
      (backup as any).restoreSelected(plain, join(dir, "bad"), {
        projectId: "p",
        path: "../escape",
      }),
    );
    await assert.rejects(
      (backup as any).restoreSelected(plain, selected, { projectId: "p" }),
      /RESTORE_DESTINATION_MUST_BE_NEW/,
    );
  } finally {
    s.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("the original backup format restores when both chats and memories tables predate the release", async () => {
  const dir = await mkdtemp(join(tmpdir(), "badawi-legacy-full-")),
    s = new Store(":memory:");
  let restored: Store | undefined;
  try {
    const original = JSON.parse(backup.snapshot(s).toString());
    original.format = 1;
    delete original.tables.chats;
    delete original.tables.memories;
    await backup.restoreBytes(
      Buffer.from(JSON.stringify(original)),
      join(dir, "restored"),
    );
    restored = new Store(join(dir, "restored", "badawi.db"));
    assert.deepEqual(restored.all("memories"), []);
    assert.deepEqual(restored.all("chats"), []);
  } finally {
    restored?.close();
    s.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("managed workspace path grants never enter a backup payload", () => {
  const s = new Store(":memory:");
  try {
    s.put("projects", {
      name: "Files",
      kind: "workfiles",
      root: "C:/OWNER_PATH/Files",
      workspaceRoot: "C:/OWNER_PATH",
      projectsRoot: "C:/OWNER_PATH/Projects",
      inboxRoot: "C:/OWNER_PATH/Files/Inbox",
    });
    assert.ok(!backup.snapshot(s).toString().includes("OWNER_PATH"));
  } finally {
    s.close();
  }
});
test("an explicit scheduled backup selection captures only the chosen authorized project and refuses a revoked selection", async () => {
  const dir = await mkdtemp(join(tmpdir(), "badawi-project-selection-")),
    s = new Store(":memory:");
  try {
    for (const id of ["one", "two"]) {
      await mkdir(join(dir, id));
      await writeFile(join(dir, id, "data.txt"), id);
      s.put("projects", {
        id,
        name: id,
        root: join(dir, id),
        backupFiles: true,
      });
    }
    const chosen = await captureProjects(s, new AbortController().signal, [
      "one",
    ]);
    assert.deepEqual(
      chosen.map((p) => p.id),
      ["one"],
    );
    await assert.rejects(
      captureProjects(s, new AbortController().signal, ["missing"]),
      /BACKUP_SELECTION_DENIED/,
    );
    s.put("projects", { ...s.get("projects", "one"), backupFiles: false });
    await assert.rejects(
      captureProjects(s, new AbortController().signal, ["one"]),
      /BACKUP_SELECTION_DENIED/,
    );
  } finally {
    s.close();
    await rm(dir, { recursive: true, force: true });
  }
});
