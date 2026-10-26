import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/core/store.ts";
import {
  snapshot,
  restoreBytes,
  validateSnapshot,
} from "../src/core/backup.ts";
test("chat backup restores signed history while pending responses and AI grants stay disabled", async () => {
  const s = new Store(":memory:"),
    dir = await mkdtemp(join(tmpdir(), "badawi-chat-backup-"));
  s.put("chats", {
    id: "chat",
    title: "Conversation",
    provider: "gemini",
    model: "gemini-3.8-flash",
    status: "pending",
    messages: [
      {
        id: "u",
        role: "user",
        text: "Remember 37",
        payload: "Remember 37",
        status: "complete",
        createdAt: new Date().toISOString(),
      },
      {
        id: "a",
        role: "assistant",
        text: "",
        status: "pending",
        createdAt: new Date().toISOString(),
        wire: [{ type: "thought", signature: "signed-fixture", content: [] }],
      },
    ],
  });
  s.put("jobs", {
    name: "Summary",
    kind: "summary",
    provider: "gemini",
    noteIds: ["n"],
    trigger: { type: "manual" },
    missedPolicy: "skip",
    enabled: true,
    grant: { hash: "untrusted" },
  });
  try {
    await restoreBytes(snapshot(s), join(dir, "restored"));
    const r = new Store(join(dir, "restored", "badawi.db"));
    try {
      assert.equal(r.all("chats").length, 1);
      assert.equal(
        r.all("chats")[0].messages[1].wire[0].signature,
        "signed-fixture",
      );
      assert.equal(r.all("chats")[0].messages[1].status, "interrupted");
      assert.equal(r.all("jobs")[0].enabled, false);
      assert.equal(r.all("jobs")[0].grant, undefined);
    } finally {
      r.close();
    }
  } finally {
    s.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("a legacy format-1 backup remains readable with an empty chat collection", () => {
  const old = Buffer.from(
    JSON.stringify({
      format: 1,
      tables: { projects: [], notes: [], tasks: [], jobs: [], inbox: [] },
    }),
  );
  assert.deepEqual(validateSnapshot(old).tables.chats, []);
});
