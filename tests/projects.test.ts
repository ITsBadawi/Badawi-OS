import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/core/store.ts";
import { Service } from "../src/core/service.ts";
import { commandSchema } from "../src/contracts.ts";
import { snapshot, validateSnapshot } from "../src/core/backup.ts";
test("new project creates only an exclusive empty directory under the registered Projects workspace", async () => {
  const dir = await mkdtemp(join(tmpdir(), "badawi-new-project-")),
    store = new Store(":memory:");
  const service = new Service(
    store,
    {
      pickProject: async () => null,
      saveText: async () => false,
      pickKey: async () => null,
      pickRestoreDirectory: async () => null,
      openAuth: async () => {},
      secrets: { get: () => undefined, set: () => {}, remove: () => {} },
    },
    join(dir, "stage"),
  );
  try {
    const workspace = await service.command({
      op: "workspace.create",
      path: dir,
      inbox: true,
    });
    let state = service.snapshot();
    await service.command({
      op: "engine.mode",
      mode: "Running",
      epoch: state.engine.epoch,
    });
    const created = await service.command(
      commandSchema.parse({
        op: "project.create",
        workspaceId: workspace.id,
        name: "My project",
        folder: "my-project",
      }),
    );
    assert.equal(created.root, join(dir, "Projects", "my-project"));
    assert.deepEqual(await readdir(created.root), []);
    assert.equal(created.aiRead, false);
    assert.equal(created.backupFiles, false);
    await writeFile(join(created.root, "owner.txt"), "source stays untouched");
    await assert.rejects(
      service.command(
        commandSchema.parse({
          op: "project.create",
          workspaceId: workspace.id,
          name: "Collision",
          folder: "my-project",
        }),
      ),
      /DESTINATION_EXISTS/,
    );
    assert.equal(
      await readFile(join(created.root, "owner.txt"), "utf8"),
      "source stays untouched",
    );
    await assert.rejects(
      service.command(
        commandSchema.parse({
          op: "project.create",
          workspaceId: workspace.id,
          name: "Escape",
          folder: "../Files",
        }),
      ),
      /PATH_DENIED/,
    );
    await assert.rejects(
      service.command(
        commandSchema.parse({
          op: "project.create",
          workspaceId: created.id,
          name: "Invalid workspace",
          folder: "another",
        }),
      ),
      /MANAGED_WORKSPACE_REQUIRED/,
    );
    const updated = await service.command(
      commandSchema.parse({
        op: "project.details",
        id: created.id,
        name: "Renamed",
        description: "Owner project",
        technologies: ["TypeScript", "React"],
        github: { owner: "octocat", repo: "Hello-World", branch: "main" },
      }),
    );
    assert.equal(updated.id, created.id);
    assert.equal(updated.root, created.root);
    assert.deepEqual(await readdir(created.root), ["owner.txt"]);
    const restored = validateSnapshot(snapshot(store)).tables.projects.find(
      (p: any) => p.id === created.id,
    );
    assert.equal(restored.description, "Owner project");
    assert.deepEqual(restored.technologies, ["TypeScript", "React"]);
    assert.equal(restored.github.repo, "Hello-World");
    assert.equal(
      commandSchema.safeParse({
        op: "project.details",
        id: created.id,
        name: "X",
        description: "",
        technologies: [],
        root: "C:/",
      }).success,
      false,
    );
  } finally {
    service.close();
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
