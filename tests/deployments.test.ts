import { test } from "node:test";
import assert from "node:assert/strict";
import { Deployments } from "../src/core/deployments.ts";
const sha = "a".repeat(40),
  signal = () => new AbortController().signal;
const links = {
  vercel: {
    projectId: "prj_fixture",
    teamId: "team_fixture",
    target: "production" as const,
  },
  railway: {
    projectId: "11111111-1111-4111-8111-111111111111",
    serviceId: "22222222-2222-4222-8222-222222222222",
    environmentId: "33333333-3333-4333-8333-333333333333",
  },
};
test("Vercel checks only the linked project/team, reads actual deployment details, binds evidence to commit and rejects unproven state", async () => {
  let state = "READY",
    commit: string | undefined = sha;
  const requests: any[] = [];
  const adapter = new Deployments(
    (p) => (p === "vercel" ? "VERCEL_FIXTURE" : undefined),
    async (input, init) => {
      const url = new URL(String(input));
      requests.push({ url, init });
      if (url.pathname === "/v7/deployments")
        return Response.json({
          deployments: [
            {
              uid: "dpl_fixture",
              created: 1792677600000,
              projectId: "prj_fixture",
              target: "production",
            },
          ],
        });
      return Response.json({
        id: "dpl_fixture",
        projectId: "prj_fixture",
        readyState: state,
        target: "production",
        createdAt: 1792677600000,
        gitSource: { sha: commit },
        secret: "NEVER_RETURN",
      });
    },
  );
  let receipt = await adapter.check("vercel", links, signal(), sha);
  assert.equal(receipt.status, "verified");
  assert.equal(receipt.reference, "dpl_fixture");
  assert.equal(receipt.commit, sha);
  assert.ok(receipt.observedAt);
  assert.equal(receipt.provider, "Vercel");
  state = "SUCCESS";
  assert.equal(
    (await adapter.check("vercel", links, signal(), sha)).status,
    "unverified",
  );
  state = "READY";
  assert.equal(JSON.stringify(receipt).includes("NEVER_RETURN"), false);
  assert.equal(requests[0].url.origin, "https://api.vercel.com");
  assert.equal(requests[0].url.searchParams.get("projectId"), "prj_fixture");
  assert.equal(requests[0].url.searchParams.get("teamId"), "team_fixture");
  assert.equal(requests[1].url.searchParams.get("withGitRepoInfo"), "true");
  assert.ok(
    requests.every(
      (r) =>
        r.init.method === "GET" &&
        r.init.redirect === "error" &&
        r.init.headers.Authorization === "Bearer VERCEL_FIXTURE",
    ),
  );
  state = "ERROR";
  receipt = await adapter.check("vercel", links, signal(), sha);
  assert.equal(receipt.status, "failed");
  state = "BUILDING";
  receipt = await adapter.check("vercel", links, signal(), sha);
  assert.equal(receipt.status, "unverified");
  state = "READY";
  commit = "b".repeat(40);
  receipt = await adapter.check("vercel", links, signal(), sha);
  assert.equal(receipt.reason, "DEPLOYMENT_COMMIT_MISMATCH");
  assert.equal(receipt.status, "unverified");
  commit = undefined;
  assert.equal(
    (await adapter.check("vercel", links, signal(), sha)).reason,
    "DEPLOYMENT_COMMIT_UNAVAILABLE",
  );
});
test("Railway project tokens are environment scoped and only documented read queries are sent; missing commit proof stays unverified", async () => {
  let status = "SUCCESS",
    wrongScope = false;
  const requests: any[] = [];
  const adapter = new Deployments(
    (p) => (p === "railway" ? "RAILWAY_FIXTURE" : undefined),
    async (input, init) => {
      const body = JSON.parse(String(init?.body));
      requests.push({ input, init, body });
      if (body.query.includes("projectToken"))
        return Response.json({
          data: {
            projectToken: {
              projectId: links.railway.projectId,
              environmentId: wrongScope
                ? "44444444-4444-4444-8444-444444444444"
                : links.railway.environmentId,
            },
          },
        });
      return Response.json({
        data: {
          deployments: {
            edges: [
              {
                node: {
                  id: "55555555-5555-4555-8555-555555555555",
                  status,
                  createdAt: "2026-10-22T10:00:00Z",
                },
              },
            ],
          },
        },
      });
    },
  );
  let receipt = await adapter.check("railway", links, signal());
  assert.equal(receipt.status, "verified");
  assert.equal(receipt.provider, "Railway");
  status = "READY";
  assert.equal(
    (await adapter.check("railway", links, signal())).status,
    "unverified",
  );
  status = "SUCCESS";
  assert.ok(receipt.reference);
  assert.equal(
    requests[1].body.variables.input.environmentId,
    links.railway.environmentId,
  );
  assert.equal(
    requests[1].body.variables.input.serviceId,
    links.railway.serviceId,
  );
  assert.ok(
    requests.every(
      (r) =>
        String(r.input) === "https://backboard.railway.com/graphql/v2" &&
        r.init.method === "POST" &&
        r.init.headers["Project-Access-Token"] === "RAILWAY_FIXTURE" &&
        !r.init.headers.Authorization &&
        !r.body.query.includes("mutation"),
    ),
  );
  assert.equal(
    (await adapter.check("railway", links, signal(), sha)).reason,
    "DEPLOYMENT_COMMIT_UNAVAILABLE",
  );
  status = "CRASHED";
  assert.equal(
    (await adapter.check("railway", links, signal())).status,
    "failed",
  );
  wrongScope = true;
  const before = requests.length;
  await assert.rejects(
    adapter.check("railway", links, signal()),
    /DEPLOYMENT_SCOPE_MISMATCH/,
  );
  assert.equal(requests.length, before + 1);
});
test("deployment reads refuse missing credentials or links before network, sanitize errors, reject arbitrary endpoints and honor cancellation", async () => {
  let calls = 0;
  const adapter = new Deployments(
    () => undefined,
    async () => {
      calls++;
      throw Error("TOKEN_RAW_SECRET");
    },
  );
  await assert.rejects(
    adapter.check("vercel", links, signal()),
    /DEPLOYMENT_NOT_CONNECTED/,
  );
  assert.equal(calls, 0);
  const connected = new Deployments(
    () => "FIXTURE",
    async () => {
      calls++;
      return new Response("RAW_SECRET", { status: 401 });
    },
  );
  await assert.rejects(
    connected.check("vercel", links, signal()),
    /DEPLOYMENT_AUTH_INVALID/,
  );
  assert.equal(calls, 1);
  await assert.rejects(
    connected.check(
      "vercel",
      { vercel: { projectId: "https://evil.invalid" } },
      signal(),
    ),
    /DEPLOYMENT_LINK_INVALID/,
  );
  assert.equal(calls, 1);
  const control = new AbortController();
  control.abort();
  await assert.rejects(connected.check("vercel", links, control.signal));
  assert.equal(calls, 1);
  const malformed = new Deployments(
    () => "FIXTURE",
    async () =>
      Response.json({
        deployments: [
          { uid: "dpl_fixture", target: "production", projectId: "prj_other" },
        ],
      }),
  );
  await assert.rejects(
    malformed.check("vercel", links, signal()),
    /DEPLOYMENT_SCOPE_MISMATCH/,
  );
});
