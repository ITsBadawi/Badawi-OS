import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/core/store.ts";
import { Service } from "../src/core/service.ts";
import { commandSchema } from "../src/contracts.ts";
import { snapshot, validateSnapshot } from "../src/core/backup.ts";
import { parseDraft } from "../src/core/plans.ts";
function fixture() {
  const store = new Store(":memory:"),
    secrets = new Map<string, string>();
  let calls = 0,
    failNetwork = false,
    state = "ERROR",
    during: (() => void) | undefined;
  const service = new Service(
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
    async (input, init) => {
      calls++;
      if (failNetwork) throw Error("Synthetic transport failure");
      assert.equal(init?.method, "GET");
      assert.equal(new URL(String(input)).origin, "https://api.vercel.com");
      during?.();
      return String(input).includes("/v7/")
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
            readyState: state,
            target: "production",
            createdAt: 1792677600000,
            secret: "PROVIDER_PRIVATE",
          });
    },
  );
  const project = store.put("projects", {
    name: "Monitor fixture",
    archived: false,
    deployments: { vercel: { projectId: "prj_fixture", target: "production" } },
  });
  const save = (extra: any = {}) =>
    service.command(
      commandSchema.parse({
        op: "job.save",
        name: "Deployment monitor",
        kind: "integration",
        integration: "vercel",
        projectId: project.id,
        trigger: { type: "manual" },
        enabled: true,
        missedPolicy: "skip",
        ...extra,
      }),
    );
  return {
    store,
    secrets,
    service,
    project,
    save,
    get calls() {
      return calls;
    },
    failNetwork(value: boolean) {
      failNetwork = value;
    },
    during(fn: () => void) {
      during = fn;
    },
    close() {
      service.close();
      store.close();
    },
  };
}
test("unknown persisted job kinds fail visibly instead of inventing a successful reminder",async()=>{
  const f=fixture();
  try {
    const job=f.store.put("jobs",{name:"Future capability",kind:"unknown-future-kind",enabled:false,trigger:{type:"manual"}});
    await f.service.command({op:"engine.mode",mode:"Running",epoch:0});
    await f.service.command({op:"job.run",id:job.id});
    const run=f.store.all("runs")[0];
    assert.equal(run.status,"failed");
    assert.equal(run.reason,"UNSUPPORTED_JOB_KIND");
    assert.equal(run.result,undefined);
    assert.equal(f.calls,0);
    assert.ok(f.store.all("inbox").every(i=>i.runId===run.id));
  } finally {f.close();}
});

test("read retries retain separate owner consent, publish only one successful inspection, restore disabled and can be cancelled through the host", async () => {
  const f = fixture();
  try {
    f.secrets.set("integration.vercel", "PRIVATE_TOKEN");
    const retry = { maxAttempts: 2, delaySeconds: 15 };
    await assert.rejects(
      f.save({ retry }),
      /BACKGROUND_INTEGRATION_APPROVAL_REQUIRED/,
    );
    await assert.rejects(
      f.save({
        kind: "reminder",
        integration: undefined,
        projectId: undefined,
        retry,
      }),
      /RETRY_POLICY_UNSUPPORTED/,
    );
    const job = await f.save({ allowBackgroundIntegration: true, retry });
    await f.service.command({ op: "engine.mode", mode: "Running", epoch: 0 });
    f.failNetwork(true);
    await f.service.command({ op: "job.run", id: job.id });
    let run = f.store.all("runs")[0];
    assert.equal(run.status, "retryWaiting");
    assert.equal(f.store.all("inbox").length, 0);
    f.failNetwork(false);
    await f.service.engine.tick(Date.parse(run.nextRetryAt));
    run = f.store.get("runs", run.id)!;
    assert.equal(run.status, "succeeded");
    assert.equal(f.store.all("inbox").length, 1);
    assert.equal(run.attempts.length, 2);
    const restored = validateSnapshot(snapshot(f.store));
    assert.deepEqual(restored.tables.jobs[0].retry, retry);
    assert.equal(restored.tables.jobs[0].enabled, false);
    assert.ok(!("grant" in restored.tables.jobs[0]));
    f.failNetwork(true);
    await f.service.command({ op: "job.run", id: job.id });
    run = f.store.all("runs").find((r) => r.status === "retryWaiting")!;
    await f.service.command({ op: "run.cancel", id: run.id });
    assert.equal(f.store.get("runs", run.id)?.status, "cancelled");
    assert.equal(f.store.get("runs", run.id)?.nextRetryAt, null);
    const calls = f.calls;
    await f.service.engine.tick(Date.now() + 120000);
    assert.equal(f.calls, calls);
  } finally {
    f.close();
  }
});

