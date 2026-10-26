import { _electron as electron } from "playwright-core";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
const directory = await mkdtemp(path.join(tmpdir(), "badawi-resources-"));
const env = {
  ...process.env,
  BADAWI_DATA_DIR: directory,
  BADAWI_BACKGROUND: "1",
};
delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch({ args: ["."], env });
  const page = await app.firstWindow();
  await page.waitForSelector('[data-testid="engine-state"]');
  const samples = [];
  for (const mode of ["Stopped", "RunningIdle", "Gaming"]) {
    if (mode === "RunningIdle")
      await page.evaluate(() =>
        window.badawi.command({ op: "engine.mode", mode: "Running", epoch: 0 }),
      );
    if (mode === "Gaming")
      await page.evaluate(() =>
        window.badawi.command({ op: "engine.gaming", enabled: true, epoch: 1 }),
      );
    await new Promise((r) => setTimeout(r, 5000));
    const processes = await app.evaluate(({ app }) =>
      app.getAppMetrics().map((p) => ({
        type: p.type,
        cpu: p.cpu.percentCPUUsage,
        rssKiB: p.memory.workingSetSize,
      })),
    );
    samples.push({
      mode,
      processes,
      totalRSSMiB: processes.reduce((n, p) => n + p.rssKiB, 0) / 1024,
      totalCPU: processes.reduce((n, p) => n + p.cpu, 0),
    });
  }
  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/idle-resources.json",
    JSON.stringify(
      {
        note: "Short hidden-window diagnostic, not T33 game benchmark. RSS sums may count shared pages more than once. No FPS claim.",
        samples,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(samples, null, 2));
} finally {
  if (app) await app.close();
  await rm(directory, { recursive: true, force: true });
}
