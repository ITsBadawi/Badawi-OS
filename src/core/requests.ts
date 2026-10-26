import { createHash } from "node:crypto";
import { Store } from "./store.ts";
import type { Command } from "../contracts.ts";
const reads = new Set([
  "snapshot",
  "chat.read",
  "files.list",
  "files.search",
  "files.read",
  "git.read",
  "schedule.preview",
  "ai.preview",
  "backup.list",
]);
export class RequestLedger {
  private inflight = new Map<string, Promise<any>>();
  constructor(private store: Store) {}
  async execute(
    id: string,
    command: Command,
    handler: () => Promise<any>,
  ): Promise<any> {
    if (reads.has(command.op)) return handler();
    const hash = createHash("sha256")
      .update(JSON.stringify(command))
      .digest("hex");
    const previous = this.store.db
      .prepare("SELECT * FROM requests WHERE id=?")
      .get(id) as
      { command_hash: string; status: string; result: string } | undefined;
    if (previous) {
      if (previous.command_hash !== hash) throw Error("REQUEST_ID_REUSED");
      if (this.inflight.has(id)) return this.inflight.get(id);
      if (previous.status === "pending") throw Error("OPERATION_UNCERTAIN");
      const saved = JSON.parse(previous.result);
      if (!saved.ok) throw Error(saved.error);
      return saved.data;
    }
    this.store.db
      .prepare(
        "INSERT INTO requests(id,command_hash,status) VALUES(?,?,'pending')",
      )
      .run(id, hash);
    const task = Promise.resolve()
      .then(handler)
      .then(
        (data) => {
          this.store.db
            .prepare(
              "UPDATE requests SET status='complete',result=? WHERE id=?",
            )
            .run(JSON.stringify({ ok: true, data: data ?? null }), id);
          return data;
        },
        (error) => {
          const raw = error instanceof Error ? error.message : "";
          const code = /^[A-Z][A-Z0-9_]{1,100}$/.test(raw)
            ? raw
            : "OPERATION_FAILED";
          this.store.db
            .prepare(
              "UPDATE requests SET status='complete',result=? WHERE id=?",
            )
            .run(JSON.stringify({ ok: false, error: code }), id);
          throw error;
        },
      )
      .finally(() => this.inflight.delete(id));
    this.inflight.set(id, task);
    return task;
  }
}
