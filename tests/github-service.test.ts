import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/core/store.ts";
import { Service } from "../src/core/service.ts";
import { commandSchema } from "../src/contracts.ts";
import { snapshot } from "../src/core/backup.ts";
test("GitHub credential remains in the protected host store and project checks require an explicit bounded repository", async () => {
  const store = new Store(":memory:"),
    keys = new Map<string, string>();
  let calls = 0;
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
    "unused",
    async (input) => {
      calls++;
      if (String(input).includes("/commits/"))
        return Response.json({ sha: "c".repeat(40) });
      return Response.json({
        id: 1,
        private: true,
        archived: false,
        default_branch: "main",
      });
    },
  );
  try {
    await service.command(
      commandSchema.parse({
        op: "integration.save",
        integration: "github",
        token: "fixture-token-secret",
      }),
    );
    assert.equal(service.snapshot().integrations.github.configured, true);
    assert.ok(
      !JSON.stringify(service.snapshot()).includes("fixture-token-secret"),
    );
    assert.ok(!snapshot(store).toString().includes("fixture-token-secret"));
    const p = store.put("projects", {
      name: "Repository",
      root: null,
      github: { owner: "owner", repo: "repo" },
    });
    const state = service.snapshot();
    await service.command({
      op: "engine.mode",
      mode: "Running",
      epoch: state.engine.epoch,
    });
    const receipt = await service.command(
      commandSchema.parse({ op: "github.check", projectId: p.id }),
    );
    assert.equal(receipt.remoteHead, "c".repeat(40));
    assert.equal(receipt.comparison.state, "unverified");
    assert.equal(calls, 2);
    assert.ok(service.snapshot().projects[0].githubCheck.checkedAt);
    await service.command(
      commandSchema.parse({
        op: "project.details",
        id: p.id,
        name: p.name,
        github: { owner: "owner", repo: "another" },
      }),
    );
    assert.equal(service.snapshot().projects[0].githubCheck, null);
    await service.command(
      commandSchema.parse({
        op: "integration.disconnect",
        integration: "github",
      }),
    );
    assert.equal(keys.get("integration.github"), undefined);
    assert.equal(service.snapshot().integrations.github.configured, false);
  } finally {
    service.close();
    store.close();
  }
});
