import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/core/store.ts";
import { Service } from "../src/core/service.ts";
import { commandSchema } from "../src/contracts.ts";
test("owner exports actual local report bytes while reports never contact a provider; assistant read policy is enforced", async () => {
  const dir = await mkdtemp(join(tmpdir(), "badawi-report-export-")),
    store = new Store(":memory:");
  let calls = 0,
    file = "";
  const service = new Service(
    store,
    {
      pickProject: async () => null,
      pickKey: async () => null,
      pickRestoreDirectory: async () => null,
      openAuth: async () => {},
      saveText: async (name, text) => {
        file = join(dir, name);
        await writeFile(file, text);
        return true;
      },
      secrets: { get: () => undefined, set: () => {}, remove: () => {} },
    },
    join(dir, "stage"),
    async () => {
      calls++;
      throw Error("Unexpected network");
    },
  );
  try {
    await service.command({
      op: "task.save",
      title: "Claim remains a claim",
      done: true,
    });
    assert.equal(service.engine.snapshot().mode, "Stop");
    const report = await service.command(
      commandSchema.parse({ op: "report.read", days: 7 }),
    );
    assert.equal(report.tasks.unverified, 1);
    assert.equal(report.tasks.verified, 0);
    assert.equal(
      service.assistant.validate({ op: "report.read", days: 7 }).op,
      "report.read",
    );
    assert.throws(
      () => service.assistant.validate({ op: "report.export", days: 7 }),
      /ASSISTANT_ACTION_DENIED/,
    );
    assert.equal(
      await service.command(
        commandSchema.parse({ op: "report.export", days: 7 }),
      ),
      true,
    );
    const saved = JSON.parse(await readFile(file, "utf8"));
    assert.equal(saved.tasks.claimedCompleted, 1);
    assert.equal(saved.tasks.verified, 0);
    assert.equal(saved.range.days, 7);
    assert.equal(calls, 0);
    assert.ok(store.auditRows().some((a) => a.event === "report.exported"));
    await service.command({
      op: "tool.policy.set",
      tool: "report.read",
      policy: "forbidden",
    });
    assert.throws(
      () => service.assistant.validate({ op: "report.read", days: 7 }),
      /TOOL_FORBIDDEN/,
    );
    assert.equal(
      commandSchema.safeParse({ op: "report.read", days: 7, path: "C:/" })
        .success,
      false,
    );
  } finally {
    service.close();
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