test("integration monitoring requires independent consent and credentials, records failed health without inventing deployment success, and restores definitions without grants", async () => {
  const f = fixture();
  try {
    f.secrets.set("integration.vercel", "PRIVATE_TOKEN");
    await assert.rejects(f.save(), /BACKGROUND_INTEGRATION_APPROVAL_REQUIRED/);
    assert.equal(f.calls, 0);
    const draft = await f.save({ enabled: false });
    await f.service.command({ op: "engine.mode", mode: "Running", epoch: 0 });
    await f.service.command({ op: "job.run", id: draft.id });
    assert.equal(f.store.all("runs")[0].status, "blocked");
    assert.equal(f.calls, 0);
    const job = await f.save({
      id: draft.id,
      allowBackgroundIntegration: true,
    });
    await f.service.command({ op: "job.run", id: job.id });
    const run = f.store.all("runs")[0];
    assert.equal(run.status, "succeeded");
    assert.equal(run.result.inspection.status, "failed");
    assert.equal(run.result.inspection.state, "ERROR");
    assert.equal(f.calls, 2);
    const item = f.store.get("inbox", run.result.inboxId)!;
    assert.equal(item.evidence.type, "integration");
    assert.equal(item.evidence.projectId, f.project.id);
    assert.ok(item.body.includes("ERROR"));
    const bytes = snapshot(f.store);
    assert.ok(!bytes.toString().includes('"grant"'));
    assert.ok(!bytes.toString().includes('"allowBackgroundIntegration"'));
    const exported = validateSnapshot(bytes);
    assert.equal(exported.tables.jobs[0].integration, "vercel");
    assert.ok(!JSON.stringify(exported).includes("PRIVATE_TOKEN"));
    assert.ok(!JSON.stringify(exported).includes("PROVIDER_PRIVATE"));
    assert.ok(!("grant" in exported.tables.jobs[0]));
  } finally {
    f.close();
  }
});

test("workflow monitoring completes in order without granting background AI; credential and target changes invalidate pending assistant approval", async () => {
  const f = fixture();
  try {
    f.secrets.set("integration.vercel", "PRIVATE_TOKEN");
    const steps = [
      {
        kind: "integration",
        integration: "vercel",
        name: "Inspect deployment",
        projectId: f.project.id,
      },
      {
        kind: "reminder",
        name: "Review actual finding",
        message: "Review {{previous}}",
      },
    ];
    const job = await f.save({
      kind: "workflow",
      integration: undefined,
      projectId: undefined,
      steps,
      allowBackgroundIntegration: true,
    });
    assert.equal(job.steps[0].grant.hash.length, 64);
    assert.ok(!job.steps[1].grant);
    await f.service.command({ op: "engine.mode", mode: "Running", epoch: 0 });
    await f.service.command({ op: "job.run", id: job.id });
    const run = f.store.all("runs")[0];
    assert.equal(run.status, "succeeded");
    assert.equal(run.steps.length, 2);
    assert.equal(run.steps[0].result.inspection.status, "failed");
    assert.ok(
      f.store
        .all("inbox")
        .some((i) => i.body.includes("Review") && i.body.includes("ERROR")),
    );
    const proposal = f.service.assistant.propose("fixture-chat", [
      {
        op: "job.save",
        name: "Reviewed monitor",
        kind: "integration",
        integration: "vercel",
        projectId: f.project.id,
        enabled: true,
        allowBackgroundIntegration: true,
        trigger: { type: "manual" },
        missedPolicy: "skip",
      },
    ]);
    await f.service.command({
      op: "integration.save",
      integration: "vercel",
      token: "REPLACEMENT_TOKEN",
    });
    await assert.rejects(
      f.service.assistant.execute(proposal.id, (c) => f.service.command(c)),
      /APPROVAL_STALE/,
    );
    assert.equal(f.calls, 2);
  } finally {
    f.close();
  }
});

test("monitor drafts remain disabled and cannot introduce consent, unknown projects or arbitrary providers", () => {
  const draft = {
    name: "Inspect",
    kind: "integration",
    integration: "github",
    message: null,
    noteIds: [],
    projectId: "p",
    trigger: { type: "manual" },
    missedPolicy: "skip",
  };
  assert.equal(parseDraft(JSON.stringify(draft), [], ["p"]).enabled, false);
  assert.throws(
    () =>
      parseDraft(
        JSON.stringify({ ...draft, allowBackgroundIntegration: true }),
        [],
        ["p"],
      ),
    /INVALID_AUTOMATION_DRAFT/,
  );
  assert.throws(
    () =>
      parseDraft(JSON.stringify({ ...draft, projectId: "other" }), [], ["p"]),
    /DRAFT_SOURCE_DENIED/,
  );
  assert.throws(
    () =>
      parseDraft(
        JSON.stringify({ ...draft, integration: "arbitrary" }),
        [],
        ["p"],
      ),
    /INVALID_AUTOMATION_DRAFT/,
  );
});

