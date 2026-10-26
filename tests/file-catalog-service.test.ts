import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/core/store.ts";
import { Service } from "../src/core/service.ts";
import { snapshot } from "../src/core/backup.ts";
import { commandSchema } from "../src/contracts.ts";
test("owner refresh is engine-gated; actual chat central reads include only authorized roots and record those source grants for later revocation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "badawi-catalog-chat-")),
    s = new Store(":memory:"),
    keys = new Map<string, string>();
  let calls = 0,
    followup = "";
  const service = new Service(
    s,
    {
      pickProject: async () => null,
      pickKey: async () => null,
      pickRestoreDirectory: async () => null,
      saveText: async () => false,
      openAuth: async () => {},
      secrets: {
        get: (k) => keys.get(k),
        set: (k, v) => {
          keys.set(k, v);
        },
        remove: (k) => {
          keys.delete(k);
        },
      },
    },
    "unused-stage",
    async (_input, init) => {
      calls++;
      if (calls === 2)
        followup = JSON.parse(String(init?.body)).input.at(-1).content[0].text;
      return Response.json({
        status: "completed",
        steps: [
          {
            type: "model_output",
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  calls === 1
                    ? {
                        reply: "Read permitted sources",
                        actions: [
                          JSON.stringify({
                            op: "files.catalog",
                            space: "all",
                            mode: "content",
                            query: "EVIDENCEWORD",
                          }),
                        ],
                      }
                    : { reply: "Source read confirmed", actions: [] },
                ),
              },
            ],
          },
        ],
      });
    },
  );
  try {
    const a = join(dir, "a"),
      b = join(dir, "b");
    await mkdir(a);
    await mkdir(b);
    await writeFile(join(a, "a.md"), "EVIDENCEWORD SAFE_APPROVED_CONTENT");
    await writeFile(
      join(b, "b.md"),
      "EVIDENCEWORD PRIVATE_UNAUTHORIZED_CONTENT",
    );
    const allowed = s.put("projects", {
        name: "Allowed",
        kind: "workfiles",
        root: a,
        aiRead: true,
      }),
      denied = s.put("projects", {
        name: "Denied",
        kind: "workfiles",
        root: b,
      });
    await assert.rejects(
      service.command({
        op: "files.catalog.refresh",
        projectIds: [allowed.id],
      }),
      /ENGINE_STOPPED_OR_PAUSED/,
    );
    await service.command({ op: "engine.mode", mode: "Running", epoch: 0 });
    await service.command({
      op: "files.catalog.refresh",
      projectIds: [allowed.id, denied.id],
    });
    for (const p of [allowed, denied])
      await service.command({ op: "files.index", projectId: p.id });
    await assert.rejects(
      service.command({
        op: "files.preview",
        projectId: allowed.id,
        path: "a.md",
        catalogedAt: "2020-01-01T00:00:00.000Z",
      }),
      /CATALOG_STALE/,
    );
    assert.equal(
      (await service.command({ op: "files.catalog", space: "files" })).matches
        .length,
      2,
    );
    assert.ok(!snapshot(s).toString().includes("SAFE_APPROVED_CONTENT"));
    assert.ok(!snapshot(s).toString().includes("PRIVATE_UNAUTHORIZED_CONTENT"));
    await service.command({
      op: "provider.save",
      provider: "gemini",
      model: "gemini-3.8-flash",
      key: "NOT_A_REAL_KEY",
      maxTokens: 256,
      maxRequests: 20,
    });
    const chat = await service.command({
      op: "chat.create",
      provider: "gemini",
    });
    await service.command({
      op: "chat.send",
      chatId: chat.id,
      text: "Find the requested evidence",
    });
    assert.equal(calls, 2);
    assert.ok(followup.includes("SAFE_APPROVED_CONTENT"));
    assert.ok(!followup.includes("PRIVATE_UNAUTHORIZED_CONTENT"));
    const saved = await service.command({ op: "chat.read", chatId: chat.id });
    assert.deepEqual(saved.messages.at(-1).readProjects, [allowed.id]);
    assert.ok(!snapshot(s).toString().includes("PRIVATE_UNAUTHORIZED_CONTENT"));
    await service.command({
      op: "project.permissions",
      id: allowed.id,
      aiRead: false,
      backupFiles: false,
      monitor: false,
    });
    await assert.rejects(
      service.command({ op: "chat.send", chatId: chat.id, text: "Continue" }),
      /PERMISSION_REVOKED/,
    );
    assert.equal(calls, 2);
    await rm(join(a, "a.md"));
    await assert.rejects(
      service.command({
        op: "files.preview",
        projectId: allowed.id,
        path: "a.md",
      }),
      /FILE_NOT_FOUND/,
    );
    assert.throws(
      () =>
        service.assistant.validate({
          op: "files.catalog.refresh",
          projectIds: [denied.id],
        }),
      /ASSISTANT_ACTION_DENIED/,
    );
    assert.throws(() =>
      commandSchema.parse({ op: "files.catalog", extension: "../../secrets" }),
    );
  } finally {
    service.close();
    s.close();
    await rm(dir, { recursive: true, force: true });
  }
});
