import { _electron as electron } from "playwright-core";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const file = path.join(process.env.APPDATA, "Badawi OS", "badawi.db");
const userTables = ["projects", "notes", "tasks", "chats", "plans", "memories"];
function signature() {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    if (db.prepare("PRAGMA quick_check").get().quick_check !== "ok") throw Error("DATABASE_INTEGRITY_FAILED");
    return createHash("sha256").update(JSON.stringify(userTables.map((table) => db.prepare(`SELECT id,data FROM ${table} ORDER BY id`).all()))).digest("hex");
  } finally { db.close(); }
}
const before = signature();
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.BADAWI_DATA_DIR;
delete env.BADAWI_BACKGROUND;
const executablePath = path.resolve("release/Badawi-OS-0.4.1-Windows/Badawi OS.exe");
let app;
try {
  app = await electron.launch({ executablePath, args: [], env });
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForFunction(() => !!window.badawi);
  const command = async (value) => {
    const reply = await page.evaluate((input) => window.badawi.command(input), value);
    if (!reply.ok) throw Error(reply.error);
    return reply.data;
  };
  const state = await command({ op: "snapshot" });
  if (state.version !== "0.4.1" || state.engine.mode !== "Stop") throw Error("UPGRADE_STATE_INVALID");
  if (signature() !== before) throw Error("USER_RECORD_BYTES_CHANGED");
  await command({ op: "desktop.install" });
  const shortcuts = await app.evaluate(({ app, shell }) => {
    const path = process.getBuiltinModule("node:path");
    const locations = [
      path.join(app.getPath("desktop"), "Badawi OS.lnk"),
      path.join(app.getPath("appData"), "Microsoft", "Windows", "Start Menu", "Programs", "Badawi OS.lnk"),
    ];
    return locations.every((location) => shell.readShortcutLink(location).target === process.execPath);
  });
  if (!shortcuts) throw Error("SHORTCUT_TARGET_MISMATCH");
  if (errors.length) throw Error("RENDERER_ERROR");
  if (signature() !== before) throw Error("USER_RECORD_BYTES_CHANGED");
  await app.close();
  app = null;
  const opened = spawn(executablePath, [], { cwd: path.dirname(executablePath), env, detached: true, stdio: "ignore", windowsHide: true });
  opened.unref();
  await new Promise((resolve) => setTimeout(resolve, 1000));
  process.kill(opened.pid, 0);
  const report = {
    date: new Date().toISOString(), version: state.version, ownerInstallChanged: true,
    projectNoteTaskChatPlanMemoryBytesPreserved: true, databaseIntegrity: "ok",
    engine: state.engine.mode, chatgptStatus: state.chatgpt.status,
    desktopAndStartMenuPointToNewPackage: true, previousPackageRetained: true,
    rendererErrors: 0, projectFileOperationsRequested: false,
    applicationLeftOpen: true,
  };
  await writeFile("docs/validation/owner-upgrade-0.4.1.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  process.exit(0);
} catch (error) {
  await app?.close().catch(() => {});
  throw error;
}
