import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/core/store.ts";
import { Drive } from "../src/core/drive.ts";
import * as health from "../src/core/backup-health.ts";
test("Drive capacity uses authenticated official about response and preserves unknown unlimited capacity", async () => {
  const s = new Store(":memory:");
  let unlimited = false;
  const drive = new Drive(
    s,
    {
      get: () =>
        JSON.stringify({
          access_token: "quota-fixture",
          expiresAt: Date.now() + 3600000,
        }),
      set: () => {},
      remove: () => {},
    },
    "unused",
    async () => {},
    async (input, init) => {
      assert.equal(
        String(input),
        "https://www.googleapis.com/drive/v3/about?fields=storageQuota",
      );
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        "Bearer quota-fixture",
      );
      return Response.json({
        storageQuota: unlimited
          ? { usage: "1024" }
          : { limit: "4096", usage: "1024", usageInDrive: "512" },
      });
    },
  );
  try {
    assert.deepEqual(await (drive as any).quota(new AbortController().signal), {
      limit: 4096,
      used: 1024,
      available: 3072,
      driveUsed: 512,
    });
    unlimited = true;
    const q = await (drive as any).quota(new AbortController().signal);
    assert.equal(q.limit, null);
    assert.equal(q.available, null);
  } finally {
    s.close();
  }
});
test("owner-entered plan expiry reminds once per Baghdad date and rearms on the next date", () => {
  const s = new Store(":memory:");
  s.setting("drive.account", "a");
  s.setting("backup.planExpiry.a", "2026-10-29");
  try {
    assert.equal(
      (health as any).backupExpiryReminder(
        s,
        Date.parse("2026-10-21T10:00:00Z"),
      ),
      null,
    );
    const item = (health as any).backupExpiryReminder(
      s,
      Date.parse("2026-10-22T10:00:00Z"),
    );
    assert.ok(item);
    assert.equal(item.kind, "backup-expiry");
    assert.equal(
      (health as any).backupExpiryReminder(
        s,
        Date.parse("2026-10-22T11:00:00Z"),
      ),
      null,
    );
    assert.ok(
      (health as any).backupExpiryReminder(
        s,
        Date.parse("2026-10-23T10:00:00Z"),
      ),
    );
    s.setting("backup.planExpiry.a", null);
    assert.equal(
      (health as any).backupExpiryReminder(
        s,
        Date.parse("2026-10-24T10:00:00Z"),
      ),
      null,
    );
  } finally {
    s.close();
  }
});
