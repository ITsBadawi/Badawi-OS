import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/core/store.ts";
import { Service } from "../src/core/service.ts";
test("only a current owner preview can reconnect managed roots; stable metadata is reconciled while AI/backup/monitoring grants and related schedules remain disabled", async () => {
  const dir = await mkdtemp(join(tmpdir(), "badawi-relink-service-")),
    s = new Store(":memory:");
  const service = new Service(
    s,
    {
      pickProject: async () => null,
      pickKey: async () => null,
      pickRestoreDirectory: async () => null,
      saveText: async () => false,
      openAuth: async () => {},
      secrets: { get: () => undefined, set: () => {}, remove: () => {} },
    },
    "unused-stage",
    async () => {
      throw Error("No network permitted");
    },
  );
  try {
    await mkdir(join(dir, "Files"));
    await mkdir(join(dir, "Projects"));
    await writeFile(join(dir, "Files", "owner.md"), "Exact owner bytes");
    const p = s.put("projects", {
      name: "Restore files",
      kind: "workfiles",
      root: null,
      aiRead: true,
      backupFiles: true,
      monitor: true,
      fileEntries: [
        {
          path: "owner.md",
          category: "document",
          tags: ["keep"],
          linkedProjectIds: ["missing"],
        },
      ],
    });
    const job = s.put("jobs", {
      name: "Old target",
      kind: "workflow",
      projectId: p.id,
      enabled: true,
      grant: { hash: "old" },
      steps: [{ kind: "report", projectId: p.id, grant: { hash: "old" } }],
      trigger: { type: "manual" },
    });
    await assert.rejects(
      service.command({ op: "workspace.relink.preview", id: p.id, path: dir }),
      /ENGINE_STOPPED_OR_PAUSED/,
    );
    await service.command({ op: "engine.mode", mode: "Running", epoch: 0 });
    let preview = await service.command({
      op: "workspace.relink.preview",
      id: p.id,
      path: dir,
    });
    assert.equal(s.get("projects", p.id)?.root, null);
    assert.equal(preview.removedLinks, 1);
    await writeFile(join(dir, "Files", "new.md"), "arrived after preview");
    await assert.rejects(
      service.command({
        op: "workspace.relink.apply",
        approvalId: preview.approvalId,
      }),
      /APPROVAL_STALE/,
    );
    assert.equal(s.get("projects", p.id)?.root, null);
    preview = await service.command({
      op: "workspace.relink.preview",
      id: p.id,
      path: dir,
    });
    const linked = await service.command({
      op: "workspace.relink.apply",
      approvalId: preview.approvalId,
    });
    assert.equal(linked.id, p.id);
    assert.equal(linked.root, join(dir, "Files"));
    assert.equal(linked.projectsRoot, join(dir, "Projects"));
    assert.equal(linked.aiRead, false);
    assert.equal(linked.backupFiles, false);
    assert.equal(linked.monitor, false);
    assert.deepEqual(linked.fileEntries[0].tags, ["keep"]);
    assert.deepEqual(linked.fileEntries[0].linkedProjectIds, []);
    assert.equal(s.get("jobs", job.id)?.enabled, false);
    assert.equal(s.get("jobs", job.id)?.grant, null);
    assert.equal(s.get("jobs", job.id)?.steps[0].grant, null);
    assert.equal(
      await readFile(join(dir, "Files", "owner.md"), "utf8"),
      "Exact owner bytes",
    );
    await assert.rejects(
      service.command({
        op: "workspace.relink.apply",
        approvalId: preview.approvalId,
      }),
      /APPROVAL_STALE/,
    );
    await assert.rejects(
      service.command({ op: "project.relink", id: p.id }),
      /MANAGED_WORKSPACE_RELINK_REQUIRED/,
    );
    assert.throws(
      () =>
        service.assistant.validate({
          op: "workspace.relink.preview",
          id: p.id,
          path: dir,
        }),
      /ASSISTANT_ACTION_DENIED/,
    );
    assert.equal(s.verifyAudit(), true);
  } finally {
    service.close();
    s.close();
    await rm(dir, { recursive: true, force: true });
  }
});
