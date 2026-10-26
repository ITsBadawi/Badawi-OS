import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/core/store.ts";
import { Service } from "../src/core/service.ts";
import { commandSchema, envelopeSchema } from "../src/contracts.ts";
const secrets = new Map<string, string>();
const host = {
  pickProject: async () => null,
  saveText: async () => false,
  pickKey: async () => null,
  pickRestoreDirectory: async () => null,
  openAuth: async () => {},
  secrets: {
    get: (k: string) => secrets.get(k),
    set: (k: string, v: string) => {
      secrets.set(k, v);
    },
    remove: (k: string) => {
      secrets.delete(k);
    },
  },
};
test("native Google Desktop client import configures Drive without returning its secret", async () => {
  const store = new Store(":memory:");
  const localHost = {
    ...host,
    pickOAuthClient: async () =>
      JSON.stringify({
        installed: {
          client_id: "123-fixture.apps.googleusercontent.com",
          client_secret: "DESKTOP_CLIENT_FIXTURE",
          auth_uri: "https://accounts.google.com/o/oauth2/auth",
          token_uri: "https://oauth2.googleapis.com/token",
          redirect_uris: ["http://localhost"],
        },
      }),
  };
  const service = new Service(store, localHost, "unused");
  try {
    await service.command({ op: "drive.importClient" } as any);
    const snap = service.snapshot();
    assert.equal(snap.drive.configured, true);
    assert.equal(
      JSON.stringify(snap).includes("DESKTOP_CLIENT_FIXTURE"),
      false,
    );
    assert.equal(secrets.get("drive.clientSecret"), "DESKTOP_CLIENT_FIXTURE");
  } finally {
    service.engine.close();
    store.close();
  }
});
test("a web OAuth configuration is refused as a Desktop client import", async () => {
  const store = new Store(":memory:"),
    service = new Service(
      store,
      {
        ...host,
        pickOAuthClient: async () =>
          JSON.stringify({
            web: {
              client_id: "123.apps.googleusercontent.com",
              client_secret: "fixture",
            },
          }),
      },
      "unused",
    );
  try {
    await assert.rejects(
      service.command({ op: "drive.importClient" } as any),
      /INVALID_DESKTOP_CLIENT/,
    );
  } finally {
    service.engine.close();
    store.close();
  }
});
test("IPC schema denies arbitrary filesystem, shell and extra properties", () => {
  assert.equal(
    commandSchema.safeParse({
      op: "files.read",
      projectId: "p",
      path: "a.txt",
      root: "C:/",
    }).success,
    false,
  );
  assert.equal(
    commandSchema.safeParse({ op: "exec", cmd: "calc" }).success,
    false,
  );
  assert.equal(
    envelopeSchema.safeParse({ requestId: "bad", command: { op: "snapshot" } })
      .success,
    false,
  );
});
test("note mutations persist and snapshot never returns provider keys", async () => {
  const s = new Store(":memory:");
  const service = new Service(s, host, "unused");
  await service.command({ op: "note.save", title: "My note", body: "local" });
  await service.command({
    op: "provider.save",
    provider: "gemini",
    model: "gemini-3.8-flash",
    key: "FIXTURE_SECRET",
    maxTokens: 512,
    maxRequests: 3,
  });
  const snap = service.snapshot();
  assert.equal(snap.notes[0].body, "local");
  assert.equal(snap.providers.gemini.configured, true);
  assert.equal(JSON.stringify(snap).includes("FIXTURE_SECRET"), false);
  service.engine.close();
  s.close();
});
test("approval is bound to epoch; changed engine invalidates an outgoing payload", async () => {
  const s = new Store(":memory:");
  const service = new Service(s, host, "unused");
  await service.command({
    op: "provider.save",
    provider: "gemini",
    model: "gemini-3.8-flash",
    key: "FIXTURE_SECRET",
    maxTokens: 512,
    maxRequests: 3,
  });
  service.engine.setMode("Running", 0);
  const approval = await service.command({
    op: "ai.preview",
    provider: "gemini",
    prompt: "Summarize this",
  });
  service.engine.setGaming(true, 1);
  await assert.rejects(
    service.command({ op: "ai.confirm", approvalId: approval.id }),
    /APPROVAL_STALE/,
  );
  service.engine.close();
  s.close();
});
test("draft schedules remain disabled and report jobs require registered project", async () => {
  const s = new Store(":memory:");
  const service = new Service(s, host, "unused");
  await assert.rejects(
    service.command({
      op: "job.save",
      name: "unsafe",
      kind: "report",
      projectId: "missing",
      enabled: true,
      trigger: { type: "manual" },
      missedPolicy: "skip",
    }),
    /PROJECT_NOT_FOUND/,
  );
  await service.command({
    op: "job.save",
    name: "local",
    kind: "reminder",
    message: "hello",
    enabled: false,
    trigger: { type: "manual" },
    missedPolicy: "skip",
  });
  assert.equal(service.snapshot().jobs[0].enabled, false);
  service.engine.close();
  s.close();
});
test("an enabled schedule in the past must not silently become a schedule that never runs", async () => {
  const s = new Store(":memory:");
  const service = new Service(s, host, "unused");
  await assert.rejects(
    service.command({
      op: "job.save",
      name: "past",
      kind: "reminder",
      enabled: true,
      trigger: { type: "once", at: "2020-01-01T00:00:00Z" },
      missedPolicy: "skip",
    }),
    /SCHEDULE_NO_FUTURE/,
  );
  assert.equal(s.all("jobs").length, 0);
  service.engine.close();
  s.close();
});
