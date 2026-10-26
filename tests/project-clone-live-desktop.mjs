import { _electron as electron } from "playwright-core";
import { mkdtemp, rm, readdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const dir = await mkdtemp(path.join(tmpdir(), "badawi-live-clone-")),
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
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page
    .getByRole("button", { name: "لوحة التحكم", exact: true })
    .waitFor();
  await command({ op: "workspace.create", path: dir, inbox: false });
  let state = await command({ op: "snapshot" });
  assert.equal(state.integrations.github.configured, false);
  await command({
    op: "engine.mode",
    mode: "Running",
    epoch: state.engine.epoch,
  });
  await app.evaluate(() => {
    const cp = process.getBuiltinModule("node:child_process"),
      original = cp.execFile;
    cp.execFile = function (binary, args, options, callback) {
      if (
        Array.isArray(args) &&
        args.includes("https://github.com/octocat/Hello-World.git")
      )
        return original.call(
          this,
          binary,
          args,
          { ...options, env: { ...options.env, GIT_TRACE_CURL: "1" } },
          (error, stdout, stderr) => {
            globalThis.__publicCloneDiagnostic = {
              code: error?.code,
              killed: error?.killed,
              signal: error?.signal,
              stderr: String(stderr)
                .split("\n")
                .filter((l) =>
                  /Cloning|fatal:|Trying |connect|IPv[46]|resolved|Resolving|Connected/i.test(
                    l,
                  ),
                )
                .join("\n")
                .slice(0, 3000),
            };
            callback(error, stdout, stderr);
          },
        );
      return original.apply(this, arguments);
    };
  });
  await page.getByRole("button", { name: "المشاريع", exact: true }).click();
  await page
    .getByRole("button", { name: "استنساخ من GitHub", exact: true })
    .click();
  await page
    .getByLabel("اسم المشروع المستنسخ", { exact: true })
    .fill("Live public clone");
  await page
    .getByLabel("مجلد المشروع المستنسخ", { exact: true })
    .fill("hello-world");
  await page
    .getByLabel("مالك المستودع للاستنساخ", { exact: true })
    .fill("octocat");
  await page
    .getByLabel("المستودع للاستنساخ", { exact: true })
    .fill("Hello-World");
  await page
    .getByRole("button", { name: "معاينة الاستنساخ", exact: true })
    .click();
  await page
    .getByRole("button", { name: "أوافق، استنسخ المشروع", exact: true })
    .waitFor({ timeout: 45000 });
  assert.deepEqual(await readdir(path.join(dir, "Projects")), []);
  checks.push(
    "Real GitHub API preview identifies a repository head without creating files before approval",
  );
  await page
    .getByRole("button", { name: "أوافق، استنسخ المشروع", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({
      hasText:
        /اكتمل الاستنساخ والتحقق|لم يكتمل استنساخ|تجاوز الاستنساخ|توقف الاستنساخ|تغيّر Commit/,
    })
    .waitFor({ timeout: 150000 });
  state = await command({ op: "snapshot" });
  const project = state.projects.find((p) => p.name === "Live public clone");
  assert.ok(
    project,
    JSON.stringify(
      await app.evaluate(() => globalThis.__publicCloneDiagnostic),
    ),
  );
  assert.equal(project.root, path.join(dir, "Projects", "hello-world"));
  assert.ok(
    (await readFile(path.join(project.root, "README"), "utf8")).includes(
      "Hello World",
    ),
  );
  const gitEnv = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "NUL",
  };
  const head = execFileSync(
    "C:/Program Files/Git/cmd/git.exe",
    ["rev-parse", "HEAD"],
    { cwd: project.root, env: gitEnv, windowsHide: true, encoding: "utf8" },
  ).trim();
  assert.equal(head, project.cloneReceipt.head);
  assert.equal(project.aiRead, false);
  assert.equal(project.backupFiles, false);
  const config = await readFile(
    path.join(project.root, ".git", "config"),
    "utf8",
  );
  assert.ok(config.includes("https://github.com/octocat/Hello-World.git"));
  assert.ok(!/extraheader|Authorization|access.token/i.test(config));
  checks.push(
    "Real restricted Git clone writes actual source, verifies the previewed commit and keeps credentials out of repository config",
  );
  await page
    .getByRole("button")
    .filter({
      has: page.getByRole("heading", {
        name: "Live public clone",
        exact: true,
      }),
    })
    .click();
  await page
    .getByRole("button", { name: "فحص GitHub المرتبط", exact: true })
    .click();
  await page
    .getByText("نفس Commit محلياً وعلى GitHub", { exact: false })
    .waitFor({ timeout: 45000 });
  state = await command({ op: "snapshot" });
  assert.equal(
    state.projects.find((p) => p.id === project.id).githubCheck.comparison
      .state,
    "identical",
  );
  checks.push(
    "Actual local Git and real remote GitHub head comparison agree after cloning",
  );
  await app.close();
  app = null;
  app = await electron.launch({ args: ["."], env });
  page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  await page
    .getByRole("button", { name: "لوحة التحكم", exact: true })
    .waitFor();
  state = await command({ op: "snapshot" });
  assert.equal(state.engine.mode, "Stop");
  assert.equal(state.projects.filter((p) => p.kind !== "workfiles").length, 1);
  assert.equal(
    state.projects.find((p) => p.id === project.id).root,
    project.root,
  );
  checks.push(
    "Native restart preserves the project and never repeats the clone",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/validation/project-clone-live-desktop.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        liveGitHub: true,
        publicRepositoryOnly: true,
        credentialsUsed: false,
        checks,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks, errors }));
} catch (error) {
  const ledger = app
    ? await app.evaluate(({ app }) => {
        const { DatabaseSync } = process.getBuiltinModule("node:sqlite"),
          db = new DatabaseSync(app.getPath("userData") + "/badawi.db", {
            readOnly: true,
          });
        const rows = db
          .prepare(
            "SELECT result FROM requests WHERE result LIKE '%\"ok\":false%' ORDER BY rowid DESC LIMIT 3",
          )
          .all();
        db.close();
        return rows.map((r) => JSON.parse(r.result).error);
      })
    : [];
  console.log(
    JSON.stringify({
      checks,
      errors,
      error: error.message,
      ledger,
      clone: app
        ? await app.evaluate(() => globalThis.__publicCloneDiagnostic)
        : null,
      body: page ? (await page.locator("body").innerText()).slice(-2000) : "",
    }),
  );
  throw error;
} finally {
  if (app) await app.close();
  await rm(dir, { recursive: true, force: true });
}
