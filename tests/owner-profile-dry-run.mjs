import { _electron as electron } from "playwright-core";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { copyFile, cp, mkdtemp, mkdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const original = path.join(process.env.APPDATA || "", "Badawi OS", "badawi.db");
const originalState = path.join(path.dirname(original), "Local State");
const originalChatGPT = path.join(path.dirname(original), "chatgpt-subscription", "chatgpt-auth.json");
const executablePath = path.resolve("release/Badawi-OS-0.4.1-Windows/Badawi OS.exe");
const tables = ["projects", "notes", "tasks", "jobs", "runs", "inbox", "backups", "chats", "plans", "memories"];
const fileHash = async (file) => createHash("sha256").update(await readFile(file)).digest("hex");
const counts = (db) => Object.fromEntries(tables.map((table) => [table, Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count)]));
const userTables = ["projects", "notes", "tasks", "chats", "plans", "memories"];
const contents = (db) => Object.fromEntries(userTables.map((table) => [table, createHash("sha256").update(JSON.stringify(db.prepare(`SELECT id,data FROM ${table} ORDER BY id`).all())).digest("hex")]));
const beforeHash = await fileHash(original);
const beforeStateHash = await fileHash(originalState);
const beforeChatGPTHash = await fileHash(originalChatGPT);
try {
  const wal = await stat(`${original}-wal`);
  if (wal.size !== 0) throw Error("OWNER_DATABASE_ACTIVE");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const source = new DatabaseSync(original, { readOnly: true });
const before = counts(source);
const beforeContents = contents(source);
const schema = source.prepare("PRAGMA user_version").get().user_version;
const integrity = source.prepare("PRAGMA quick_check").get().quick_check;
source.close();
if (integrity !== "ok") throw Error("OWNER_DATABASE_INTEGRITY_FAILED");
const dir = await mkdtemp(path.join(tmpdir(), "badawi-owner-dry-run-"));
const data = path.join(dir, "data");
await mkdir(data);
await copyFile(original, path.join(data, "badawi.db"));
await copyFile(originalState, path.join(data, "Local State"));
await cp(path.join(path.dirname(original), "chatgpt-subscription"), path.join(data, "chatgpt-subscription"), { recursive: true });
let app;
try {
  const env = { ...process.env, BADAWI_DATA_DIR: data, BADAWI_BACKGROUND: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ executablePath, args: [], env });
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForFunction(() => !!window.badawi);
  const reply = await page.evaluate(() => window.badawi.command({ op: "snapshot" }));
  if (!reply.ok) {
    const diagnostic = new DatabaseSync(path.join(data, "badawi.db"), { readOnly: true });
    const encrypted = diagnostic.prepare("SELECT key, ciphertext FROM secrets").all().map((row) => ({ key: row.key, bytes: Buffer.from(row.ciphertext).toString("base64") }));
    diagnostic.close();
    const result = await app.evaluate(({ safeStorage }, values) => ({
      encryptionAvailable: safeStorage.isEncryptionAvailable(),
      failedKeys: values.filter((item) => {
        try { safeStorage.decryptString(Buffer.from(item.bytes, "base64")); return false; }
        catch { return true; }
      }).map((item) => item.key),
    }), encrypted);
    throw Error(`${reply.error}: ${JSON.stringify(result)}`);
  }
  const snapshot = reply.data;
  if (snapshot.engine.mode !== "Stop") throw Error("UPGRADE_ENGINE_NOT_STOPPED");
  if (errors.length) throw Error("UPGRADE_RENDERER_ERROR");
  await app.close();
  app = null;
  const migrated = new DatabaseSync(path.join(data, "badawi.db"), { readOnly: true });
  const after = counts(migrated);
  const afterContents = contents(migrated);
  const migratedIntegrity = migrated.prepare("PRAGMA quick_check").get().quick_check;
  migrated.close();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw Error("OWNER_COLLECTION_COUNT_CHANGED");
  if (JSON.stringify(beforeContents) !== JSON.stringify(afterContents)) throw Error("OWNER_USER_RECORD_BYTES_CHANGED");
  if (migratedIntegrity !== "ok") throw Error("UPGRADE_DATABASE_INTEGRITY_FAILED");
  const originalUnchanged = (await fileHash(original)) === beforeHash
    && (await fileHash(originalState)) === beforeStateHash
    && (await fileHash(originalChatGPT)) === beforeChatGPTHash;
  if (!originalUnchanged) throw Error("OWNER_DATABASE_CHANGED_DURING_TEST");
  console.log(JSON.stringify({
    ownerVersion: "0.3.0",
    testVersion: snapshot.version,
    schema,
    integrity,
    collectionsPreserved: true,
    userRecordBytesPreserved: true,
    engine: snapshot.engine.mode,
    rendererErrors: 0,
    chatgptStatus: snapshot.chatgpt.status,
    openaiApiConfigured: snapshot.providers.openai.configured,
    vercelConfigured: snapshot.integrations.vercel.configured,
    railwayConfigured: snapshot.integrations.railway.configured,
    ownerDatabaseUnchanged: true,
  }));
} finally {
  if (app) await app.close().catch(() => app.process()?.kill());
  await rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 300 });
}
