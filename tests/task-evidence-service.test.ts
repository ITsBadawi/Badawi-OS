import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { Store } from "../src/core/store.ts";
import { Service } from "../src/core/service.ts";
import { commandSchema } from "../src/contracts.ts";
import { snapshot, validateSnapshot } from "../src/core/backup.ts";
import { currentVerification } from "../src/core/task-evidence.ts";
test("host verifies an actual local Git commit, requires owner semantic acceptance and restores criteria without importing verified status", async () => {
  const dir = await mkdtemp(join(tmpdir(), "badawi-real-evidence-")),
    store = new Store(":memory:");
  const run = (args: string[]) =>
    execFileSync("C:/Program Files/Git/cmd/git.exe", args, {
      cwd: dir,
      env: {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: "NUL",
      },
      windowsHide: true,
      encoding: "utf8",
    });
  run(["init", "--initial-branch=main"]);
  await writeFile(join(dir, "readme.md"), "Synthetic evidence");
  run(["add", "readme.md"]);
  run([
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-m",
    "Evidence fixture",
  ]);
  const sha = run(["rev-parse", "HEAD"]).trim();
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
    join(dir, "stage"),
  );
  try {
    const p = await service.command({ op: "workspace.add", path: dir });
    const task = await service.command(
      commandSchema.parse({
        op: "task.save",
        title: "Actual evidence",
        done: true,
        projectId: p.id,
        evidenceCommit: sha,
        acceptanceCriteria: [
          {
            id: "g",
            text: "The requested change is committed",
            source: "gitCommit",
          },
        ],
      }),
    );
    const state = service.snapshot();
    await service.command({
      op: "engine.mode",
      mode: "Running",
      epoch: state.engine.epoch,
    });
    let receipt = await service.command(
      commandSchema.parse({ op: "task.verify", id: task.id }),
    );
    assert.equal(receipt.state, "needsReview");
    assert.equal(receipt.evidence[0].reference, sha);
    assert.equal(receipt.evidence[0].provider, "Local Git");
    await service.command(
      commandSchema.parse({
        op: "task.criteria.review",
        id: task.id,
        criterionId: "g",
        accepted: true,
      }),
    );
    receipt = await service.command(
      commandSchema.parse({ op: "task.verify", id: task.id }),
    );
    assert.equal(receipt.state, "verified");
    assert.equal(
      service.snapshot().tasks[0].verificationStatus.state,
      "verified",
    );
    const restored = validateSnapshot(snapshot(store)).tables.tasks[0];
    assert.equal(
      restored.acceptanceCriteria[0].text,
      "The requested change is committed",
    );
    assert.equal(restored.criteriaReviews, undefined);
    assert.equal(restored.verification, undefined);
    assert.equal(currentVerification(restored).state, "unverified");
    await service.command({
      op: "task.save",
      id: task.id,
      title: task.title,
      done: true,
      description: "Changed requirements",
    });
    assert.equal(
      service.snapshot().tasks[0].verificationStatus.state,
      "unverified",
    );
    assert.throws(
      () =>
        service.assistant.validate({
          op: "task.criteria.review",
          id: task.id,
          criterionId: "g",
          accepted: true,
        }),
      /ASSISTANT_ACTION_DENIED/,
    );
  } finally {
    service.close();
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
