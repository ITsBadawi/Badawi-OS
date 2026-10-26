import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createCipheriv, createHash } from "node:crypto";
import * as backup from "../src/core/backup.ts";
test("encrypted snapshots compress repetitive content and retain exact bytes", () => {
  const plain = Buffer.from("project source\n".repeat(10000)),
    key = randomBytes(32);
  const encrypted = backup.encryptBackup(plain, key, "compressed");
  assert.ok(encrypted.length < plain.length / 10);
  assert.deepEqual(backup.decryptBackup(encrypted, key), plain);
});
test("current reader still accepts the original uncompressed authenticated format", () => {
  const plain = Buffer.from("legacy"),
    key = randomBytes(32),
    iv = randomBytes(12);
  const header = Buffer.from(
    JSON.stringify({
      format: 1,
      id: "old",
      size: plain.length,
      sha256: createHash("sha256").update(plain).digest("hex"),
    }),
  );
  const length = Buffer.alloc(4);
  length.writeUInt32BE(header.length);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(header);
  const bytes = Buffer.concat([cipher.update(plain), cipher.final()]);
  const file = Buffer.concat([
    Buffer.from("BADAWI01"),
    length,
    header,
    iv,
    cipher.getAuthTag(),
    bytes,
  ]);
  assert.deepEqual(backup.decryptBackup(file, key), plain);
});
test("logical content identity ignores only capture timestamps, and changes when real data or selected files change", () => {
  const first = {
    format: 3,
    createdAt: "one",
    tables: { notes: [{ id: "n", body: "same" }] },
    archives: [
      {
        id: "p",
        capturedAt: "one",
        files: [{ path: "a.txt", sha256: "abc", data: "eA==" }],
      },
    ],
  };
  const second = structuredClone(first);
  second.createdAt = "two";
  second.archives[0].capturedAt = "two";
  const digest = (v: any) =>
    (backup as any).snapshotContentHash(Buffer.from(JSON.stringify(v)));
  assert.equal(digest(first), digest(second));
  second.archives[0].files[0].data = "eQ==";
  assert.notEqual(digest(first), digest(second));
  second.archives = [];
  assert.notEqual(digest(first), digest(second));
});
