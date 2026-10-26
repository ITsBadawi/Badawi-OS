import { _electron as electron } from "playwright-core";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import {
  mkdtemp,
  rm,
  readFile,
  readdir,
  writeFile,
  mkdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const dir = await mkdtemp(path.join(tmpdir(), "badawi-siwc-desktop-")),
  checks = [],
  errors = [];
const signing = await generateKeyPair("RS256"),
  jwk = await exportJWK(signing.publicKey);
jwk.kid = "ui-fixture";
let app, page;
const command = async (c) => {
  const r = await page.evaluate((c) => window.badawi.command(c), c);
  if (!r.ok) throw Error(r.error);
  return r.data;
};
async function launch() {
  const env = {
    ...process.env,
    BADAWI_DATA_DIR: path.join(dir, "data"),
    BADAWI_BACKGROUND: "1",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: ["."], env });
  app.process().stderr.on("data", (b) => console.log(b.toString()));
  page = await app.firstWindow();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("button", { name: "الإعدادات", exact: true }).click();
}
try {
  await launch();
  await app.evaluate(({ shell }, jwk) => {
    const f = (globalThis.__siwcTest = {
      jwt: "",
      auth: "",
      requests: 0,
      paidRequests: 0,
    });
    const original = globalThis.fetch;
    shell.openExternal = async (url) => {
      f.auth = url;
    };
    globalThis.fetch = async (input, init = {}) => {
      const url = String(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
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
      if (url === "https://auth.openai.com/token")
        return Response.json({
          id_token: f.jwt,
          scope:
            "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
          access_token: "ui_fixture_access",
          refresh_token: "ui_fixture_refresh",
          token_type: "Bearer",
          expires_in: 3600,
        });
      if (url === "https://auth.openai.com/revoke")
        return new Response(null, { status: 200 });
      if (url === "https://api.openai.com/v1/models")
        return Response.json({
          models: [
            {
              slug: "ui-fixture-model",
              display_name: "UI fixture",
              visibility: "list",
            },
          ],
        });
      if (url === "https://api.openai.com/v1/responses") {
        f.requests++;
        if (
          new Headers(init.headers).get("authorization") !==
          "Bearer ui_fixture_access"
        )
          f.paidRequests++;
        return new Response(
          new ReadableStream({
            start(controller) {
              const emit = (x) =>
                controller.enqueue(
                  new TextEncoder().encode(
                    "data: " + JSON.stringify(x) + "\n\n",
                  ),
                );
              emit({
                type: "response.output_text.delta",
                delta: '{"reply":"Synthetic subscription',
              });
              setTimeout(() => {
                emit({
                  type: "response.output_text.delta",
                  delta: ' response","actions":[]}',
                });
                emit({
                  type: "response.completed",
                  response: { status: "completed" },
                });
                controller.close();
              }, 1200);
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        );
      }
      return original(input, init);
    };
  }, jwk);
  await page
    .getByRole("button", { name: "Continue with ChatGPT", exact: true })
    .click();
  let auth;
  for (let n = 0; n < 50; n++) {
    auth = await app.evaluate(() => globalThis.__siwcTest.auth);
    if (auth) break;
    await page.waitForTimeout(100);
  }
  assert.ok(auth);
  const url = new URL(auth);
  assert.equal(url.origin, "https://auth.openai.com");
  assert.equal(url.searchParams.get("agent_name_hint"), "Badawi OS");
  const jwt = await new SignJWT({
    nonce: url.searchParams.get("nonce"),
    email: "native-fixture@example.test",
    name: "Native Fixture",
  })
    .setProtectedHeader({ alg: "RS256", kid: "ui-fixture" })
    .setIssuer("https://auth.openai.com")
    .setAudience("ui_fixture_client")
    .setSubject("ui-fixture-owner")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signing.privateKey);
  await app.evaluate((_, jwt) => {
    globalThis.__siwcTest.jwt = jwt;
  }, jwt);
  const callback = new URL(url.searchParams.get("redirect_uri"));
  callback.search = new URLSearchParams({
    state: url.searchParams.get("state"),
    code: "ui_fixture_code",
    client_id: "ui_fixture_client",
  }).toString();
  const response = await fetch(callback);
  assert.equal(response.status, 200);
  await response.text();
  await page.getByText(/native-fixture@example.test/).waitFor();
  checks.push(
    "Official SDK connects through real native IPC, PKCE callback and verified identity with controlled remote transport",
  );
  const control = page.getByLabel("نموذج ChatGPT", { exact: true });
  await control.selectOption("ui-fixture-model");
  await page
    .getByRole("button", { name: "حفظ نموذج ChatGPT", exact: true })
    .click();
  await page.waitForTimeout(150);
  const initial = await command({ op: "snapshot" });
  assert.equal(initial.providers.chatgpt.model, "ui-fixture-model");
  assert.equal(initial.providers.chatgpt.configured, true);
  checks.push("Settings discovers and persists the actual returned model");
  assert.ok(!JSON.stringify(initial).includes("ui_fixture_access"));
  assert.ok(!JSON.stringify(initial).includes("ui_fixture_refresh"));
  const authDir = path.join(dir, "data", "chatgpt-subscription");
  const saved = await Promise.all(
    (await readdir(authDir))
      .filter((x) => x.endsWith(".json"))
      .map((x) => readFile(path.join(authDir, x), "utf8")),
  );
  assert.ok(saved.length);
  assert.ok(
    saved.every(
      (x) =>
        !x.includes("ui_fixture_access") && !x.includes("ui_fixture_refresh"),
    ),
  );
  checks.push(
    "Windows safeStorage encrypts credential file and renderer snapshot exposes no tokens",
  );
  await command({
    op: "engine.mode",
    mode: "Running",
    epoch: initial.engine.epoch,
  });
  await page.getByRole("button", { name: "المحادثة", exact: true }).click();
  await page
    .getByLabel("خدمة المحادثة الجديدة", { exact: true })
    .selectOption("chatgpt");
  await page.getByRole("button", { name: "محادثة جديدة", exact: true }).click();
  await page
    .getByLabel("رسالتك", { exact: true })
    .fill("Synthetic native test");
  await page
    .getByRole("button", { name: "إرسال الرسالة", exact: true })
    .click();
  await page.getByText("Synthetic subscription", { exact: true }).waitFor();
  assert.ok(await page.locator('[data-chat-status="pending"]').count());
  checks.push(
    "Text appears in renderer while subscription response is still streaming",
  );
  await page
    .getByText("Synthetic subscription response", { exact: true })
    .waitFor();
  await page.waitForTimeout(150);
  const counts = await app.evaluate(() => ({
    requests: globalThis.__siwcTest.requests,
    paidRequests: globalThis.__siwcTest.paidRequests,
  }));
  assert.equal(counts.requests, 1);
  assert.equal(counts.paidRequests, 0);
  checks.push(
    "Conversation uses only the SIWC credential and never sends a paid-key request",
  );
  await app.close();
  app = null;
  await launch();
  const restored = await command({ op: "snapshot" });
  assert.equal(restored.chatgpt.sharing, true);
  assert.equal(restored.providers.chatgpt.model, "ui-fixture-model");
  assert.equal(restored.chats[0].provider, "chatgpt");
  checks.push(
    "Native restart restores encrypted session, selected model and conversation",
  );
  assert.deepEqual(errors, []);
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/siwc-settings.png" });
  await writeFile(
    "docs/validation/siwc-desktop.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        liveOAuth: false,
        remoteTransport:
          "Controlled official endpoint responses; real DevKit, Electron, Windows encryption, IPC, SQLite and loopback",
        checks,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks, errors }));
} catch (e) {
  console.log(JSON.stringify({ checks, errors, error: e.message }));
  if (page) console.log((await page.locator("body").innerText()).slice(-2200));
  throw e;
} finally {
  if (app) await app.close();
  await rm(dir, { recursive: true, force: true });
}
