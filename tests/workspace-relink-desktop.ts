import { _electron as electron } from "playwright-core";
import { mkdtemp, rm, writeFile, readFile, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { Store } from "../src/core/store.ts";
import { snapshot, restoreBytes } from "../src/core/backup.ts";
const dir = await mkdtemp(path.join(tmpdir(), "badawi-managed-relink-ui-")),
  dataDir = path.join(dir, "restored"),
  checks: string[] = [],
  errors: string[] = [];
const seed = new Store(":memory:"),
  text = "RESTORED_OWNER_TEXT\nExact application restore bytes";
const project = seed.put("projects", {
    id: "restored-workspace",
    name: "Restored work files",
    kind: "workfiles",
    root: "C:/old/Files",
    workspaceRoot: "C:/old",
    projectsRoot: "C:/old/Projects",
    inboxRoot: "C:/old/Files/Inbox",
    aiRead: true,
    backupFiles: true,
    monitor: true,
    fileEntries: [
      {
        path: "owner.md",
        category: "document",
        tags: ["preserved"],
        linkedProjectIds: ["code-reference", "deleted-reference"],
      },
      { path: "missing.md", category: "other", tags: [], linkedProjectIds: [] },
    ],
  }),
  code = seed.put("projects", {
    id: "code-reference",
    name: "Code reference",
    root: "C:/old-code",
  });
const bytes = Buffer.from(text),
  restored = await restoreBytes(
    snapshot(seed, [
      {
        id: project.id,
        name: project.name,
        capturedAt: new Date().toISOString(),
        files: [
          {
            path: "owner.md",
            data: bytes.toString("base64"),
            sha256: createHash("sha256").update(bytes).digest("hex"),
          },
        ],
      },
    ]),
    dataDir,
  );
seed.close();
assert.equal(restored.workspaces.length, 1);
const workspace = restored.workspaces[0].directory;
const env = {
  ...process.env,
  BADAWI_DATA_DIR: dataDir,
  BADAWI_BACKGROUND: "1",
};
delete (env as Record<string, string | undefined>).ELECTRON_RUN_AS_NODE;
let app: any, page: any;
const cmd = async (c: any) => {
  const r = await page.evaluate((c: any) => window.badawi.command(c), c);
  if (!r.ok) throw Error(r.error);
  return r.data;
};
async function launch() {
  app = await electron.launch({ args: ["."], env });
  page = await app.firstWindow();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (e: any) => errors.push(e.message));
  await page.getByRole("button", { name: "الملفات", exact: true }).waitFor();
  await app.evaluate(() => {
    (globalThis as any).__relinkRequests = 0;
    globalThis.fetch = async () => {
      (globalThis as any).__relinkRequests++;
      throw Error("No remote requests permitted");
    };
  });
}
try {
  await launch();
  let state = await cmd({ op: "snapshot" });
  assert.equal(state.projects.find((p: any) => p.id === project.id).root, null);
  assert.equal(state.engine.mode, "Stop");
  assert.equal(
    await readFile(path.join(workspace, "Files", "owner.md"), "utf8"),
    text,
  );
  assert.ok((await lstat(path.join(workspace, "Projects"))).isDirectory());
  await page.getByRole("button", { name: "الملفات", exact: true }).click();
  await page
    .getByLabel("مجلد المساحة لإعادة الربط", { exact: true })
    .fill(workspace);
  assert.ok(
    await page
      .getByRole("button", { name: "معاينة ربط المساحة", exact: true })
      .isDisabled(),
  );
  await cmd({ op: "engine.mode", mode: "Running", epoch: state.engine.epoch });
  const job = await cmd({
    op: "job.save",
    name: "Related local rule",
    kind: "reminder",
    projectId: project.id,
    enabled: true,
    trigger: { type: "manual" },
    missedPolicy: "skip",
    message: "No automatic effects",
  });
  await page
    .getByRole("button", { name: "معاينة ربط المساحة", exact: true })
    .click();
  let modal = page.getByRole("dialog").first();
  await modal
    .getByRole("heading", { name: "مراجعة ربط مساحة الملفات", exact: true })
    .waitFor();
  assert.equal(
    (await cmd({ op: "snapshot" })).projects.find(
      (p: any) => p.id === project.id,
    ).root,
    null,
  );
  await modal.getByText(/ملفات مصنّفة تظهر بمساراتها: 1/).waitFor();
  await modal.getByRole("button", { name: "إلغاء", exact: true }).click();
  assert.equal(
    (await cmd({ op: "snapshot" })).projects.find(
      (p: any) => p.id === project.id,
    ).root,
    null,
  );
  checks.push(
    "Actual restored profile opens with no path/AI/backup grants; separate Files/Projects bytes exist and owner can inspect/cancel reconnection without changing the registry",
  );
  await page
    .getByRole("button", { name: "معاينة ربط المساحة", exact: true })
    .click();
  modal = page.getByRole("dialog").first();
  await modal
    .getByRole("heading", { name: "مراجعة ربط مساحة الملفات", exact: true })
    .waitFor();
  await writeFile(
    path.join(workspace, "Files", "arrived.md"),
    "changed since preview",
  );
  await modal
    .getByRole("button", { name: "ربط المساحة بعد المراجعة", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: /تغيّرت|انتهت|الموافقة|المعاينة/ })
    .waitFor();
  assert.equal(
    (await cmd({ op: "snapshot" })).projects.find(
      (p: any) => p.id === project.id,
    ).root,
    null,
  );
  await modal.getByRole("button", { name: "إلغاء", exact: true }).click();
  checks.push(
    "Changing the actual file manifest invalidates the one-use reconnect preview before registry or grants change",
  );
  await page
    .getByRole("button", { name: "معاينة ربط المساحة", exact: true })
    .click();
  modal = page.getByRole("dialog").first();
  await modal
    .getByRole("heading", { name: "مراجعة ربط مساحة الملفات", exact: true })
    .waitFor();
  await modal
    .getByRole("button", { name: "ربط المساحة بعد المراجعة", exact: true })
    .click();
  await modal.waitFor({ state: "hidden" });
  state = await cmd({ op: "snapshot" });
  const linked = state.projects.find((p: any) => p.id === project.id);
  assert.equal(linked.root, path.join(workspace, "Files"));
  assert.equal(linked.aiRead, false);
  assert.equal(linked.backupFiles, false);
  assert.equal(linked.monitor, false);
  assert.deepEqual(linked.fileEntries[0].linkedProjectIds, [code.id]);
  assert.deepEqual(linked.fileEntries[0].tags, ["preserved"]);
  assert.equal(linked.fileEntries.length, 2);
  assert.equal(state.jobs.find((j: any) => j.id === job.id).enabled, false);
  await page
    .getByRole("heading", { name: "تنظيم ملفات العمل", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "قراءة قائمة الملفات", exact: true })
    .click();
  await page.getByRole("button", { name: "owner.md", exact: false }).click();
  await page
    .locator(".file-preview pre")
    .filter({ hasText: "RESTORED_OWNER_TEXT" })
    .waitFor();
  assert.ok(
    await page
      .getByRole("checkbox", { name: "Code reference", exact: true })
      .isChecked(),
  );
  assert.equal(
    await page.getByLabel("وسوم الملف", { exact: true }).inputValue(),
    "preserved",
  );
  checks.push(
    "Reviewed reconnect preserves stable IDs, original bytes, tags and valid logical links, retains missing-path metadata, removes only approved broken links and disables related rules/source permissions",
  );
  const pending = await cmd({
    op: "workspace.relink.preview",
    id: project.id,
    path: workspace,
  });
  await page.screenshot({
    path: "docs/validation/workspace-relink-desktop.png",
    fullPage: true,
  });
  await app.close();
  app = null;
  await launch();
  state = await cmd({ op: "snapshot" });
  assert.equal(state.engine.mode, "Stop");
  assert.equal(
    state.projects.find((p: any) => p.id === project.id).root,
    path.join(workspace, "Files"),
  );
  assert.equal(state.jobs.find((j: any) => j.id === job.id).enabled, false);
  await assert.rejects(
    cmd({ op: "workspace.relink.apply", approvalId: pending.approvalId }),
    /APPROVAL_STALE/,
  );
  assert.equal(state.auditValid, true);
  assert.equal(
    await readFile(path.join(workspace, "Files", "owner.md"), "utf8"),
    text,
  );
  assert.equal(
    await app.evaluate(() => (globalThis as any).__relinkRequests),
    0,
  );
  assert.deepEqual(errors, []);
  checks.push(
    "Reconnected metadata and disabled rules persist across actual Electron restart, pending approvals do not replay, audit remains valid and no provider/cloud request occurs",
  );
  await writeFile(
    "docs/validation/workspace-relink-desktop.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        checks,
        errors,
        scope:
          "Actual full backup restore, new isolated Electron profile, real file bytes/layout, owner native UI preview/cancel/stale approval/reconnect and restart; no owner data or live cloud",
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
