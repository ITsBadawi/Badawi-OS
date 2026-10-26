import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/core/store.ts";
import { Drive } from "../src/core/drive.ts";

function fixture() {
  const store = new Store(":memory:");
  store.setting("drive.account", "owner");
  store.setting("backup.retention.owner", { keepLatest: 2, olderThanDays: 30 });
  for (let i = 0; i < 6; i++)
    store.put("backups", {
      id: `backup-${i}`,
      account: "owner",
      remoteId: `remote-${i}`,
      status: "verified",
      verifiedAt: `2026-01-0${6 - i}T00:00:00Z`,
      createdAt: `2026-01-0${6 - i}T00:00:00Z`,
      size: 20,
      md5: `digest-${i}`,
      protected: i === 3,
    });
  const keys = new Map([
    [
      "drive.tokens",
      JSON.stringify({
        access_token: "fixture",
        expiresAt: Date.now() + 3600000,
      }),
    ],
  ]);
  const trashed = new Set<string>();
  let writes = 0,
    changed = false;
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
    "",
    async () => {},
    async (input, init = {}) => {
      const u = new URL(String(input)),
        id = u.pathname.split("/").pop()!,
        index = id.split("-").pop()!;
      if (init.method === "PATCH") {
        assert.deepEqual(JSON.parse(String(init.body)), { trashed: true });
        trashed.add(id);
        writes++;
      }
      return Response.json({
        id,
        size: "20",
        md5Checksum: changed ? "tampered" : `digest-${index}`,
        trashed: trashed.has(id),
        appProperties: { badawiKind: "backup", backupId: `backup-${index}` },
      });
    },
  );
  return {
    store,
    drive,
    trashed,
    get writes() {
      return writes;
    },
    change() {
      changed = true;
    },
  };
}
test("retention previews preserve newest two, protected, recent, unverified and foreign copies; only confirmed selection reaches recoverable Drive trash", async () => {
  const f = fixture();
  try {
    f.store.put("backups", {
      id: "foreign",
      account: "other",
      status: "verified",
      createdAt: "2020-01-01",
    });
    f.store.put("backups", {
      id: "pending",
      account: "owner",
      status: "checkpointed",
      createdAt: "2020-01-01",
    });
    const preview = await f.drive.previewRetention(
      new AbortController().signal,
    );
    assert.deepEqual(preview.items.map((b: any) => b.id).sort(), [
      "backup-2",
      "backup-4",
      "backup-5",
    ]);
    assert.equal(f.writes, 0);
    await f.drive.applyRetention(
      preview.previewId,
      new AbortController().signal,
      () => {},
    );
    assert.equal(f.writes, 3);
    assert.equal(f.store.get("backups", "backup-0")!.status, "verified");
    assert.equal(f.store.get("backups", "backup-3")!.status, "verified");
    assert.equal(f.store.get("backups", "backup-2")!.status, "trashed");
    await assert.rejects(
      f.drive.applyRetention(
        preview.previewId,
        new AbortController().signal,
        () => {},
      ),
      /PREVIEW/,
    );
  } finally {
    f.store.close();
  }
});
test("retention approval is invalidated by protection, account or policy changes and never trashes changed remote content", async () => {
  for (const change of ["protect", "account", "policy", "remote"]) {
    const f = fixture();
    try {
      const preview = await f.drive.previewRetention(
        new AbortController().signal,
      );
      if (change === "protect")
        f.store.put("backups", {
          ...f.store.get("backups", "backup-2"),
          protected: true,
        });
      if (change === "account") f.store.setting("drive.account", "other");
      if (change === "policy")
        f.store.setting("backup.retention.owner", {
          keepLatest: 5,
          olderThanDays: 30,
        });
      if (change === "remote") f.change();
      await assert.rejects(
        f.drive.applyRetention(
          preview.previewId,
          new AbortController().signal,
          () => {},
        ),
        /RETENTION_|BACKUP_REMOTE_CHANGED/,
      );
      assert.equal(f.writes, 0);
    } finally {
      f.store.close();
    }
  }
});
test("retention preserves latest copies separately for each project selection and recovery key", async () => {
  const f = fixture();
  try {
    for (const id of ["backup-2", "backup-4"])
      f.store.put("backups", {
        ...f.store.get("backups", id),
        projectIds: ["separate-project"],
      });
    const preview = await f.drive.previewRetention(
      new AbortController().signal,
    );
    assert.deepEqual(
      preview.items.map((b) => b.id),
      ["backup-5"],
    );
  } finally {
    f.store.close();
  }
});
