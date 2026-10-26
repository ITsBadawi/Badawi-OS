import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "../src/core/store.ts";
import { Drive } from "../src/core/drive.ts";
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "badawi-checkpoint-")),
    store = new Store(":memory:"),
    keys = new Map([["backup.key", Buffer.alloc(32, 3).toString("base64")]]);
  store.setting("backup.keyExported", true);
  store.setting("drive.account", "owner");
  let requests = 0;
  const drive = new Drive(
    store,
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
    async () => {
      requests++;
      throw Error("No remote request allowed");
    },
  );
  return {
    dir,
    store,
    keys,
    drive,
    requests: () => requests,
    close: async () => {
      store.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}
test("legacy checkpoints without a source grant fingerprint cannot resume or send bytes under current permissions", async () => {
  const f = await fixture();
  try {
    const id = randomUUID();
    f.store.put("backups", {
      id,
      account: "owner",
      status: "checkpointed",
      size: 10,
      offset: 4,
    });
    await assert.rejects(
      f.drive.backup(new AbortController().signal, () => {}),
      /BACKUP_SCOPE_CHANGED/,
    );
    assert.equal(f.requests(), 0);
  } finally {
    await f.close();
  }
});
test("discard preview is single-use and stale state cannot delete staged bytes; confirmed cleanup removes only the reviewed local file and session", async () => {
  const f = await fixture();
  try {
    const id = randomUUID(),
      file = join(f.dir, `${id}.stage`),
      sentinel = join(f.dir, "keep.stage");
    await writeFile(file, "ENCRYPTED_STAGE_FIXTURE");
    await writeFile(sentinel, "KEEP");
    let item = f.store.put("backups", {
      id,
      account: "owner",
      status: "checkpointed",
      size: 23,
      offset: 4,
      remoteId: "cloud-retained",
      projectIds: ["p"],
      reason: "BACKUP_SCOPE_CHANGED",
    });
    f.keys.set(`upload.${id}`, "PRIVATE_RESUMABLE_URL");
    const preview = await f.drive.previewDiscard(id);
    assert.equal(preview.stageBytes, 23);
    assert.equal(preview.remoteMayExist, true);
    assert.ok(!JSON.stringify(preview).includes("PRIVATE_RESUMABLE_URL"));
    f.store.put("backups", { ...item, offset: 6 });
    await assert.rejects(
      f.drive.discard(preview.approvalId),
      /BACKUP_DISCARD_STALE/,
    );
    assert.equal(await readFile(file, "utf8"), "ENCRYPTED_STAGE_FIXTURE");
    await assert.rejects(
      f.drive.discard(preview.approvalId),
      /BACKUP_DISCARD_STALE/,
    );
    const current = await f.drive.previewDiscard(id),
      result = await f.drive.discard(current.approvalId);
    assert.equal(result.localStageRemoved, true);
    assert.equal(result.cloudChanged, false);
    assert.equal(f.store.get("backups", id)!.status, "discarded");
    assert.equal(f.store.get("backups", id)!.remoteId, "cloud-retained");
    assert.equal(f.keys.get(`upload.${id}`), undefined);
    await assert.rejects(access(file));
    assert.equal(await readFile(sentinel, "utf8"), "KEEP");
    assert.equal(f.requests(), 0);
    await assert.rejects(
      f.drive.discard(current.approvalId),
      /BACKUP_DISCARD_STALE/,
    );
  } finally {
    await f.close();
  }
});
test("verified backups, traversal IDs and replaced stage files cannot be discarded through a pending-upload preview", async () => {
  const f = await fixture();
  try {
    const id = randomUUID();
    f.store.put("backups", {
      id,
      account: "owner",
      status: "verified",
      size: 1,
    });
    await assert.rejects(f.drive.previewDiscard(id), /BACKUP_DISCARD_DENIED/);
    await assert.rejects(
      f.drive.previewDiscard("../other"),
      /BACKUP_DISCARD_DENIED/,
    );
    f.store.put("backups", {
      id,
      account: "owner",
      status: "checkpointed",
      size: 3,
    });
    const file = join(f.dir, `${id}.stage`);
    await writeFile(file, "ONE");
    const preview = await f.drive.previewDiscard(id);
    await writeFile(file, "REPLACED");
    await assert.rejects(
      f.drive.discard(preview.approvalId),
      /BACKUP_DISCARD_STALE/,
    );
    assert.equal(await readFile(file, "utf8"), "REPLACED");
    const cancelled = await f.drive.previewDiscard(id),
      control = new AbortController();
    control.abort();
    await assert.rejects(f.drive.discard(cancelled.approvalId, control.signal));
    assert.equal(await readFile(file, "utf8"), "REPLACED");
    const accountPreview = await f.drive.previewDiscard(id);
    f.store.setting("drive.account", "different-account");
    await assert.rejects(
      f.drive.discard(accountPreview.approvalId),
      /BACKUP_DISCARD_STALE/,
    );
    assert.equal(await readFile(file, "utf8"), "REPLACED");
    assert.equal(f.requests(), 0);
  } finally {
    await f.close();
  }
});
