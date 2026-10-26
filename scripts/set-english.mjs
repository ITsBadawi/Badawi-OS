import { readFile, writeFile } from "node:fs/promises";
import { format } from "prettier";
const keysFile = "src/locales/source-keys.json",
  dataFile = "src/locales/english.data.json";
const inventory = JSON.parse(
  await readFile("docs/validation/localization-source-inventory.json", "utf8"),
);
let keys;
try {
  keys = JSON.parse(await readFile(keysFile, "utf8"));
} catch {
  keys = inventory.rows.map((r) => r.key);
  await writeFile(keysFile, JSON.stringify(keys, null, 2));
}
const knownKeys = new Set(keys);
for (const row of inventory.rows)
  if (!knownKeys.has(row.key)) {
    keys.push(row.key);
    knownKeys.add(row.key);
  }
await writeFile(keysFile, JSON.stringify(keys, null, 2));
let dictionary;
try {
  dictionary = JSON.parse(await readFile(dataFile, "utf8"));
} catch {
  dictionary = { المهام: "Tasks", حفظ: "Save", "حذف {0}": "Delete {0}" };
}
if (process.argv[2]) {
  const updates = JSON.parse(await readFile(process.argv[2], "utf8"));
  for (const [id, value] of Object.entries(updates)) {
    const source = /^\d+$/.test(id) ? keys[Number(id)] : id;
    if (
      !source ||
      typeof value !== "string" ||
      !value.trim() ||
      /[\u0600-\u06ff]/.test(value)
    )
      throw Error(`Invalid English translation ${id}`);
    const slots = (s) =>
      [...new Set(s.match(/\{\d+\}/g) || [])].sort().join("|");
    if (slots(source) !== slots(value))
      throw Error(`Placeholder mismatch ${id}: ${source}`);
    dictionary[source] = value;
  }
}
await writeFile(dataFile, JSON.stringify(dictionary, null, 2));
await writeFile(
  "src/locales/english.ts",
  await format(
    `// Generated from english.data.json by scripts/set-english.mjs.\nconst english: Record<string,string> = ${JSON.stringify(dictionary)};\nexport default english;\n`,
    { parser: "typescript" },
  ),
);
const missing = inventory.rows.filter((r) => dictionary[r.key] === undefined);
console.log(
  JSON.stringify({
    translated: Object.keys(dictionary).length,
    total: inventory.rows.length,
    missing: missing.length,
    next: missing
      .slice(0, 100)
      .map((r) => ({ id: keys.indexOf(r.key), key: r.key })),
  }),
);
