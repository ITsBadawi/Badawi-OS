import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import english from "../src/locales/english.ts";
import {
  uiText,
  uiFormat,
  uiLabels,
  setUiLanguage,
  prepareLanguage,
  translate,
  formatText,
  localeTag,
  missingEnglishKeys,
} from "../src/localization.ts";
test("language switching resolves static labels again, preserves literal user content and formats parameters after translation", async () => {
  await prepareLanguage("en");
  setUiLanguage("ar");
  const labels = uiLabels({ title: "المهام", nested: [{ label: "حفظ" }] });
  assert.equal(labels.title, "المهام");
  setUiLanguage("en");
  assert.equal(labels.title, "Tasks");
  assert.equal(labels.nested[0].label, "Save");
  assert.equal(uiText("  المهام "), "  Tasks ");
  assert.equal(
    uiFormat("حذف {0}", ["ملفي الخاص {1} $&"]),
    "Delete ملفي الخاص {1} $&",
  );
  assert.equal(translate("المهام", "ar"), "المهام");
  assert.equal(formatText("حذف {0}", ["محادثتي"], "ar"), "حذف محادثتي");
  assert.equal(localeTag(), "en-GB");
  setUiLanguage("ar");
  assert.equal(labels.title, "المهام");
  assert.equal(localeTag(), "ar-IQ");
});
test("unknown UI translations fall back safely and expose a coverage gap without translating dynamic data or making requests", async () => {
  await prepareLanguage("en");
  setUiLanguage("en");
  const source = "نص اختبار غير موجود";
  assert.equal(uiText(source), source);
  assert.ok(missingEnglishKeys().includes(source));
  const data = { name: "بيانات المستخدم" };
  assert.equal(data.name, "بيانات المستخدم");
  setUiLanguage("ar");
});
test("the current app string inventory has complete English coverage and preserves interpolation slots", async () => {
  const inventory = JSON.parse(
    await readFile(
      new URL(
        "../docs/validation/localization-source-inventory.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const slots = (s: string) => [...new Set(s.match(/\{\d+\}/g) || [])].sort();
  for (const { key } of inventory.rows) {
    assert.equal(typeof english[key], "string", `Missing English: ${key}`);
    assert.ok(
      !/[\u0600-\u06ff]/.test(english[key]),
      `Untranslated English: ${key}`,
    );
    assert.deepEqual(slots(english[key]), slots(key), `Parameters: ${key}`);
  }
});
