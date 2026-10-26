import { parsers } from "prettier/plugins/typescript";
import { format } from "prettier";
import { readFile, readdir, writeFile } from "node:fs/promises";
const arabic = /[\u0600-\u06ff]/;
function cleanJsx(value) {
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
function children(node) {
  const found = [];
  for (const [key, value] of Object.entries(node)) {
    if (["loc", "range", "comments", "tokens", "parent"].includes(key))
      continue;
    for (const child of Array.isArray(value) ? value : [value])
      if (
        child &&
        typeof child === "object" &&
        typeof child.type === "string" &&
        child.range
      )
        found.push(child);
  }
  return found;
}
const changes = [];
for (const filename of (await readdir("src/ui")).filter((f) =>
  f.endsWith(".tsx"),
)) {
  const file = "src/ui/" + filename,
    source = await readFile(file, "utf8"),
    ast = await parsers.typescript.parse(source, { jsx: true }),
    used = new Set();
  const staticInitializers = new Set();
  for (const top of ast.body) {
    const node = top.type === "ExportNamedDeclaration" ? top.declaration : top;
    if (node?.type === "VariableDeclaration")
      for (const d of node.declarations)
        if (
          ["ObjectExpression", "ArrayExpression"].includes(d.init?.type) &&
          arabic.test(source.slice(...d.init.range))
        )
          staticInitializers.add(d.init);
  }
  function render(node, parent, raw = false) {
    if (node.type === "TSLiteralType") return source.slice(...node.range);
    if (
      node.type === "CallExpression" &&
      ["uiText", "uiFormat", "uiLabels"].includes(node.callee?.name)
    )
      return source.slice(...node.range);
    if (staticInitializers.has(node)) {
      used.add("uiLabels");
      staticInitializers.delete(node);
      return `uiLabels(${render(node, parent, true)})`;
    }
    if (
      !raw &&
      node.type === "Literal" &&
      typeof node.value === "string" &&
      arabic.test(node.value) &&
      !(parent?.type === "Property" && parent.key === node && !parent.computed)
    ) {
      used.add("uiText");
      const result = `uiText(${JSON.stringify(node.value)})`;
      return parent?.type === "JSXAttribute" ? `{${result}}` : result;
    }
    if (node.type === "JSXText" && arabic.test(node.value)) {
      used.add("uiText");
      return `{uiText(${JSON.stringify(cleanJsx(node.value))})}`;
    }
    if (
      !raw &&
      node.type === "TemplateLiteral" &&
      node.quasis.some((q) => arabic.test(q.value.cooked ?? q.value.raw))
    ) {
      used.add("uiFormat");
      const template = node.quasis
        .map(
          (q, i) =>
            (q.value.cooked ?? q.value.raw) +
            (i < node.expressions.length ? `{${i}}` : ""),
        )
        .join("");
      return `uiFormat(${JSON.stringify(template)},[${node.expressions.map((e) => render(e, node, false)).join(",")}])`;
    }
    let result = source.slice(...node.range);
    const edits = [];
    for (const child of children(node)) {
      const childRaw = [
        "ArrowFunctionExpression",
        "FunctionExpression",
      ].includes(child.type)
        ? false
        : raw;
      const value = render(child, node, childRaw);
      if (value !== source.slice(...child.range))
        edits.push({
          start: child.range[0] - node.range[0],
          end: child.range[1] - node.range[0],
          value,
        });
    }
    for (const edit of edits.sort((a, b) => b.start - a.start))
      result =
        result.slice(0, edit.start) + edit.value + result.slice(edit.end);
    return result;
  }
  let output = render(ast, null);
  if (output === source) continue;
  output =
    `import {${[...used].sort().join(",")}} from "../localization.ts";\n` +
    output;
  output = await format(output, { parser: "typescript" });
  changes.push({ file, helpers: [...used] });
  if (process.argv.includes("--apply")) await writeFile(file, output);
}
console.log(
  JSON.stringify({
    applied: process.argv.includes("--apply"),
    files: changes.length,
    changes,
  }),
);
