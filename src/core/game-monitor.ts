import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { Engine } from "./engine.ts";

const execFileAsync = promisify(execFile);

export function normalizeGameNames(value: string[]): string[] {
  if (!Array.isArray(value) || value.length > 30)
    throw Error("GAME_LIST_INVALID");
  const names = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") throw Error("GAME_NAME_INVALID");
    const name = entry.trim().toLowerCase();
    if (name.length > 80 || !/^[^<>:"/\\|?*\x00-\x1f]+\.exe$/u.test(name))
      throw Error("GAME_NAME_INVALID");
    names.add(name);
  }
  return [...names];
}

export function parseTasklist(output: string): string[] {
  const names: string[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = /^"((?:[^"]|"")*)",/.exec(line);
    if (match) names.push(match[1].replace(/""/g, '"').toLowerCase());
  }
  return names;
}

export async function listWindowsProcesses(): Promise<string[]> {
  if (process.platform !== "win32") return [];
  const binary = path.join(
    process.env.SystemRoot || "C:/Windows",
    "System32",
    "tasklist.exe",
  );
  const { stdout } = await execFileAsync(binary, ["/FO", "CSV", "/NH"], {
    timeout: 15000,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  return parseTasklist(stdout);
}

export class GameMonitor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private generation = 0;
  private scanning = false;
  private pendingRefresh = false;
  constructor(
    private engine: Engine,
    private gameNames: () => string[],
    private processes: () => Promise<string[]> = listWindowsProcesses,
  ) {}
  async scanOnce() {
    if (this.scanning) return;
    const generation = this.generation;
    this.scanning = true;
    try {
      const names = normalizeGameNames(this.gameNames());
      const signature = names.join("\0");
      if (!names.length) {
        this.engine.setAutomaticGaming(false);
        return;
      }
      const running = await this.processes();
      if (
        generation !== this.generation ||
        signature !== normalizeGameNames(this.gameNames()).join("\0")
      )
        return;
      const observed = new Set(running.map((name) => name.toLowerCase()));
      this.engine.setAutomaticGaming(names.some((name) => observed.has(name)));
    } catch {
      // Unknown observation leaves the last automatic protection in place.
    } finally {
      this.scanning = false;
      if (this.pendingRefresh) {
        this.pendingRefresh = false;
        void this.scanOnce();
      }
    }
  }
  start() {
    if (this.timer) return;
    void this.scanOnce();
    this.timer = setInterval(() => void this.scanOnce(), 30000);
    this.timer.unref();
  }
  refresh() {
    this.generation++;
    if (!this.timer) return;
    if (this.scanning) this.pendingRefresh = true;
    else void this.scanOnce();
  }
  stop() {
    this.generation++;
    this.pendingRefresh = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
