import { parsers } from "prettier/plugins/typescript";
import { format } from "prettier";
import { readFile, writeFile } from "node:fs/promises";
const arabic = /[\u0600-\u06ff]/;
const files = [
  "core/service",
  "core/chat",
  "core/tasks",
  "core/backup-health",
  "desktop/main",
  "desktop/integration",
];
for (const name of files) {
  const file = `src/${name}.ts`,
    source = await readFile(file, "utf8");
  const ast = await parsers.typescript.parse(source, {});
  const store = ["core/service", "core/chat"].includes(name)
    ? "this.store"
    : "store";
  const used = new Set();
  function render(node, parent) {
    if (
      node.type === "TSLiteralType" ||
      node.type === "ImportDeclaration" ||
      (node.type === "CallExpression" &&
        ["hostText", "hostFormat"].includes(node.callee?.name))
    )
      return source.slice(...node.range);
    if (
      node.type === "Literal" &&
      typeof node.value === "string" &&
      arabic.test(node.value) &&
      !(parent?.type === "Property" && parent.key === node && !parent.computed)
    ) {
      used.add("hostText");
      return `hostText(${store},${JSON.stringify(node.value)})`;
    }
    if (
      node.type === "TemplateLiteral" &&
      node.quasis.some((q) => arabic.test(q.value.cooked ?? q.value.raw))
    ) {
      used.add("hostFormat");
      const template = node.quasis
        .map(
          (q, i) =>
            (q.value.cooked ?? q.value.raw) +
            (i < node.expressions.length ? `{${i}}` : ""),
        )
        .join("");
      return `hostFormat(${store},${JSON.stringify(template)},[${node.expressions.map((e) => render(e, node)).join(",")}])`;
    }
    let result = source.slice(...node.range);
    const edits = [];
    for (const [key, value] of Object.entries(node)) {
      if (["loc", "range", "comments", "tokens", "parent"].includes(key))
        continue;
      for (const child of Array.isArray(value) ? value : [value]) {
        if (!child?.type || !child.range) continue;
        const text = render(child, node);
        if (text !== source.slice(...child.range))
          edits.push({
            start: child.range[0] - node.range[0],
            end: child.range[1] - node.range[0],
            text,
          });
      }
    }
    for (const edit of edits.sort((a, b) => b.start - a.start))
      result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
    return result;
  }
  let output = render(ast, null);
  if (output === source) continue;
  output =
    `import { ${[...used].join(",")} } from "${name.startsWith("core/") ? "./" : "../core/"}host-localization.ts";\n` +
    output;
  if (process.argv.includes("--apply"))
    await writeFile(file, await format(output, { parser: "typescript" }));
  console.log(file);
}
