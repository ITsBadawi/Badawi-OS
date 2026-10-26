import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/core/store.ts";
import { RequestLedger } from "../src/core/requests.ts";
test("a completed mutation replays its saved result across a restart without another write", async () => {
  const d = mkdtempSync(join(tmpdir(), "badawi-receipt-"));
  const file = join(d, "app.db");
  let s = new Store(file),
    ledger = new RequestLedger(s);
  const command = { op: "note.save" as const, title: "once", body: "payload" };
  const reply = await ledger.execute("same-id", command, async () =>
    s.put("notes", { title: "once", body: "payload" }),
  );
  s.close();
  s = new Store(file);
  ledger = new RequestLedger(s);
  const replay = await ledger.execute("same-id", command, async () => {
    throw Error("Must not run");
  });
  assert.deepEqual(replay, reply);
  assert.equal(s.all("notes").length, 1);
  await assert.rejects(
    ledger.execute(
      "same-id",
      { ...command, title: "different" },
      async () => {},
    ),
    /REQUEST_ID_REUSED/,
  );
  s.close();
  rmSync(d, { recursive: true });
});
test("a pending mutation recovered after a crash is held for review rather than repeated", async () => {
  const s = new Store(":memory:");
  const ledger = new RequestLedger(s);
  let resolve!: (value: any) => void;
  const command = { op: "note.save" as const, title: "once", body: "" };
  const pending = ledger.execute(
    "pending",
    command,
    () => new Promise((r) => (resolve = r)),
  );
  await Promise.resolve();
  const afterRestart = new RequestLedger(s);
  await assert.rejects(
    afterRestart.execute("pending", command, async () => {}),
    /OPERATION_UNCERTAIN/,
  );
  resolve(null);
  await pending;
  s.close();
});
