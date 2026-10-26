import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/core/store.ts";
import { Engine } from "../src/core/engine.ts";
import {
  GameMonitor,
  listWindowsProcesses,
  normalizeGameNames,
  parseTasklist,
} from "../src/core/game-monitor.ts";
import { Service } from "../src/core/service.ts";
import { commandSchema } from "../src/contracts.ts";
import { copyFileSync, mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

test("automatic Gaming preserves manual choice and requested mode", () => {
  const store = new Store(":memory:");
  let engine = new Engine(store, async () => ({}));
  try {
    engine.setMode("Pause", engine.snapshot().epoch);
    engine.setAutomaticGaming(true);
    assert.equal(engine.snapshot().gaming, true);
    assert.equal(engine.snapshot().gamingAutomatic, true);
    assert.equal(engine.snapshot().effective, "Paused");
    engine.setGaming(true, engine.snapshot().epoch);
    engine.setAutomaticGaming(false);
    assert.equal(engine.snapshot().gaming, true);
    assert.equal(engine.snapshot().gamingManual, true);
    engine.close();
    engine = new Engine(store, async () => ({}));
    assert.equal(engine.snapshot().gaming, true);
    assert.equal(engine.snapshot().gamingAutomatic, false);
    engine.setGaming(false, engine.snapshot().epoch);
    assert.equal(engine.snapshot().effective, "Stopped");
  } finally {
    engine.close();
    store.close();
  }
});

test("owner saves a bounded game list through service and sees it in snapshot", async () => {
  const store = new Store(":memory:");
  const service = new Service(
    store,
    {
      pickProject: async () => null,
      saveText: async () => false,
      pickKey: async () => null,
      pickRestoreDirectory: async () => null,
      openAuth: async () => {},
      secrets: { get: () => undefined, set: () => {}, remove: () => {} },
    },
    "unused",
  );
  try {
    assert.equal(
      commandSchema.safeParse({ op: "game.list.save", names: ["game.exe"] })
        .success,
      true,
    );
    await service.command({
      op: "game.list.save",
      names: [" GAME.EXE ", "game.exe"],
    } as any);
    assert.deepEqual(service.snapshot().gameDetection.names, ["game.exe"]);
    await assert.rejects(
      service.command({ op: "game.list.save", names: ["C:\\game.exe"] } as any),
      /GAME_NAME_INVALID/,
    );
    assert.deepEqual(service.snapshot().gameDetection.names, ["game.exe"]);
  } finally {
    service.close();
    store.close();
  }
});

test("game names are exact executable images, and tasklist parsing handles CSV quotes", () => {
  assert.deepEqual(
    normalizeGameNames(["  EldenRing.EXE ", "eldenring.exe", "game.exe"]),
    ["eldenring.exe", "game.exe"],
  );
  assert.deepEqual(normalizeGameNames(["لعبة.exe"]), ["لعبة.exe"]);
  assert.throws(
    () => normalizeGameNames(["C:\\Games\\game.exe"]),
    /GAME_NAME_INVALID/,
  );
  assert.throws(
    () => normalizeGameNames(["game.exe /silent"]),
    /GAME_NAME_INVALID/,
  );
  assert.deepEqual(
    parseTasklist(
      '"game.exe","123","Console","1","12,345 K"\r\n"other.exe","24","Console","1","5 K"',
    ),
    ["game.exe", "other.exe"],
  );
});

test("failed and stale observations never release an active automatic overlay", async () => {
  const store = new Store(":memory:");
  const engine = new Engine(store, async () => ({}));
  let names = ["game.exe"];
  let processes = ["GAME.EXE"];
  let fail = false;
  const monitor = new GameMonitor(
    engine,
    () => names,
    async () => {
      if (fail) throw Error("QUERY_FAILED");
      return processes;
    },
  );
  try {
    await monitor.scanOnce();
    assert.equal(engine.snapshot().gamingAutomatic, true);
    fail = true;
    await monitor.scanOnce();
    assert.equal(engine.snapshot().gamingAutomatic, true);
    names = ["C:\\invalid.exe"];
    await monitor.scanOnce();
    assert.equal(engine.snapshot().gamingAutomatic, true);
    names = ["game.exe"];
    fail = false;
    processes = ["game.exe.bak"];
    await monitor.scanOnce();
    assert.equal(engine.snapshot().gamingAutomatic, false);
    processes = ["game.exe"];
    const pending = monitor.scanOnce();
    names = [];
    await pending;
    assert.equal(engine.snapshot().gamingAutomatic, false);
  } finally {
    monitor.stop();
    engine.close();
    store.close();
  }
});

test(
  "a real selected Windows process activates and releases automatic Gaming",
  { skip: process.platform !== "win32" },
  async () => {
    const waitForImage = async (present: boolean) => {
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        const visible = (await listWindowsProcesses()).includes("badawi-test-game.exe");
        if (visible === present) return;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw Error(present ? "GAME_PROCESS_DID_NOT_START" : "GAME_PROCESS_DID_NOT_EXIT");
    };
    const dir = mkdtempSync(path.join(tmpdir(), "badawi-game-process-"));
    const executable = path.join(dir, "badawi-test-game.exe");
    copyFileSync(
      path.join(
        process.env.SystemRoot || "C:\\Windows",
        "System32",
        "ping.exe",
      ),
      executable,
    );
    const child = spawn(executable, ["-t", "127.0.0.1"], {
      stdio: "ignore",
      windowsHide: true,
    });
    const childClosed = new Promise<void>((resolve) => child.once("close", () => resolve()));
    const store = new Store(":memory:");
    const engine = new Engine(store, async () => ({}));
    const monitor = new GameMonitor(engine, () => ["badawi-test-game.exe"]);
    try {
      await waitForImage(true);
      await monitor.scanOnce();
      assert.equal(engine.snapshot().gamingAutomatic, true);
      child.kill();
      await childClosed;
      await waitForImage(false);
      await monitor.scanOnce();
      assert.equal(engine.snapshot().gamingAutomatic, false);
      assert.equal(engine.snapshot().mode, "Stop");
    } finally {
      child.kill();
      await childClosed;
      monitor.stop();
      engine.close();
      store.close();
      await rm(dir, { recursive: true, force: true, maxRetries: 30, retryDelay: 500 });
    }
  },
);
