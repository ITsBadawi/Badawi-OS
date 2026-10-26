import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/core/store.ts";
import { Service } from "../src/core/service.ts";
import { commandSchema } from "../src/contracts.ts";
test("clone preview is read-only and binds its repository head, destination workspace and credential identity before any Git process", async () => {
  const dir = await mkdtemp(join(tmpdir(), "badawi-clone-review-")),
    store = new Store(":memory:"),
    keys = new Map<string, string>();
  let apiCalls = 0;
  const service = new Service(
    store,
    {
      pickProject: async () => null,
      saveText: async () => false,
      pickKey: async () => null,
      pickRestoreDirectory: async () => null,
      openAuth: async () => {},
      secrets: {
        get: (k) => keys.get(k),
        set: (k, v) => {
          keys.set(k, v);
        },
        remove: (k) => {
          keys.delete(k);
        },
      },
    },
    join(dir, "stage"),
    async (input) => {
      apiCalls++;
      return Response.json(
        String(input).includes("/commits/")
          ? { sha: "a".repeat(40) }
          : {
              id: 1,
              private: false,
              archived: false,
              default_branch: "main",
              size: 4,
            },
      );
    },
  );
  try {
    const workspace = await service.command({
      op: "workspace.create",
      path: dir,
      inbox: false,
    });
    const state = service.snapshot();
    await service.command({
      op: "engine.mode",
      mode: "Running",
      epoch: state.engine.epoch,
    });
    const command = commandSchema.parse({
      op: "project.clone.preview",
      workspaceId: workspace.id,
      name: "Sample",
      folder: "sample",
      github: { owner: "owner", repo: "repo" },
    });
    const preview = await service.command(command);
    assert.equal(preview.remoteHead, "a".repeat(40));
    assert.deepEqual(await readdir(join(dir, "Projects")), []);
    assert.equal(apiCalls, 2);
    store.put("projects", {
      ...store.get("projects", workspace.id),
      projectsRoot: join(dir, "different"),
    });
    await assert.rejects(
      service.command(
        commandSchema.parse({
          op: "project.clone.apply",
          previewId: preview.previewId,
        }),
      ),
      /CLONE_APPROVAL_STALE/,
    );
    assert.equal(apiCalls, 2);
    assert.deepEqual(await readdir(join(dir, "Projects")), []);
    store.put("projects", {
      ...store.get("projects", workspace.id),
      projectsRoot: join(dir, "Projects"),
    });
    const second = await service.command(command);
    keys.set("integration.github", "changed-credential");
    await assert.rejects(
      service.command(
        commandSchema.parse({
          op: "project.clone.apply",
          previewId: second.previewId,
        }),
      ),
      /CLONE_APPROVAL_STALE/,
    );
    assert.deepEqual(await readdir(join(dir, "Projects")), []);
  } finally {
    service.close();
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
