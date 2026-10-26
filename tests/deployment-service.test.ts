import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/core/store.ts";
import { Service } from "../src/core/service.ts";
import { commandSchema } from "../src/contracts.ts";
import { snapshot, validateSnapshot } from "../src/core/backup.ts";
const sha = "a".repeat(40),
  link = { projectId: "prj_fixture", target: "production" as const };
function fixture(transport: typeof fetch) {
  const store = new Store(":memory:"),
    secrets = new Map<string, string>(),
    service = new Service(
      store,
      {
        pickProject: async () => null,
        pickKey: async () => null,
        pickRestoreDirectory: async () => null,
        saveText: async () => false,
        openAuth: async () => {},
        secrets: {
          get: (k) => secrets.get(k),
          set: (k, v) => {
            secrets.set(k, v);
          },
          remove: (k) => {
            secrets.delete(k);
          },
        },
      },
      "unused-stage",
      transport,
    );
  return {
    store,
    service,
    secrets,
    close: () => {
      service.close();
      store.close();
    },
  };
}
const response = (url: unknown) =>
  String(url).includes("/v7/")
    ? Response.json({
        deployments: [
          {
            uid: "dpl_fixture",
            projectId: "prj_fixture",
            created: 1792677600000,
            target: "production",
          },
        ],
      })
    : Response.json({
        id: "dpl_fixture",
        projectId: "prj_fixture",
        readyState: "READY",
        target: "production",
        createdAt: 1792677600000,
        gitSource: { sha },
      });
test("deployment checks persist allowlisted receipts and explicit task evidence while secrets stay out of renderer and restored backups", async () => {
  const f = fixture(async (url) => response(url));
  try {
    const p = f.store.put("projects", {
      name: "Deployment fixture",
      deployments: { vercel: link },
      archived: false,
    });
    await f.service.command(
      commandSchema.parse({
        op: "integration.save",
        integration: "vercel",
        token: "SECRET_VERCEL_FIXTURE",
      }),
    );
    assert.equal(f.service.snapshot().integrations.vercel.configured, true);
    await f.service.command({ op: "engine.mode", mode: "Running", epoch: 0 });
    const receipt = await f.service.command(
      commandSchema.parse({
        op: "deployment.check",
        projectId: p.id,
        provider: "vercel",
      }),
    );
    assert.equal(receipt.status, "verified");
    assert.equal(
      f.service.snapshot().projects[0].deploymentChecks.vercel.reference,
      "dpl_fixture",
    );
    const task = await f.service.command(
      commandSchema.parse({
        op: "task.save",
        title: "Deployment criterion",
        done: true,
        projectId: p.id,
        evidenceCommit: sha,
        acceptanceCriteria: [
          {
            id: "d",
            text: "The requested release is ready",
            source: "deployment",
            target: "vercel",
          },
        ],
      }),
    );
    let v = await f.service.command({ op: "task.verify", id: task.id });
    assert.equal(v.state, "needsReview");
    await f.service.command({
      op: "task.criteria.review",
      id: task.id,
      criterionId: "d",
      accepted: true,
    });
    v = await f.service.command({ op: "task.verify", id: task.id });
    assert.equal(v.state, "verified");
    assert.equal(v.evidence[0].reference, "dpl_fixture");
    const data = JSON.stringify(f.service.snapshot()),
      backup = snapshot(f.store);
    assert.ok(!data.includes("SECRET_VERCEL_FIXTURE"));
    assert.ok(!backup.toString().includes("SECRET_VERCEL_FIXTURE"));
    const restored = validateSnapshot(backup);
    assert.equal(
      restored.tables.projects[0].deployments.vercel.projectId,
      "prj_fixture",
    );
    assert.equal(restored.tables.projects[0].deploymentChecks, undefined);
    assert.equal(restored.tables.tasks[0].verification, undefined);
    assert.equal(
      f.service.assistant.validate({
        op: "deployment.check",
        projectId: p.id,
        provider: "vercel",
      }).op,
      "deployment.check",
    );
    assert.throws(
      () =>
        f.service.assistant.validate({
          op: "integration.save",
          integration: "vercel",
          token: "SECRET",
        }),
      /ASSISTANT_ACTION_DENIED/,
    );
    await f.service.command(
      commandSchema.parse({
        op: "integration.disconnect",
        integration: "vercel",
      }),
    );
    assert.equal(
      f.service.snapshot().projects[0].deploymentChecks.vercel,
      null,
    );
    assert.equal(f.service.snapshot().integrations.vercel.configured, false);
  } finally {
    f.close();
  }
});
test(
  "changing a linked deployment during a request cannot publish a receipt for the old scope",
  { timeout: 5000 },
  async () => {
    let started!: () => void, release!: () => void;
    const readStarted = new Promise<void>((r) => (started = r)),
      held = new Promise<void>((r) => (release = r));
    const f = fixture(async (url) => {
      if (String(url).includes("/v13/")) {
        started();
        await held;
      }
      return response(url);
    });
    try {
      const p = f.store.put("projects", {
        name: "Scope fixture",
        deployments: { vercel: link },
      });
      await f.service.command({
        op: "integration.save",
        integration: "vercel",
        token: "FIXTURE",
      });
      await f.service.command({ op: "engine.mode", mode: "Running", epoch: 0 });
      const pending = f.service.command({
        op: "deployment.check",
        projectId: p.id,
        provider: "vercel",
      });
      await readStarted;
      await f.service.command(
        commandSchema.parse({
          op: "project.details",
          id: p.id,
          name: p.name,
          deployments: {
            vercel: { projectId: "prj_changed", target: "production" },
          },
        }),
      );
      release();
      await assert.rejects(
        pending,
        (error: any) =>
          error.message === "PERMISSION_REVOKED" || error.name === "AbortError",
      );
      assert.equal(
        f.service.snapshot().projects[0].deploymentChecks.vercel,
        null,
      );
    } finally {
      release?.();
      f.close();
    }
  },
);
