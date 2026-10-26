import { build } from "esbuild";
await build({
  entryPoints: ["src/desktop/main.ts"],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  outfile: "dist-desktop/main.cjs",
  external: ["electron"],
  sourcemap: true,
});
await build({
  entryPoints: ["src/desktop/preload.ts"],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  outfile: "dist-desktop/preload.cjs",
  external: ["electron"],
});
