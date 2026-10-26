import { cp, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
if (process.platform !== "win32")
  throw Error("Windows packaging must run on Windows");
const version = JSON.parse(await readFile("package.json", "utf8")).version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error("Invalid release version");
const root = path.resolve("release"),
  name = `Badawi-OS-${version}-Windows`,
  out = path.join(root, name);
if (
  path.dirname(out) !== root ||
  path.basename(out) !== name
)
  throw Error("Unsafe output path");
await mkdir(root, { recursive: true });
if (existsSync(out)) throw Error(`Release already exists: ${out}`);
await cp("node_modules/electron/dist", out, { recursive: true });
await rename(path.join(out, "electron.exe"), path.join(out, "Badawi OS.exe"));
const resources = path.join(out, "resources", "app");
await mkdir(resources, { recursive: true });
await cp("dist", path.join(resources, "dist"), { recursive: true });
await cp("dist-desktop", path.join(resources, "dist-desktop"), {
  recursive: true,
});
await writeFile(
  path.join(resources, "package.json"),
  JSON.stringify({
    name: "badawi-os",
    productName: "Badawi OS",
    version,
    main: "dist-desktop/main.cjs",
  }),
);
await cp("START-HERE-AR.txt", path.join(out, "ابدأ-هنا.txt"));
await cp("README.md", path.join(out, "README.md"));
await cp("docs", path.join(out, "docs"), { recursive: true });
await cp(
  "docs/IMPLEMENTATION-STATUS.md",
  path.join(out, "IMPLEMENTATION-STATUS.md"),
);
await mkdir(path.join(out, "third-party-licenses"), { recursive: true });
await cp(
  "vendor/siwc-local/LICENSE",
  path.join(out, "third-party-licenses", "siwc-devkit.txt"),
);
await cp(
  "vendor/siwc-local/THIRD_PARTY_NOTICES.md",
  path.join(out, "third-party-licenses", "siwc-third-party-notices.md"),
);
for (const name of [
  "react",
  "react-dom",
  "scheduler",
  "lucide-react",
  "luxon",
  "zod",
]) {
  let copied = false;
  for (const filename of ["LICENSE", "LICENSE.md", "LICENSE.txt", "license"]) {
    try {
      await cp(
        path.join("node_modules", name, filename),
        path.join(out, "third-party-licenses", `${name}.txt`),
      );
      copied = true;
      break;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  if (!copied) throw Error(`Missing license for ${name}`);
}
console.log(out);
