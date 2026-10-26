import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { createChatGPT } from "@siwc/local";
import { ChatGPTSubscriptionProvider } from "../src/core/chatgpt-subscription.ts";

test("official SDK: PKCE callback validation, encrypted restart, refresh, models, SSE, limits, cancel and reconnect", async () => {
  const dir = await mkdtemp(join(tmpdir(), "badawi-siwc-sdk-")),
    original = globalThis.fetch;
  const signing = await generateKeyPair("RS256"),
    jwk = await exportJWK(signing.publicKey);
  jwk.kid = "fixture";
  const encryptionKey = randomBytes(32);
  const encryption = {
    id: "test-aes-only-not-production",
    isAvailable: () => true,
    encrypt: (text: string) => {
      const iv = randomBytes(12),
        c = createCipheriv("aes-256-gcm", encryptionKey, iv);
      const bytes = Buffer.concat([c.update(text), c.final()]);
      return Buffer.concat([iv, c.getAuthTag(), bytes]);
    },
    decrypt: (data: Uint8Array) => {
      const b = Buffer.from(data),
        d = createDecipheriv("aes-256-gcm", encryptionKey, b.subarray(0, 12));
      d.setAuthTag(b.subarray(12, 28));
      return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString();
    },
  };
  let nonce = "",
    challenge = "",
    refreshes = 0,
    limited = false,
    cancel = false,
    identityOnly = false,
    expire = false,
    revoked = false,
    client: any;
  const identity = () =>
    new SignJWT({ nonce, email: "fixture@example.test", name: "Fixture Owner" })
      .setProtectedHeader({ alg: "RS256", kid: "fixture" })
      .setIssuer("https://auth.openai.com")
      .setAudience("fixture_client")
      .setSubject("fixture_subject")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(signing.privateKey);
  globalThis.fetch = (async (input: any, init: any = {}) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (url.startsWith("http://127.0.0.1:")) return original(input, init);
    if (url === "https://auth.openai.com/.well-known/openid-configuration")
      return Response.json({
        issuer: "https://auth.openai.com",
        authorization_endpoint: "https://auth.openai.com/authorize",
        token_endpoint: "https://auth.openai.com/token",
        jwks_uri: "https://auth.openai.com/jwks",
        revocation_endpoint: "https://auth.openai.com/revoke",
      });
    if (url === "https://auth.openai.com/jwks")
      return Response.json({ keys: [jwk] });
    if (url === "https://auth.openai.com/token") {
      const b = new URLSearchParams(init.body);
      if (b.get("grant_type") === "refresh_token") {
        refreshes++;
        assert.equal(b.get("refresh_token"), "fixture_refresh");
        if (revoked)
          return Response.json({ error: "invalid_grant" }, { status: 400 });
      } else {
        assert.equal(b.get("code"), "fixture_code");
        const verifier = b.get("code_verifier")!;
        const digest = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(verifier),
        );
        assert.equal(Buffer.from(digest).toString("base64url"), challenge);
      }
      return Response.json({
        id_token: await identity(),
        scope: identityOnly
          ? "openid profile email"
          : "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
        ...(identityOnly
          ? {}
          : {
              access_token: "fixture_access",
              refresh_token: "fixture_refresh",
              token_type: "Bearer",
              expires_in: expire ? 1 : refreshes ? 3600 : 1,
            }),
      });
    }
    if (url === "https://auth.openai.com/revoke")
      return new Response(null, { status: 200 });
    const headers = new Headers(
      init.headers || (input instanceof Request ? input.headers : {}),
    );
    assert.equal(headers.get("authorization"), "Bearer fixture_access");
    if (limited)
      return Response.json(
        {
          error: {
            code: "subscription_sharing_usage_limit_exceeded",
            message: "PRIVATE_DIAGNOSTIC",
          },
        },
        { status: 429 },
      );
    if (url === "https://api.openai.com/v1/models")
      return Response.json({
        models: [
          {
            slug: "fixture-model",
            display_name: "Fixture model",
            visibility: "list",
          },
          { slug: "hidden", display_name: "Hidden", visibility: "hide" },
        ],
      });
    if (url === "https://api.openai.com/v1/responses") {
      const body = JSON.parse(init.body);
      assert.equal(body.store, false);
      assert.equal(body.stream, true);
      assert.equal(body.tools, undefined);
      return new Response(
        [
          'data: {"type":"response.output_text.delta","delta":"Hello "}\n\n',
          'data: {"type":"response.output_text.delta","delta":"owner"}\n\n',
          'data: {"type":"response.completed","response":{"status":"completed"}}\n\n',
        ].join(""),
        { headers: { "content-type": "text/event-stream" } },
      );
    }
    throw Error("Unexpected endpoint " + url);
  }) as typeof fetch;
  const make = () =>
    createChatGPT({
      appName: "Badawi OS",
      appId: "badawi-os",
      redirectPort: 0,
      storageDir: dir,
      credentialEncryption: encryption,
      openBrowser: async (url: string) => {
        if (cancel) {
          setTimeout(() => client.cancelSignIn(), 0);
          return;
        }
        const auth = new URL(url);
        assert.equal(auth.origin, "https://auth.openai.com");
        assert.equal(auth.searchParams.get("code_challenge_method"), "S256");
        assert.ok(
          auth.searchParams.get("scope")!.includes("chatgpt.tokens.use.direct"),
        );
        nonce = auth.searchParams.get("nonce")!;
        challenge = auth.searchParams.get("code_challenge")!;
        const callback = new URL(auth.searchParams.get("redirect_uri")!);
        callback.search = new URLSearchParams({
          state: "WRONG",
          code: "bad",
          client_id: "fixture_client",
        }).toString();
        const rejected = await original(callback);
        assert.equal(rejected.status, 400);
        await rejected.text();
        callback.search = new URLSearchParams({
          state: auth.searchParams.get("state")!,
          code: "fixture_code",
          client_id: "fixture_client",
        }).toString();
        const accepted = await original(callback);
        assert.equal(accepted.status, 200);
        await accepted.text();
      },
    });
  try {
    client = make();
    const provider = new ChatGPTSubscriptionProvider(client);
    await provider.restore();
    assert.equal(provider.available(), false);
    await client.signIn();
    await provider.restore();
    assert.equal(provider.status().identity?.email, "fixture@example.test");
    assert.equal(provider.available(), true);
    const saved = await Promise.all(
      (await readdir(dir))
        .filter((f) => f.endsWith(".json"))
        .map((f) => readFile(join(dir, f), "utf8")),
    );
    assert.ok(saved.length);
    assert.ok(
      saved.every(
        (s) => !s.includes("fixture_access") && !s.includes("fixture_refresh"),
      ),
    );
    client = make();
    const restored = new ChatGPTSubscriptionProvider(client);
    await restored.restore();
    assert.equal(restored.available(), true);
    assert.deepEqual(await restored.models(new AbortController().signal), [
      "fixture-model",
    ]);
    assert.equal(refreshes, 1);
    const chunks: string[] = [];
    const response = await restored.generate(
      {
        provider: "chatgpt",
        model: "fixture-model",
        prompt: "Hi",
        maxTokens: 128,
      },
      new AbortController().signal,
      (d) => chunks.push(d),
    );
    assert.equal(response.text, "Hello owner");
    assert.deepEqual(chunks, ["Hello ", "owner"]);
    limited = true;
    await assert.rejects(
      restored.models(new AbortController().signal),
      /CHATGPT_USAGE_LIMIT/,
    );
    assert.ok(
      !JSON.stringify(restored.status()).includes("PRIVATE_DIAGNOSTIC"),
    );
    limited = false;
    cancel = true;
    await assert.rejects(restored.connect(), /CHATGPT_CANCELLED/);
    cancel = false;
    await restored.disconnect();
    assert.equal(restored.available(), false);
    identityOnly = true;
    await restored.connect(true);
    assert.equal(restored.status().status, "connected");
    assert.equal(restored.available(), false);
    identityOnly = false;
    await restored.connect(true);
    assert.equal(restored.available(), true);
    const aborted = new AbortController();
    aborted.abort();
    await assert.rejects(
      restored.generate(
        {
          provider: "chatgpt",
          model: "fixture-model",
          prompt: "cancel",
          maxTokens: 128,
        },
        aborted.signal,
      ),
      /CHATGPT_CANCELLED/,
    );
    expire = true;
    await restored.connect(true);
    revoked = true;
    await assert.rejects(
      restored.models(new AbortController().signal),
      /CHATGPT_RECONNECT_REQUIRED/,
    );
    await restored.restore();
    assert.equal(restored.status().status, "reauth_required");
    assert.equal(restored.available(), false);
  } finally {
    client?.cancelSignIn();
    globalThis.fetch = original;
    await rm(dir, { recursive: true, force: true });
  }
});
