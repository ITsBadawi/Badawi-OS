import { _electron as electron } from "playwright-core";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const dir = await mkdtemp(path.join(tmpdir(), "badawi-update-isolated-"));
const data = path.join(dir, "data"),
  packageRoot = path.join(dir, "candidate");
await mkdir(path.join(packageRoot, "resources", "app", "dist-desktop"), {
  recursive: true,
});
await writeFile(path.join(packageRoot, "Badawi OS.exe"), "ISOLATED_TEST_EXE");
await writeFile(
  path.join(packageRoot, "resources", "app", "dist-desktop", "main.cjs"),
  "ISOLATED_TEST_MAIN",
);
await writeFile(
  path.join(packageRoot, "resources", "app", "package.json"),
  JSON.stringify({
    name: "badawi-os",
    main: "dist-desktop/main.cjs",
    version: "9.9.9",
  }),
);
const env = { ...process.env, BADAWI_DATA_DIR: data };
delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch({ args: [".", "--hidden"], env });
  const page = await app.firstWindow();
  await page.getByRole("button", { name: "الإعدادات", exact: true }).waitFor();
  const patched = await app.evaluate(({ app, dialog }, candidate) => {
    globalThis.__testOriginalQuit = app.quit;
    globalThis.__testOriginalRelaunch = app.relaunch;
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [candidate],
    });
    dialog.showMessageBox = async () => ({ response: 1 });
    app.relaunch = (options) => {
      globalThis.__testRelaunch = options;
    };
    app.quit = () => {
      globalThis.__testQuit = true;
    };
    return (
      typeof dialog.showOpenDialog === "function" &&
      typeof app.relaunch === "function"
    );
  }, packageRoot);
  assert.equal(patched, true);
  const reply = await page.evaluate(() =>
    window.badawi.command({ op: "desktop.update" }),
  );
  assert.equal(reply.ok, true, JSON.stringify(reply));
  assert.equal(reply.data.restarting, true);
  const lifecycle = await app.evaluate(() => ({
    relaunch: globalThis.__testRelaunch,
    quit: globalThis.__testQuit,
  }));
  assert.equal(
    lifecycle.relaunch.execPath,
    path.join(packageRoot, "Badawi OS.exe"),
  );
  assert.equal(lifecycle.quit, true);
  assert.equal(
    (await readdir(data)).filter((name) => /^before-update-.*\.db$/.test(name))
      .length,
    0,
  );
  console.log(
    "Reviewed isolated update relaunch created no permanent local database copy",
  );
} finally {
  await app
    ?.evaluate(({ app }) => {
      if (globalThis.__testOriginalQuit)
        app.quit = globalThis.__testOriginalQuit;
      if (globalThis.__testOriginalRelaunch)
        app.relaunch = globalThis.__testOriginalRelaunch;
    })
    .catch(() => {});
  await app?.close().catch(() => {});
  await rm(dir, { recursive: true, force: true });
}
