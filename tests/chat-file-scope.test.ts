import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/core/store.ts";
import { Service } from "../src/core/service.ts";
test("a selected single-file conversation cannot automatically search, list or read the other files in that root without an independent grant", async () => {
  const dir = await mkdtemp(join(tmpdir(), "badawi-selected-file-"));
  try {
    await writeFile(join(dir, "selected.md"), "EVIDENCEWORD_SELECTED_ONLY");
    await writeFile(
      join(dir, "not-selected.md"),
      "EVIDENCEWORD_PRIVATE_OTHER_FILE",
    );
    for (const { op, independentGrant } of [
      "files.catalog",
      "files.search",
      "files.list",
      "files.read",
      "git.read",
      "git.changes",
    ].flatMap((op) => [
      { op, independentGrant: false },
      ...(op === "files.read" ? [{ op, independentGrant: true }] : []),
    ])) {
      const s = new Store(":memory:"),
        keys = new Map<string, string>(),
        payloads: string[] = [];
      let projectId = "";
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
        async (_u, init) => {
          payloads.push(JSON.stringify(JSON.parse(String(init?.body))));
          const action =
            op === "files.catalog"
              ? { op, space: "all", mode: "content", query: "EVIDENCEWORD" }
              : op === "files.search"
                ? { op, projectId, query: "EVIDENCEWORD" }
                : op === "files.read"
                  ? { op, projectId, path: "not-selected.md" }
                  : op === "git.read"
                    ? { op, projectId, tool: "log" }
                    : { op, projectId };
          const response =
            payloads.length === 1
              ? {
                  reply: "Read only permitted evidence",
                  actions: [JSON.stringify(action)],
                }
              : { reply: "Selected evidence read", actions: [] };
          return Response.json({
            status: "completed",
            steps: [
              {
                type: "model_output",
                content: [{ type: "text", text: JSON.stringify(response) }],
              },
            ],
          });
        },
      );
      try {
        const p = s.put("projects", {
          name: "Selected source",
          root: dir,
          kind: "workfiles",
          aiRead: independentGrant,
          fileEntries: [
            {
              path: "not-selected.md",
              category: "document",
              tags: ["siblingMetadata"],
              linkedProjectIds: [],
            },
          ],
        });
        projectId = p.id;
        await service.command({ op: "engine.mode", mode: "Running", epoch: 0 });
        await service.command({ op: "files.index", projectId });
        await service.command({
          op: "files.catalog.refresh",
          projectIds: [projectId],
        });
        await service.command({
          op: "provider.save",
          provider: "gemini",
          model: "gemini-3.8-flash",
          key: "NOT_A_REAL_KEY",
          maxTokens: 256,
          maxRequests: 10,
        });
        const chat = await service.command({
          op: "chat.create",
          provider: "gemini",
        });
        await service.command({
          op: "chat.send",
          chatId: chat.id,
          text: "Explain only this selected file",
          projectId,
          filePath: "selected.md",
        });
        assert.ok(payloads[0].includes("EVIDENCEWORD_SELECTED_ONLY"));
        assert.ok(
          independentGrant || !payloads[0].includes("not-selected.md"),
          `${op}: initial evidence cannot list other files`,
        );
        assert.ok(
          independentGrant ||
            payloads.every(
              (p) => !p.includes("EVIDENCEWORD_PRIVATE_OTHER_FILE"),
            ),
          `${op}: unauthorized content cannot enter provider requests`,
        );
        if (independentGrant) {
          assert.equal(payloads.length, 2);
          assert.ok(payloads[1].includes("EVIDENCEWORD_PRIVATE_OTHER_FILE"));
        } else if (op === "files.read" || op === "git.read" || op === "git.changes") {
          assert.equal(payloads.length, 1);
          const plan = s.all("plans")[0];
          assert.equal(plan.status, "pending");
          assert.equal(plan.actions[0].command.op, op);
        } else {
          assert.equal(payloads.length, 2);
          assert.ok(payloads[1].includes("selected.md"));
          assert.ok(!payloads[1].includes("not-selected.md"));
        }
      } finally {
        service.close();
        s.close();
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
