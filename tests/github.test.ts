import { test } from "node:test";
import assert from "node:assert/strict";
import { GitHub } from "../src/core/github.ts";
test("GitHub reads official repository and immutable commit comparison with explicit credentials, bounded URLs and receipts", async () => {
  const local = "a".repeat(40),
    remote = "b".repeat(40),
    calls: string[] = [];
  const github = new GitHub(
    () => "private-fixture-token",
    async (input, init) => {
      const u = new URL(String(input));
      calls.push(u.pathname);
      assert.equal(u.origin, "https://api.github.com");
      assert.equal(init?.method, "GET");
      assert.equal(init?.redirect, "error");
      assert.equal(
        (init?.headers as any).Authorization,
        "Bearer private-fixture-token",
      );
      if (u.pathname.endsWith("/compare/" + remote + "..." + local))
        return Response.json({ status: "diverged", ahead_by: 2, behind_by: 1 });
      if (u.pathname.includes("/commits/"))
        return Response.json({ sha: remote });
      return Response.json({
        id: 12,
        full_name: "owner/repo",
        default_branch: "main",
        private: true,
        archived: false,
        pushed_at: "2026-01-01T00:00:00Z",
        size: 4,
      });
    },
  );
  const receipt = await github.check(
    { owner: "owner", repo: "repo" },
    local,
    new AbortController().signal,
  );
  assert.equal(receipt.remoteHead, remote);
  assert.equal(receipt.comparison.ahead, 2);
  assert.equal(receipt.comparison.behind, 1);
  assert.equal(receipt.comparison.state, "diverged");
  assert.equal(receipt.source, "GitHub REST API");
  assert.ok(receipt.checkedAt);
  assert.equal(calls.length, 3);
  assert.ok(!JSON.stringify(receipt).includes("private-fixture-token"));
  await assert.rejects(
    github.check(
      { owner: "../evil", repo: "repo" },
      local,
      new AbortController().signal,
    ),
    /GITHUB_TARGET_INVALID/,
  );
  assert.equal(calls.length, 3);
});
test("unpublished or unavailable local commit comparison stays unverified; authentication failure never falls back to anonymous", async () => {
  let calls = 0;
  const github = new GitHub(
    () => undefined,
    async (input) => {
      calls++;
      const u = String(input);
      if (u.includes("/compare/")) return new Response("", { status: 404 });
      if (u.includes("/commits/"))
        return Response.json({ sha: "b".repeat(40) });
      return Response.json({
        id: 1,
        full_name: "owner/repo",
        default_branch: "main",
        private: false,
        archived: false,
      });
    },
  );
  const r = await github.check(
    { owner: "owner", repo: "repo" },
    "a".repeat(40),
    new AbortController().signal,
  );
  assert.equal(r.comparison.state, "unverified");
  assert.equal(r.comparison.reason, "GITHUB_NOT_FOUND_OR_DENIED");
  let authCalls = 0;
  const denied = new GitHub(
    () => "fixture",
    async () => {
      authCalls++;
      return new Response("", { status: 401 });
    },
  );
  await assert.rejects(
    denied.check(
      { owner: "owner", repo: "repo" },
      undefined,
      new AbortController().signal,
    ),
    /GITHUB_AUTH_INVALID/,
  );
  assert.equal(authCalls, 1);
  assert.equal(calls, 3);
});
test("an actual empty GitHub repository is reported without inventing a commit", async () => {
  const github = new GitHub(() => "fixture", async (input) =>
    String(input).includes("/commits/")
      ? Response.json({ message: "Git Repository is empty." }, { status: 409 })
      : Response.json({ id: 10, private: true, archived: false, default_branch: "main", size: 0 }),
  );
  const result = await github.check({ owner: "owner", repo: "empty" }, undefined, new AbortController().signal);
  assert.equal(result.remoteHead, null);
  assert.equal(result.comparison.state, "unverified");
  assert.equal(result.comparison.reason, "GITHUB_EMPTY_REPOSITORY");
});
test('CI evidence is bound to the requested commit and latest selected workflow run, with unknown or incomplete data never passing',async()=>{
 const sha='a'.repeat(40);let conclusion='success',status='completed',total=2;
 const github=new GitHub(()=>undefined,async(input,init)=>{const url=new URL(String(input));assert.equal(url.pathname,'/repos/owner/repo/actions/runs');assert.equal(url.searchParams.get('head_sha'),sha);assert.equal(init?.method,'GET');return Response.json({total_count:total,workflow_runs:[{id:12,workflow_id:4,head_sha:sha,path:'.github/workflows/tests.yml',name:'Tests',status,conclusion},{id:11,workflow_id:4,head_sha:sha,path:'.github/workflows/tests.yml',name:'Tests',status:'completed',conclusion:'failure'}]});});
 let receipt=await github.workflowEvidence({owner:'owner',repo:'repo'},sha,'tests.yml',new AbortController().signal);assert.equal(receipt.status,'verified');assert.match(receipt.reference!,/\/actions\/runs\/12$/);
 conclusion='failure';receipt=await github.workflowEvidence({owner:'owner',repo:'repo'},sha,'tests.yml',new AbortController().signal);assert.equal(receipt.status,'failed');
 status='in_progress';conclusion='';receipt=await github.workflowEvidence({owner:'owner',repo:'repo'},sha,'tests.yml',new AbortController().signal);assert.equal(receipt.status,'unverified');
 total=101;receipt=await github.workflowEvidence({owner:'owner',repo:'repo'},sha,'tests.yml',new AbortController().signal);assert.equal(receipt.reason,'CI_RESULTS_INCOMPLETE');
});
