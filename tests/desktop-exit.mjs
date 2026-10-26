import { _electron as electron } from "playwright-core";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = await mkdtemp(path.join(tmpdir(), "badawi-exit-"));
const env = { ...process.env, BADAWI_DATA_DIR: dir };
delete env.BADAWI_BACKGROUND;
delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch({
    ...(process.argv[2] ? { executablePath: path.resolve(process.argv[2]) } : {}),
    args: process.argv[2] ? [] : ["."],
    env,
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  await page.getByRole("button", { name: "لوحة التحكم", exact: true }).waitFor();
  const command = async (value) => {
    const result = await page.evaluate((input) => window.badawi.command(input), value);
    if (!result.ok) throw Error(result.error);
    return result.data;
  };
  const state = await command({ op: "snapshot" });
  await command({ op: "engine.mode", mode: "Running", epoch: state.engine.epoch });
  await Promise.race([
    app.close(),
    new Promise((_, reject) => setTimeout(() => reject(Error("APP_EXIT_TIMEOUT")), 8000)),
  ]);
  app = null;
  console.log("DESKTOP_EXIT_OK");
} finally {
  if (app) {
    app.process()?.kill();
    await new Promise((resolve) => app.process()?.once("exit", resolve));
  }
  await rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 300 });
}