test("GitHub and Railway recipes reuse bounded read adapters, keep unknown Git comparison unknown and bind Railway project/environment/service", async () => {
  const store = new Store(":memory:"),
    secrets = new Map([["integration.railway", "PROJECT_TOKEN"]]),
    requests: any[] = [];
  const railway = {
    projectId: "11111111-1111-4111-8111-111111111111",
    serviceId: "22222222-2222-4222-8222-222222222222",
    environmentId: "33333333-3333-4333-8333-333333333333",
  };
  const service = new Service(
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
    async (input, init) => {
      requests.push({ url: String(input), init });
      const u = new URL(String(input));
      if (u.origin === "https://api.github.com") {
        assert.equal(init?.method, "GET");
        return Response.json(
          u.pathname.endsWith("/commits/main")
            ? { sha: "a".repeat(40) }
            : {
                id: 123,
                default_branch: "main",
                private: false,
                archived: false,
                size: 1,
              },
        );
      }
      assert.equal(String(input), "https://backboard.railway.com/graphql/v2");
      const b = JSON.parse(String(init?.body));
      assert.ok(b.query.startsWith("query "));
      assert.ok(!b.query.includes("mutation"));
      if (b.query.includes("projectToken"))
        return Response.json({
          data: {
            projectToken: {
              projectId: railway.projectId,
              environmentId: railway.environmentId,
            },
          },
        });
      assert.deepEqual(b.variables.input, railway);
      return Response.json({
        data: {
          deployments: {
            edges: [
              {
                node: {
                  id: "55555555-5555-4555-8555-555555555555",
                  status: "SUCCESS",
                  createdAt: "2026-10-22T10:00:00Z",
                },
              },
            ],
          },
        },
      });
    },
  );
  try {
    const p = store.put("projects", {
      name: "Bound links",
      github: { owner: "fixture", repo: "example", branch: "main" },
      deployments: { railway },
    });
    await service.command({ op: "engine.mode", mode: "Running", epoch: 0 });
    for (const integration of ["github", "railway"]) {
      const job = await service.command(
        commandSchema.parse({
          op: "job.save",
          name: integration,
          kind: "integration",
          integration,
          projectId: p.id,
          enabled: true,
          allowBackgroundIntegration: true,
          trigger: { type: "manual" },
          missedPolicy: "skip",
        }),
      );
      await service.command({ op: "job.run", id: job.id });
      const run = store.all("runs")[0];
      assert.equal(run.status, "succeeded");
      assert.equal(
        run.result.inspection.status,
        integration === "github" ? "unverified" : "verified",
      );
      assert.ok(
        run.result.inspection.target.includes(
          integration === "github" ? "example" : railway.environmentId,
        ),
      );
    }
    assert.equal(requests.length, 4);
    assert.ok(!JSON.stringify(service.snapshot()).includes("PROJECT_TOKEN"));
    await service.command({
      op: "integration.disconnect",
      integration: "railway",
    });
    assert.equal(
      store.all("jobs").find((j) => j.integration === "railway")?.enabled,
      false,
    );
  } finally {
    service.close();
    store.close();
  }
});
test("changed credentials and targets revoke scheduled integration grants and prevent all future requests", async () => {
  const f = fixture();
  try {
    f.secrets.set("integration.vercel", "PRIVATE_TOKEN");
    const job = await f.save({ allowBackgroundIntegration: true });
    await f.service.command({
      op: "integration.save",
      integration: "vercel",
      token: "REPLACEMENT_TOKEN",
    });
    assert.equal(f.store.get("jobs", job.id)?.enabled, false);
    await f.service.command({ op: "engine.mode", mode: "Running", epoch: 0 });
    await f.service.command({ op: "job.run", id: job.id });
    assert.equal(f.calls, 0);
    await f.save({ id: job.id, allowBackgroundIntegration: true });
    f.store.put("projects", {
      ...f.project,
      deployments: { vercel: { projectId: "prj_other", target: "production" } },
    });
    await f.service.command({ op: "job.run", id: job.id });
    assert.equal(f.calls, 0);
    assert.equal(f.store.all("runs")[0].status, "blocked");
  } finally {
    f.close();
  }
});
test("revocation during a request cannot publish an inspection and workflow steps require their own bound grant", async () => {
  const f = fixture();
  try {
    f.secrets.set("integration.vercel", "PRIVATE_TOKEN");
    const job = await f.save({
      kind: "workflow",
      integration: undefined,
      projectId: undefined,
      steps: [
        {
          kind: "integration",
          integration: "vercel",
          name: "Inspect",
          projectId: f.project.id,
        },
      ],
      allowBackgroundIntegration: true,
    });
    await f.service.command({ op: "engine.mode", mode: "Running", epoch: 0 });
    f.during(() => {
      f.secrets.set("integration.vercel", "CHANGED_DURING_REQUEST");
    });
    await f.service.command({ op: "job.run", id: job.id });
    assert.ok(f.calls > 0);
    assert.notEqual(f.store.all("runs")[0].status, "succeeded");
    assert.equal(
      f.store.all("inbox").filter((i) => i.evidence?.type === "integration")
        .length,
      0,
    );
  } finally {
    f.close();
  }
});
