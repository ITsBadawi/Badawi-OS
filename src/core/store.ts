import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";

export type Row = { id: string; [key: string]: any };
export type Table =
  | "projects"
  | "notes"
  | "tasks"
  | "jobs"
  | "runs"
  | "inbox"
  | "backups"
  | "chats"
  | "plans"
  | "memories";
const tables: Table[] = [
  "projects",
  "notes",
  "tasks",
  "jobs",
  "runs",
  "inbox",
  "backups",
  "chats",
  "plans",
  "memories",
];
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export class Store {
  readonly db: DatabaseSync;
  constructor(file: string) {
    this.db = new DatabaseSync(file);
    const version = this.db.prepare("PRAGMA user_version").get() as {
      user_version: number;
    };
    if (version.user_version > 3) {
      this.db.close();
      throw Error("DATABASE_NEWER_VERSION");
    }
    this.db.exec(
      "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
    );
    this.transaction(() => {
      for (const t of tables)
        this.db.exec(
          `CREATE TABLE IF NOT EXISTS ${t}(id TEXT PRIMARY KEY,data TEXT NOT NULL CHECK(json_valid(data))) STRICT;`,
        );
      this.db
        .exec(`CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL) STRICT;
   CREATE TABLE IF NOT EXISTS secrets(key TEXT PRIMARY KEY,ciphertext BLOB NOT NULL) STRICT;
   CREATE TABLE IF NOT EXISTS occurrences(job_id TEXT NOT NULL, occurrence TEXT NOT NULL,PRIMARY KEY(job_id,occurrence)) STRICT;
   CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,command_hash TEXT NOT NULL,status TEXT NOT NULL,result TEXT) STRICT;
   CREATE TABLE IF NOT EXISTS file_catalog(project_id TEXT PRIMARY KEY,root TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data))) STRICT;
   CREATE TABLE IF NOT EXISTS file_index(project_id TEXT PRIMARY KEY,root TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data))) STRICT;
   CREATE TABLE IF NOT EXISTS audit(sequence INTEGER PRIMARY KEY AUTOINCREMENT,event TEXT NOT NULL,details TEXT NOT NULL,created TEXT NOT NULL,previous_hash TEXT NOT NULL,event_hash TEXT NOT NULL) STRICT;
   PRAGMA user_version=3;`);
    });
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  private table(t: Table) {
    if (!tables.includes(t)) throw Error("INVALID_TABLE");
    return t;
  }
  all(t: Table): Row[] {
    return (
      this.db
        .prepare(`SELECT data FROM ${this.table(t)} ORDER BY rowid DESC`)
        .all() as { data: string }[]
    ).map((x) => JSON.parse(x.data));
  }
  get(t: Table, id: string): Row | undefined {
    const row = this.db
      .prepare(`SELECT data FROM ${this.table(t)} WHERE id=?`)
      .get(id) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : undefined;
  }
  put(t: Table, value: Record<string, any>): Row {
    const row = {
      ...value,
      id: value.id || randomUUID(),
      updatedAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        `INSERT INTO ${this.table(t)}(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`,
      )
      .run(row.id, JSON.stringify(row));
    return row;
  }
  remove(t: Table, id: string) {
    this.db.prepare(`DELETE FROM ${this.table(t)} WHERE id=?`).run(id);
  }
  setting(key: string, value?: unknown): any {
    if (value !== undefined)
      this.db
        .prepare(
          "INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        )
        .run(key, JSON.stringify(value));
    const r = this.db
      .prepare("SELECT value FROM settings WHERE key=?")
      .get(key) as { value: string } | undefined;
    return r ? JSON.parse(r.value) : undefined;
  }
  enqueue(
    jobId: string,
    occurrence: string,
    initial: { status: "queued" | "blocked"; reason?: string } = {
      status: "queued",
    },
    checkpoint?: { key: string; value: unknown; onFailure: unknown },
  ): boolean {
    return this.transaction(() => {
      const finish = (inserted: boolean) => {
        if (checkpoint)
          this.setting(
            checkpoint.key,
            inserted ? checkpoint.value : checkpoint.onFailure,
          );
        return inserted;
      };
      const r = this.db
        .prepare("INSERT OR IGNORE INTO occurrences VALUES(?,?)")
        .run(jobId, occurrence);
      if (!r.changes) return finish(false);
      const pending = this.all("runs").filter(
        (r) => ["queued", "blocked", "retryWaiting"].includes(r.status),
      );
      if (
        pending.length >= 100 ||
        pending.filter((r) => r.jobId === jobId).length >= 20
      ) {
        this.audit("schedule.overflow", { jobId });
        return finish(false);
      }
      this.put("runs", {
        jobId,
        occurrence,
        status: initial.status,
        ...(initial.reason ? { reason: initial.reason } : {}),
        createdAt: new Date().toISOString(),
      });
      return finish(true);
    });
  }
  audit(event: string, details: Record<string, unknown> = {}) {
    // Callers provide identifiers and status only. Never log prompts, keys, tokens or provider errors.
    const previous =
      (
        this.db
          .prepare(
            "SELECT event_hash FROM audit ORDER BY sequence DESC LIMIT 1",
          )
          .get() as { event_hash: string } | undefined
      )?.event_hash || "0";
    const created = new Date().toISOString();
    const data = JSON.stringify(details);
    const digest = hash(JSON.stringify([previous, event, data, created]));
    this.db
      .prepare(
        "INSERT INTO audit(event,details,created,previous_hash,event_hash) VALUES(?,?,?,?,?)",
      )
      .run(event, data, created, previous, digest);
  }
  auditRows(limit = 200) {
    return this.db
      .prepare("SELECT * FROM audit ORDER BY sequence DESC LIMIT ?")
      .all(limit);
  }
  verifyAudit() {
    let prev = "0";
    for (const r of this.db
      .prepare("SELECT * FROM audit ORDER BY sequence")
      .iterate() as any) {
      if (
        r.previous_hash !== prev ||
        r.event_hash !==
          hash(JSON.stringify([prev, r.event, r.details, r.created]))
      )
        return false;
      prev = r.event_hash;
    }
    return true;
  }
  close() {
    this.db.close();
  }
}
