import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/core/store.ts";
import { Service } from "../src/core/service.ts";
import { commandSchema } from "../src/contracts.ts";
import { dueTasks } from "../src/core/tasks.ts";
import { backupExpiryReminder } from "../src/core/backup-health.ts";
import { hostText } from "../src/core/host-localization.ts";
import { setUiLanguage } from "../src/localization.ts";
test("owner language preference persists independently of engine/provider permissions, does not translate stored content and is not an assistant tool", async () => {
  const dir = await mkdtemp(join(tmpdir(), "badawi-language-"));
  let s = new Store(join(dir, "app.db"));
  const make = () =>
    new Service(
      s,
      {
        pickProject: async () => null,
        pickKey: async () => null,
        pickRestoreDirectory: async () => null,
        saveText: async () => false,
        openAuth: async () => {},
        secrets: { get: () => undefined, set: () => {}, remove: () => {} },
      },
      "unused-stage",
      async () => {
        throw Error("No language operation can contact a provider");
      },
    );
  let service = make();
  try {
    assert.equal(service.snapshot().language, "ar");
    const note = s.put("notes", {
      title: "عنوان أصلي",
      body: "محتوى المستخدم لا يترجم",
    });
    await service.command(
      commandSchema.parse({ op: "language.save", language: "en" }),
    );
    assert.equal(service.snapshot().language, "en");
    assert.equal(service.snapshot().engine.mode, "Stop");
    assert.equal(s.get("notes", note.id)?.body, "محتوى المستخدم لا يترجم");
    assert.throws(
      () => service.assistant.validate({ op: "language.save", language: "ar" }),
      /ASSISTANT_ACTION_DENIED/,
    );
    assert.throws(() =>
      commandSchema.parse({ op: "language.save", language: "anything" }),
    );
    service.close();
    s.close();
    s = new Store(join(dir, "app.db"));
    service = make();
    assert.equal(service.snapshot().language, "en");
    assert.equal(s.get("notes", note.id)?.title, "عنوان أصلي");
  } finally {
    service.close();
    s.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("host reminders use their own persisted profile language and keep owner text and earlier receipts intact", async () => {
  const dir = await mkdtemp(join(tmpdir(), "badawi-host-language-"));
  const s = new Store(join(dir, "app.db"));
  try {
    const now = Date.parse("2026-10-23T10:00:00Z");
    s.setting("language", "en");
    setUiLanguage("ar");
    const task = s.put("tasks", {
      title: "مهمتي الأصلية",
      done: false,
      dueAt: new Date(now).toISOString(),
    });
    const [receipt] = dueTasks(s, now);
    assert.equal(receipt.title, "Reminder: مهمتي الأصلية");
    assert.equal(
      receipt.body,
      hostText(s, "حان موعد المهمة. افتح صفحة المهام لمتابعتها."),
    );
    s.setting("drive.account", "fixture-account");
    s.setting("backup.planExpiry.fixture-account", "2026-10-25");
    const expiry = backupExpiryReminder(s, now);
    assert.ok(expiry?.title.startsWith("Google Drive plan reminder:"));
    s.setting("language", "ar");
    setUiLanguage("en");
    assert.equal(hostText(s, "محادثة جديدة"), "محادثة جديدة");
    assert.equal(s.get("inbox", receipt.id)?.title, "Reminder: مهمتي الأصلية");
    assert.equal(s.get("tasks", task.id)?.title, "مهمتي الأصلية");
  } finally {
    setUiLanguage("ar");
    s.close();
    await rm(dir, { recursive: true, force: true });
  }
});
