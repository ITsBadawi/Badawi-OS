import { _electron as electron } from "playwright-core";
import { mkdtemp, rm, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const dir = await mkdtemp(path.join(tmpdir(), "badawi-project-ui-")),
  checks = [],
  errors = [];
let app, page;
const command = async (c) => {
  const r = await page.evaluate((c) => window.badawi.command(c), c);
  if (!r.ok) throw Error(r.error);
  return r.data;
};
try {
  const env = {
    ...process.env,
    BADAWI_DATA_DIR: path.join(dir, "data"),
    BADAWI_BACKGROUND: "1",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: ["."], env });
  page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page
    .getByRole("button", { name: "لوحة التحكم", exact: true })
    .waitFor();
  await command({ op: "workspace.create", path: dir, inbox: true });
  let state = await command({ op: "snapshot" });
  await command({
    op: "engine.mode",
    mode: "Running",
    epoch: state.engine.epoch,
  });
  await page.getByRole("button", { name: "المشاريع", exact: true }).click();
  await page
    .getByRole("button", { name: "إنشاء مشروع جديد", exact: true })
    .click();
  await page.getByLabel("اسم المشروع", { exact: true }).fill("Desktop Project");
  await page
    .getByLabel("اسم مجلد المشروع", { exact: true })
    .fill("desktop-project");
  await page
    .getByRole("button", { name: "مراجعة إنشاء المشروع", exact: true })
    .click();
  assert.deepEqual(await readdir(path.join(dir, "Projects")), []);
  await page
    .getByRole("button", { name: "إنشاء المجلد وربط المشروع", exact: true })
    .click();
  await page.getByRole("status").filter({ hasText: "أُنشئ المشروع" }).waitFor();
  assert.deepEqual(
    await readdir(path.join(dir, "Projects", "desktop-project")),
    [],
  );
  checks.push(
    "Creation shows a review before creating an exclusive empty project under Projects",
  );
  await page
    .getByRole("button")
    .filter({
      has: page.getByRole("heading", { name: "Desktop Project", exact: true }),
    })
    .click();
  await page.getByText("بيانات المشروع", { exact: true }).click();
  await page
    .getByLabel("وصف المشروع", { exact: true })
    .fill("Useful local project");
  await page
    .getByLabel("تقنيات المشروع", { exact: true })
    .fill("React, TypeScript");
  await page.getByLabel("مالك مستودع GitHub", { exact: true }).fill("octocat");
  await page
    .getByLabel("اسم مستودع GitHub", { exact: true })
    .fill("Hello-World");
  await page
    .getByRole("button", { name: "حفظ بيانات المشروع", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "حُفظت بيانات المشروع" })
    .waitFor();
  state = await command({ op: "snapshot" });
  const p = state.projects.find((p) => p.name === "Desktop Project");
  assert.deepEqual(p.technologies, ["React", "TypeScript"]);
  assert.equal(p.github.repo, "Hello-World");
  assert.equal(p.description, "Useful local project");
  assert.deepEqual(await readdir(p.root), []);
  checks.push(
    "Project description, technologies and GitHub reference persist without writing code",
  );
  await app.evaluate(() => {
    globalThis.fetch = async (url, init) => {
      if (
        !String(url).startsWith(
          "https://api.github.com/repos/octocat/Hello-World",
        )
      )
        throw Error("Unexpected endpoint");
      return Response.json(
        String(url).includes("/commits/")
          ? { sha: "a".repeat(40) }
          : {
              id: 1296269,
              private: false,
              archived: false,
              default_branch: "master",
            },
      );
    };
  });
  await page
    .getByRole("button", { name: "فحص GitHub المرتبط", exact: true })
    .click();
  await page.getByText("GitHub REST API", { exact: false }).waitFor();
  state = await command({ op: "snapshot" });
  const checked = state.projects.find((x) => x.id === p.id).githubCheck;
  assert.equal(checked.remoteHead, "a".repeat(40));
  assert.equal(checked.comparison.state, "unverified");
  checks.push(
    "Actual host GitHub request updates timestamped remote evidence without inventing local comparison",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "الإعدادات", exact: true }).click();
  await page
    .getByLabel("رمز GitHub", { exact: true })
    .fill("fixture-private-github-token");
  await page
    .getByRole("button", { name: "حفظ رمز GitHub", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "حُفظ رمز GitHub" })
    .waitFor();
  state = await command({ op: "snapshot" });
  assert.equal(state.integrations.github.configured, true);
  assert.ok(!JSON.stringify(state).includes("fixture-private-github-token"));
  assert.equal(
    await page.getByLabel("رمز GitHub", { exact: true }).inputValue(),
    "",
  );
  checks.push(
    "GitHub settings retain a protected credential without exposing it in snapshots or leaving the input filled",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/validation/projects-desktop.json",
    JSON.stringify(
      { date: new Date().toISOString(), checks, errors, liveGitHub: false },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks, errors }));
} finally {
  if (app) await app.close();
  await rm(dir, { recursive: true, force: true });
}
