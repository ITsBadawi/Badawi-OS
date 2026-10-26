import { _electron as electron } from "playwright-core";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";

const dir = await mkdtemp(path.join(tmpdir(), "badawi-vercel-live-"));
const projectRoot = path.join(dir, "synthetic-project");
await mkdir(projectRoot);
const env = { ...process.env, BADAWI_DATA_DIR: path.join(dir, "data") };
delete env.ELECTRON_RUN_AS_NODE;
let app, page, input, ticker, projectId;
const executablePath = path.resolve("release/Badawi-OS-0.4.1-Windows/Badawi OS.exe");
async function launch() {
  app = await electron.launch({ executablePath, args: [], env });
  page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  await page.getByRole("button", { name: "الإعدادات", exact: true }).click();
}
async function command(c) {
  const result = await page.evaluate((value) => window.badawi.command(value), c);
  if (!result.ok) throw Error(result.error);
  return result.data;
}
async function configured() {
  return !!(await command({ op: "snapshot" })).integrations.vercel.configured;
}
try {
  await launch();
  console.log(JSON.stringify({ event: "READY", instruction: "Enter the temporary Vercel token only in the visible Badawi OS Settings field, then save it." }));
  let last = null;
  ticker = setInterval(async () => {
    try {
      const next = await configured();
      if (next !== last) {
        last = next;
        console.log(JSON.stringify({ event: "TOKEN_STATE", configured: next }));
      }
    } catch {}
  }, 2000);
  input = readline.createInterface({ input: process.stdin, terminal: false });
  for await (const line of input) {
    const request = line.trim();
    if (request === "quit") break;
    try {
      if (request === "status") {
        console.log(JSON.stringify({ event: "TOKEN_STATE", configured: await configured() }));
        continue;
      }
      if (request !== "check" && request !== "check-default") continue;
      if (!(await configured())) throw Error("VERCEL_TOKEN_NOT_SAVED");
      if (!projectId) {
        const project = await command({ op: "workspace.add", path: projectRoot });
        projectId = project.id;
      }
      const current = await command({ op: "snapshot" });
      const project = current.projects.find((item) => item.id === projectId);
      const link = {
        projectId: "prj_ywuXmamRPqG24nwh8cRSxGmi7wHW",
        target: "production",
        ...(request === "check" ? { teamId: "team_xhN6PVhfNt9iPWrqcGGaIgUZ" } : {}),
      };
      await command({
        op: "project.details", id: projectId, name: project.name,
        description: "Synthetic local registration for read-only Vercel acceptance",
        technologies: [], github: null, deployments: { vercel: link },
      });
      const before = await command({ op: "snapshot" });
      if (before.engine.mode !== "Running")
        await command({ op: "engine.mode", mode: "Running", epoch: before.engine.epoch });
      const receipt = await command({ op: "deployment.check", projectId, provider: "vercel" });
      console.log(JSON.stringify({
        event: "CHECK", teamScope: request === "check" ? "explicit" : "default",
        state: receipt.state, status: receipt.status, reference: receipt.reference,
        commitSha: receipt.commitSha || null, observedAt: receipt.observedAt,
      }));
      await app.close();
      await launch();
      const restarted = await command({ op: "snapshot" });
      console.log(JSON.stringify({
        event: "RESTART", configured: restarted.integrations.vercel.configured,
        engine: restarted.engine.mode,
        historicalReference: restarted.projects.find((item) => item.id === projectId)?.deploymentChecks?.vercel?.reference || null,
      }));
      await command({ op: "integration.disconnect", integration: "vercel" });
      const disconnected = await command({ op: "snapshot" });
      console.log(JSON.stringify({
        event: "DISCONNECT", configured: disconnected.integrations.vercel.configured,
        cachedReceipt: !!disconnected.projects.find((item) => item.id === projectId)?.deploymentChecks?.vercel,
      }));
    } catch (error) {
      console.log(JSON.stringify({ event: "CHECK_ERROR", code: error.message }));
    }
  }
} finally {
  if (ticker) clearInterval(ticker);
  input?.close();
  process.stdin.pause();
  await app?.close().catch(() => {});
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
process.exit(0);
