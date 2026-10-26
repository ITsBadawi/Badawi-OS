import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { Store } from "../src/core/store.ts";
import { Drive } from "../src/core/drive.ts";
test("unchanged snapshots reuse only a remotely intact verified object for the same recovery key", async () => {
  const dir = await mkdtemp(join(tmpdir(), "badawi-dedupe-")),
    s = new Store(":memory:");
  let ids = 0,
    uploads = 0,
    bytes = Buffer.alloc(0),
    remoteId = "",
    properties: any = {},
    changedRemote = false;
  const keys = new Map([
    ["backup.key", randomBytes(32).toString("base64")],
    [
      "drive.tokens",
      JSON.stringify({
        access_token: "fixture",
        expiresAt: Date.now() + 3600000,
      }),
    ],
  ]);
  s.setting("backup.keyExported", true);
  s.setting("drive.account", "fixture");
  const note = s.put("notes", { title: "Record", body: "same" });
  const drive = new Drive(
    s,
    {
      get: (k) => keys.get(k),
      set: (k, v) => {
        keys.set(k, v);
      },
      remove: (k) => {
        keys.delete(k);
      },
    },
    dir,
    async () => {},
    async (input, init = {}) => {
      const url = String(input);
      if (url.includes("generateIds"))
        return Response.json({ ids: [`id-${++ids}`] });
      if (url.endsWith("files?fields=id")) {
        const body = JSON.parse(String(init.body));
        if (body.appProperties?.badawiKind === "backup") {
          remoteId = body.id;
          properties = body.appProperties;
        }
        return Response.json({ id: body.id });
      }
      if (url.includes("uploadType=resumable")) {
        bytes = Buffer.alloc(0);
        return new Response("", {
          headers: {
            location:
              "https://www.googleapis.com/upload/drive/v3/files/session",
          },
        });
      }
      if (url.endsWith("/session")) {
        uploads++;
        bytes = Buffer.concat([bytes, Buffer.from(init.body as Uint8Array)]);
        return Response.json({ id: remoteId });
      }
      if (url.includes("alt=media")) return new Response(bytes);
      if (url.includes("?fields="))
        return Response.json({
          id: remoteId,
          size: String(bytes.length),
          md5Checksum: changedRemote
            ? "changed"
            : createHash("md5").update(bytes).digest("hex"),
          appProperties: properties,
        });
      throw Error("Unexpected transport");
    },
  );
  try {
    const first = await drive.backup(new AbortController().signal, () => {});
    assert.equal(first.verified, true);
    assert.equal(uploads, 1);
    const second = await drive.backup(new AbortController().signal, () => {});
    assert.equal((second as any).reused, true);
    assert.equal(second.backupId, first.backupId);
    assert.equal(uploads, 1);
    assert.equal(s.all("backups").length, 1);
    assert.deepEqual(await readdir(dir), []);
    changedRemote = true;
    const repaired = await drive.backup(new AbortController().signal, () => {});
    assert.notEqual(repaired.backupId, first.backupId);
    assert.equal(uploads, 2);
    assert.equal(s.get("backups", first.backupId)!.status, "remoteChanged");
    changedRemote = false;
    s.put("notes", { ...note, body: "changed" });
    const changed = await drive.backup(new AbortController().signal, () => {});
    assert.notEqual(changed.backupId, first.backupId);
    assert.equal(uploads, 3);
    keys.set("backup.key", randomBytes(32).toString("base64"));
    const rotated = await drive.backup(new AbortController().signal, () => {});
    assert.notEqual(rotated.backupId, changed.backupId);
    assert.equal(uploads, 4);
  } finally {
    s.close();
    await rm(dir, { recursive: true, force: true });
  }
});
