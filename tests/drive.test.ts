import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { Store } from "../src/core/store.ts";
import { Drive } from "../src/core/drive.ts";
test("a Drive network failure preserves the last verified backup and persists no raw credential error", async () => {
  const dir = await mkdtemp(join(tmpdir(), "badawi-drive-error-")),
    store = new Store(":memory:");
  const values = new Map<string, string>([
    ["backup.key", randomBytes(32).toString("base64")],
    [
      "drive.tokens",
      JSON.stringify({
        access_token: "fixture",
        expiresAt: Date.now() + 3600000,
      }),
    ],
  ]);
  store.setting("drive.account", "fixture-account");
  store.setting("backup.keyExported", true);
  store.put("backups", {
    id: "last-good",
    account: "fixture-account",
    status: "verified",
    hash: "preserved",
  });
  const drive = new Drive(
    store,
    {
      get: (k) => values.get(k),
      set: (k, v) => {
        values.set(k, v);
      },
      remove: (k) => {
        values.delete(k);
      },
    },
    dir,
    async () => {},
    async () => {
      throw Error("URL included PRIVATE_TOKEN_FIXTURE");
    },
  );
  try {
    await assert.rejects(
      drive.backup(new AbortController().signal, () => {}),
      /WAITING_NETWORK/,
    );
    assert.equal(store.get("backups", "last-good")!.hash, "preserved");
    assert.equal(store.all("backups")[0].reason, "WAITING_NETWORK");
    assert.equal(
      JSON.stringify(store.all("backups")).includes("PRIVATE_TOKEN_FIXTURE"),
      false,
    );
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("interrupted Drive upload resumes at the server offset, reuses file id and verifies decrypt", async () => {
  // Exercise fetch's real 308 handling; a constructed Response hides redirect:error failures.
  const server = createServer((req, res) => {
    res.writeHead(308, {
      Range: new URL(req.url!, "http://localhost").searchParams.get("range")!,
    });
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const serverUrl = `http://127.0.0.1:${(server.address() as any).port}`;
  const incomplete = (range: string, redirect: RequestRedirect | undefined) =>
    fetch(`${serverUrl}/?${new URLSearchParams({ range })}`, { redirect });
  try {
    const dir = await mkdtemp(join(tmpdir(), "badawi-drive-"));
    const store = new Store(":memory:");
    for (let i = 0; i < 4; i++)
      store.put("notes", { title: `note ${i}`, body: randomBytes(75000).toString('base64') });
    store.setting("backup.keyExported", true);
    store.setting("drive.account", "fixture-account");
    const values = new Map<string, string>([
      ["backup.key", randomBytes(32).toString("base64")],
      [
        "drive.tokens",
        JSON.stringify({
          access_token: "FAKE",
          expiresAt: Date.now() + 3600000,
        }),
      ],
    ]);
    const secrets = {
      get: (k: string) => values.get(k),
      set: (k: string, v: string) => {
        values.set(k, v);
      },
      remove: (k: string) => {
        values.delete(k);
      },
    };
    let idCount = 0;
    let received = Buffer.alloc(0);
    const created = new Set<string>();
    const ranges: string[] = [];
    const cancel = new AbortController();
    let shouldInterrupt = true;
    const transport: typeof fetch = async (input, init = {}) => {
      const url = String(input),
        headers = new Headers(init.headers);
      if (url.includes("generateIds"))
        return Response.json({ ids: [`fixture-id-${++idCount}`] });
      if (url.endsWith("files?fields=id")) {
        const body = JSON.parse(init.body as string);
        if (created.has(body.id)) return new Response("", { status: 409 });
        created.add(body.id);
        return Response.json({ id: body.id });
      }
      if (url.includes("uploadType=resumable"))
        return new Response("", {
          headers: {
            location:
              "https://www.googleapis.com/upload/drive/v3/files/session",
          },
        });
      if (url.endsWith("/session")) {
        const range = headers.get("Content-Range")!;
        ranges.push(range);
        if (range.startsWith("bytes */"))
          return incomplete(`bytes=0-${received.length - 1}`, init.redirect);
        const total = Number(range.split("/")[1]);
        received = Buffer.concat([
          received,
          Buffer.from(init.body as Uint8Array),
        ]);
        if (received.length < total) {
          if (shouldInterrupt) {
            cancel.abort();
            shouldInterrupt = false;
          }
          return incomplete(`bytes=0-${received.length - 1}`, init.redirect);
        }
        return Response.json({ id: "fixture-id-1" });
      }
      if (url.includes("alt=media")) return new Response(received);
      if (url.includes("?fields=id,size,appProperties"))
        return Response.json({
          size: received.length,
          appProperties: { badawiKind: "backup" },
        });
      throw Error(`Unexpected fixture URL ${url}`);
    };
    const drive = new Drive(store, secrets, dir, async () => {}, transport);
    await assert.rejects(drive.backup(cancel.signal, () => {}));
    assert.equal(store.all("backups")[0].status, "checkpointed");
    assert.equal(store.all("backups")[0].offset, 262144);
    const result = await drive.backup(new AbortController().signal, () => {});
    assert.equal(result.verified, true);
    assert.equal(store.all("backups").length, 1);
    assert.equal(store.all("backups")[0].status, "verified");
    assert.equal(idCount, 2);
    assert.ok(ranges.some((r) => r.startsWith("bytes 262144-")));
    assert.equal(
      [...values.keys()].some((k) => k.startsWith("upload.")),
      false,
    );
    store.close();
    await rm(dir, { recursive: true });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
