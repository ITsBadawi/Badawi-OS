import { parsers } from "prettier/plugins/typescript";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
const arabic = /[\u0600-\u06ff]/;
const entries = new Map();
function jsxText(value) {
  const lines = value.split(/\r\n|\n|\r/);
  let last = -1,
    result = "";
  for (let i = 0; i < lines.length; i++) if (/[^ \t]/.test(lines[i])) last = i;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replace(/\t/g, " ");
    if (i !== 0) line = line.replace(/^ +/, "");
    if (i !== lines.length - 1) line = line.replace(/ +$/, "");
    if (line) {
      if (i !== last) line += " ";
      result += line;
    }
  }
  return result;
}
function record(value, node, file) {
  const key = value.trim();
  if (!key || !arabic.test(key)) return;
  const sites = entries.get(key) || [];
  sites.push({ file, line: node.loc?.start.line, kind: node.type });
  entries.set(key, sites);
}
function visit(node, parent, file) {
  if (!node || typeof node !== "object") return;
  if (node.type === "TSLiteralType") return;
  if (
    node.type === "Literal" &&
    typeof node.value === "string" &&
    !(parent?.type === "Property" && parent.key === node && !parent.computed)
  )
    record(node.value, node, file);
  if (node.type === "JSXText") record(jsxText(node.value), node, file);
  if (node.type === "TemplateLiteral")
    record(
      node.quasis
        .map(
          (q, i) =>
            (q.value.cooked ?? q.value.raw) +
            (i < node.expressions.length ? `{${i}}` : ""),
        )
        .join(""),
      node,
      file,
    );
  for (const [key, value] of Object.entries(node)) {
    if (["loc", "range", "comments", "tokens", "parent"].includes(key))
      continue;
    if (Array.isArray(value))
      for (const child of value) visit(child, node, file);
    else if (value && typeof value === "object") visit(value, node, file);
  }
}
const roots = ["src/ui", "src/core", "src/desktop"];
for (const root of roots)
  for (const filename of (await readdir(root)).filter((f) =>
    /\.tsx?$/.test(f),
  )) {
    const file = path.join(root, filename).split(path.sep).join("/"),
      source = await readFile(file, "utf8");
    const ast = await parsers.typescript.parse(source, {
      jsx: filename.endsWith(".tsx"),
    });
    visit(ast, null, file);
  }
const rows = [...entries]
  .map(([key, sites]) => ({ key, sites }))
  .sort((a, b) => a.key.localeCompare(b.key));
const summary = Object.fromEntries(
  roots.map((root) => [
    root,
    rows.filter((r) => r.sites.some((s) => s.file.startsWith(root + "/")))
      .length,
  ]),
);
await writeFile(
  "docs/validation/localization-source-inventory.json",
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      uniqueKeys: rows.length,
      summary,
      rows,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    uniqueKeys: rows.length,
    summary,
    output: "docs/validation/localization-source-inventory.json",
  }),
);
