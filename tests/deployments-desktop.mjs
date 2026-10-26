import { _electron as electron } from "playwright-core";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const dir = await mkdtemp(path.join(tmpdir(), "badawi-deployments-ui-")),
  checks = [],
  errors = [];
let app, page;
const command = async (c) => {
  const r = await page.evaluate((c) => window.badawi.command(c), c);
  if (!r.ok) throw Error(r.error);
  return r.data;
};
const env = {
  ...process.env,
  BADAWI_DATA_DIR: path.join(dir, "data"),
  BADAWI_BACKGROUND: "1",
};
delete env.ELECTRON_RUN_AS_NODE;
async function launch() {
  app = await electron.launch({ args: ["."], env });
  page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("button", { name: "المهام", exact: true }).waitFor();
}
async function openProject(name) {
  await page.getByRole("button", { name: "المشاريع", exact: true }).click();
  await page
    .getByRole("button")
    .filter({ has: page.getByRole("heading", { name, exact: true }) })
    .click();
}
try {
  await launch();
  await page.getByRole("button", { name: "الإعدادات", exact: true }).click();
  for (const provider of ["Vercel", "Railway"]) {
    await page
      .getByLabel(`رمز ${provider}`, { exact: true })
      .fill(`${provider.toUpperCase()}_PRIVATE_FIXTURE_TOKEN`);
    await page
      .getByRole("button", { name: `حفظ رمز ${provider}`, exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: `حُفظ رمز ${provider}` })
      .waitFor();
    assert.equal(
      await page.getByLabel(`رمز ${provider}`, { exact: true }).inputValue(),
      "",
    );
  }
  checks.push(
    "Owner saves separate protected Vercel and Railway tokens; credential inputs clear after host confirmation",
  );
  const p = await command({ op: "workspace.add", path: dir });
  await openProject(p.name);
  await page.getByText("بيانات المشروع", { exact: true }).click();
  await page.getByLabel("ربط Vercel", { exact: true }).check();
  await page
    .getByLabel("Vercel Project ID", { exact: true })
    .fill("prj_fixture");
  await page.getByLabel("ربط Railway", { exact: true }).check();
  await page
    .getByLabel("Railway Project ID", { exact: true })
    .fill("11111111-1111-4111-8111-111111111111");
  await page
    .getByLabel("Railway Service ID", { exact: true })
    .fill("22222222-2222-4222-8222-222222222222");
  await page
    .getByLabel("Railway Environment ID", { exact: true })
    .fill("33333333-3333-4333-8333-333333333333");
  await page
    .getByRole("button", { name: "حفظ بيانات المشروع", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "حُفظت بيانات المشروع" })
    .waitFor();
  await app.evaluate(() => {
    globalThis.__deploymentReads = [];
    globalThis.fetch = async (input, init) => {
      const u = new URL(String(input));
      globalThis.__deploymentReads.push({
        origin: u.origin,
        method: init.method,
      });
      if (u.origin === "https://api.vercel.com") {
        if (init.method !== "GET") throw Error("Unexpected write");
        return Response.json(
          u.pathname === "/v7/deployments"
            ? {
                deployments: [
                  {
                    uid: "dpl_fixture",
                    projectId: "prj_fixture",
                    created: 1792677600000,
                    target: "production",
                  },
                ],
              }
            : {
                id: "dpl_fixture",
                projectId: "prj_fixture",
                readyState: "READY",
                target: "production",
                createdAt: 1792677600000,
                gitSource: { sha: "a".repeat(40) },
              },
        );
      }
      if (u.origin === "https://backboard.railway.com") {
        const body = JSON.parse(init.body);
        if (
          !body.query.startsWith("query ") ||
          body.query.includes("mutation") ||
          init.headers.Authorization
        )
          throw Error("Unexpected operation");
        return Response.json(
          body.query.includes("projectToken")
            ? {
                data: {
                  projectToken: {
                    projectId: "11111111-1111-4111-8111-111111111111",
                    environmentId: "33333333-3333-4333-8333-333333333333",
                  },
                },
              }
            : {
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
              },
        );
      }
      throw Error("Unexpected endpoint");
    };
  });
  let state = await command({ op: "snapshot" });
  await command({
    op: "engine.mode",
    mode: "Running",
    epoch: state.engine.epoch,
  });
  await page
    .getByRole("button", { name: "فحص نشر Vercel", exact: true })
    .click();
  await page
    .getByTestId("deployment-vercel-state")
    .filter({ hasText: "READY" })
    .waitFor();
  await page
    .getByRole("button", { name: "فحص نشر Railway", exact: true })
    .click();
  await page
    .getByTestId("deployment-railway-state")
    .filter({ hasText: "SUCCESS" })
    .waitFor();
  state = await command({ op: "snapshot" });
  const checked = state.projects.find((x) => x.id === p.id);
  assert.equal(checked.deploymentChecks.vercel.reference, "dpl_fixture");
  assert.equal(checked.deploymentChecks.railway.status, "verified");
  assert.ok(checked.deploymentChecks.railway.observedAt);
  assert.equal(
    (await app.evaluate(() => globalThis.__deploymentReads)).length,
    4,
  );
  checks.push(
    "Native project link controls feed read-only adapters and display exact provider receipts with observation times (controlled remote responses)",
  );
  const task = await command({
    op: "task.save",
    title: "Release evidence",
    done: true,
    projectId: p.id,
    evidenceCommit: "a".repeat(40),
    acceptanceCriteria: [
      {
        id: "d",
        text: "Release is ready at this commit",
        source: "deployment",
        target: "vercel",
      },
    ],
  });
  await command({
    op: "task.criteria.review",
    id: task.id,
    criterionId: "d",
    accepted: true,
  });
  assert.equal(
    (await command({ op: "task.verify", id: task.id })).state,
    "verified",
  );
  checks.push(
    "Actual task verification consumes the linked deployment receipt and explicit owner acceptance",
  );
  await page.screenshot({
    path: "docs/validation/deployments-desktop.png",
    fullPage: true,
  });
  assert.ok(!JSON.stringify(state).includes("PRIVATE_FIXTURE_TOKEN"));
  await app.close();
  app = null;
  const db = await readFile(path.join(dir, "data", "badawi.db"));
  assert.ok(!db.includes(Buffer.from("VERCEL_PRIVATE_FIXTURE_TOKEN")));
  assert.ok(!db.includes(Buffer.from("RAILWAY_PRIVATE_FIXTURE_TOKEN")));
  await launch();
  state = await command({ op: "snapshot" });
  assert.equal(state.integrations.vercel.configured, true);
  assert.equal(state.integrations.railway.configured, true);
  assert.equal(state.engine.mode, "Stop");
  assert.equal(
    state.projects.find((x) => x.id === p.id).deploymentChecks.vercel.reference,
    "dpl_fixture",
  );
  checks.push(
    "Windows encrypted secrets and historical receipts survive restart; engine stays stopped without replaying checks",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/validation/deployments-desktop.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        checks,
        errors,
        scope:
          "Real Electron/SQLite/Windows safeStorage with controlled deployment API responses. No real owner Vercel/Railway account or deployment has been verified or changed.",
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks, errors }));
} finally {
  if (app) await app.close();
  await rm(dir, { recursive: true, force: true });
}
