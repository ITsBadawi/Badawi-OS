import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  writeFile,
  readFile,
  rm,
  mkdir,
  lstat,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as wf from "../src/core/workfiles.ts";
import { Store } from "../src/core/store.ts";
import { Service } from "../src/core/service.ts";

test("managed workspace separates Files, Projects and optional Inbox without changing existing contents", async () => {
  const root = await mkdtemp(join(tmpdir(), "badawi-managed-"));
  try {
    await writeFile(join(root, "keep.txt"), "keep");
    const r = await (wf as any).createWorkspace(root, true);
    assert.equal(r.files, join(root, "Files"));
    assert.equal(r.projects, join(root, "Projects"));
    assert.equal(r.inbox, join(root, "Files", "Inbox"));
    assert.equal(await readFile(join(root, "keep.txt"), "utf8"), "keep");
    assert.ok((await lstat(r.projects)).isDirectory());
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("reviewed rename verifies bytes, refuses stale previews and never overwrites a destination", async () => {
  const root = await mkdtemp(join(tmpdir(), "badawi-filemove-"));
  try {
    await writeFile(join(root, "a.txt"), "first");
    const preview = await (wf as any).previewFileChange(root, {
      kind: "move",
      source: "a.txt",
      destination: "b.txt",
    });
    await writeFile(join(root, "a.txt"), "new content");
    await assert.rejects(
      (wf as any).applyFileChange(root, preview),
      /APPROVAL_STALE/,
    );
    await assert.rejects(lstat(join(root, "b.txt")));
    const current = await (wf as any).previewFileChange(root, {
      kind: "move",
      source: "a.txt",
      destination: "b.txt",
    });
    await (wf as any).applyFileChange(root, current);
    assert.equal(await readFile(join(root, "b.txt"), "utf8"), "new content");
    await assert.rejects(lstat(join(root, "a.txt")));
    await writeFile(join(root, "a.txt"), "preserve");
    await assert.rejects(
      (wf as any).previewFileChange(root, {
        kind: "move",
        source: "a.txt",
        destination: "b.txt",
      }),
      /DESTINATION_EXISTS/,
    );
    assert.equal(await readFile(join(root, "a.txt"), "utf8"), "preserve");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("folder creation refuses traversal, secret targets, invalid Windows aliases and linked parents", async () => {
  const root = await mkdtemp(join(tmpdir(), "badawi-folder-"));
  try {
    const preview = await (wf as any).previewFileChange(root, {
      kind: "mkdir",
      destination: "Designs",
    });
    await (wf as any).applyFileChange(root, preview);
    assert.ok((await lstat(join(root, "Designs"))).isDirectory());
    for (const destination of [
      "../escape",
      "secrets",
      "bad:name",
      "Designs/CON",
      "bad?.txt",
      "trailing.",
    ])
      await assert.rejects(
        (wf as any).previewFileChange(root, { kind: "mkdir", destination }),
      );
    await mkdir(join(root, "elsewhere"));
    await symlink(join(root, "elsewhere"), join(root, "link"), "junction");
    await assert.rejects(
      (wf as any).previewFileChange(root, {
        kind: "mkdir",
        destination: "link/escape",
      }),
      /PATH_DENIED/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("host requires a managed Files root, exact preview approval and an active engine before filesystem writes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "badawi-managed-host-")),
    s = new Store(":memory:");
  const service = new Service(
    s,
    {
      secrets: { get: () => undefined, set: () => {}, remove: () => {} },
      pickProject: async () => null,
      saveText: async () => false,
      pickKey: async () => null,
      pickRestoreDirectory: async () => null,
      openAuth: async () => {},
    },
    join(dir, "staging"),
  );
  try {
    const project = await service.command({ op: "workspace.add", path: dir });
    await assert.rejects(
      service.command({
        op: "files.change.preview",
        projectId: project.id,
        kind: "mkdir",
        destination: "No",
      } as any),
      /MANAGED_FILES_REQUIRED/,
    );
    // A project root cannot simultaneously become writable Files space.
    await assert.rejects(
      service.command({
        op: "workspace.create",
        path: dir,
        inbox: true,
      } as any),
      /WORKSPACE_OVERLAP/,
    );
    await service.command({ op: "project.remove", id: project.id });
    const managed = await service.command({
      op: "workspace.create",
      path: dir,
      inbox: true,
    } as any);
    await assert.rejects(
      service.command({ op: "workspace.add", path: join(dir, "Files") }),
      /WORKSPACE_OVERLAP/,
    );
    await assert.rejects(
      service.command({ op: "workspace.add", path: dir }),
      /WORKSPACE_OVERLAP/,
    );
    const preview = await service.command({
      op: "files.change.preview",
      projectId: managed.id,
      kind: "mkdir",
      destination: "Designs",
    } as any);
    await assert.rejects(lstat(join(dir, "Files", "Designs")));
    await assert.rejects(
      service.command({
        op: "files.change.apply",
        approvalId: preview.approvalId,
      } as any),
      /ENGINE_STOPPED_OR_PAUSED/,
    );
    await service.command({
      op: "engine.mode",
      mode: "Running",
      epoch: service.engine.snapshot().epoch,
    });
    const result = await service.command({
      op: "files.change.apply",
      approvalId: preview.approvalId,
    } as any);
    assert.equal(result.verified, true);
    assert.ok((await lstat(join(dir, "Files", "Designs"))).isDirectory());
    await assert.rejects(
      service.command({
        op: "files.change.apply",
        approvalId: preview.approvalId,
      } as any),
      /APPROVAL_STALE/,
    );
    await writeFile(join(dir, "Files", "design.txt"), "asset bytes");
    const code = await service.command({
      op: "workspace.add",
      path: join(dir, "Projects"),
    });
    await service.command({
      op: "files.classify",
      projectId: managed.id,
      path: "design.txt",
      category: "design",
      tags: ["logo"],
      linkedProjectIds: [code.id],
    } as any);
    assert.equal(
      await readFile(join(dir, "Files", "design.txt"), "utf8"),
      "asset bytes",
    );
    assert.deepEqual(s.get("projects", managed.id)!.fileEntries[0], {
      path: "design.txt",
      category: "design",
      tags: ["logo"],
      linkedProjectIds: [code.id],
    });
    const rename = await service.command({
      op: "files.change.preview",
      projectId: managed.id,
      kind: "move",
      source: "design.txt",
      destination: "Designs/logo.txt",
    } as any);
    await service.command({
      op: "files.change.apply",
      approvalId: rename.approvalId,
    } as any);
    assert.equal(
      s.get("projects", managed.id)!.fileEntries[0].path,
      "Designs/logo.txt",
    );
    assert.deepEqual(
      s.get("projects", managed.id)!.fileEntries[0].linkedProjectIds,
      [code.id],
    );
    await assert.rejects(
      service.command({
        op: "files.classify",
        projectId: code.id,
        path: "anything",
        category: "design",
        tags: [],
        linkedProjectIds: [],
      } as any),
      /MANAGED_FILES_REQUIRED/,
    );
  } finally {
    service.close();
    s.close();
    await rm(dir, { recursive: true, force: true });
  }
});
