import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  lstat,
  rename,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { Store } from "../src/core/store.ts";
import { snapshot, restoreBytes, restoreSelected } from "../src/core/backup.ts";
import { inspectWorkspaceLink } from "../src/core/workspace-relink.ts";
test("managed file snapshots restore into separate Files/Projects folders and retain stable metadata without restoring path grants", async () => {
  const dir = await mkdtemp(join(tmpdir(), "badawi-managed-restore-")),
    s = new Store(":memory:");
  let restored: Store | undefined;
  try {
    const p = s.put("projects", {
      id: "work-files",
      name: "Owner files",
      kind: "workfiles",
      root: "C:/old/Files",
      workspaceRoot: "C:/old",
      projectsRoot: "C:/old/Projects",
      inboxRoot: "C:/old/Files/Inbox",
      fileEntries: [
        {
          path: "Inbox/brief.md",
          category: "document",
          tags: ["owner"],
          linkedProjectIds: [],
        },
      ],
    });
    const bytes = Buffer.from("Exact restored work bytes"),
      archives = [
        {
          id: p.id,
          name: p.name,
          capturedAt: new Date().toISOString(),
          files: [
            {
              path: "Inbox/brief.md",
              data: bytes.toString("base64"),
              sha256: createHash("sha256").update(bytes).digest("hex"),
            },
          ],
        },
      ];
    const plain = snapshot(s, archives),
      destination = join(dir, "restored");
    await restoreBytes(plain, destination);
    const workspace = join(destination, "workspaces", p.id);
    assert.deepEqual(
      await readFile(join(workspace, "Files", "Inbox", "brief.md")),
      bytes,
    );
    assert.ok((await lstat(join(workspace, "Projects"))).isDirectory());
    restored = new Store(join(destination, "badawi.db"));
    const row = restored.get("projects", p.id)!;
    assert.equal(row.root, null);
    assert.equal(row.workspaceRoot, undefined);
    assert.equal(row.aiRead, false);
    assert.equal(row.backupFiles, false);
    assert.equal(row.fileEntries[0].tags[0], "owner");
    const preview = await inspectWorkspaceLink(
      restored,
      p.id,
      workspace,
      new AbortController().signal,
    );
    assert.equal(preview.present, 1);
    assert.equal(preview.missing, 0);
    assert.equal(preview.root, join(workspace, "Files"));
    const selected = join(dir, "selected");
    await restoreSelected(plain, selected, {
      projectId: p.id,
      path: "Inbox/brief.md",
    });
    assert.deepEqual(
      await readFile(
        join(selected, "workspaces", p.id, "Files", "Inbox", "brief.md"),
      ),
      bytes,
    );
  } finally {
    restored?.close();
    s.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("managed reconnect inspects exact existing layout, reports missing files/links and refuses overlapping code, cancellation or linked folders", async () => {
  const dir = await mkdtemp(join(tmpdir(), "badawi-managed-inspect-")),
    s = new Store(":memory:");
  try {
    await mkdir(join(dir, "Files"));
    await mkdir(join(dir, "Projects"));
    await writeFile(join(dir, "Files", "present.txt"), "owner bytes");
    const p = s.put("projects", {
      name: "Restored",
      kind: "workfiles",
      root: null,
      fileEntries: [
        {
          path: "present.txt",
          category: "document",
          tags: [],
          linkedProjectIds: ["gone"],
        },
        {
          path: "missing.txt",
          category: "other",
          tags: [],
          linkedProjectIds: [],
        },
      ],
    });
    const preview = await inspectWorkspaceLink(
      s,
      p.id,
      dir,
      new AbortController().signal,
    );
    assert.equal(preview.present, 1);
    assert.equal(preview.missing, 1);
    assert.equal(preview.removedLinks, 1);
    assert.deepEqual(preview.entries[0].linkedProjectIds, []);
    assert.equal(s.get("projects", p.id)?.root, null);
    assert.equal(
      await readFile(join(dir, "Files", "present.txt"), "utf8"),
      "owner bytes",
    );
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(inspectWorkspaceLink(s, p.id, dir, controller.signal));
    const conflicting = s.put("projects", {
      name: "Conflicting code root",
      root: join(dir, "Files"),
    });
    await assert.rejects(
      inspectWorkspaceLink(s, p.id, dir, new AbortController().signal),
      /WORKSPACE_OVERLAP/,
    );
    s.remove("projects", conflicting.id);
    await rename(join(dir, "Files"), join(dir, "RealFiles"));
    await symlink(
      join(dir, "RealFiles"),
      join(dir, "Files"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await assert.rejects(
      inspectWorkspaceLink(s, p.id, dir, new AbortController().signal),
      /PATH_DENIED/,
    );
  } finally {
    s.close();
    await rm(dir, { recursive: true, force: true });
  }
});
