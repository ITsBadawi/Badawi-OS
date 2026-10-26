import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Store } from "../src/core/store.ts";
import { Drive } from "../src/core/drive.ts";
test("actual loopback OAuth listener rejects a wrong state, binds PKCE and closes after token exchange", async () => {
  const store = new Store(":memory:"),
    values = new Map<string, string>([
      ["drive.clientSecret", "fixture-secret"],
    ]);
  store.setting("drive.config", {
    clientId: "123-fixture.apps.googleusercontent.com",
  });
  let challenge = "",
    callback = "";
  const secrets = {
    get: (k: string) => values.get(k),
    set: (k: string, v: string) => {
      values.set(k, v);
    },
    remove: (k: string) => {
      values.delete(k);
    },
  };
  const drive = new Drive(
    store,
    secrets,
    "unused",
    async (raw) => {
      const u = new URL(raw);
      assert.equal(u.origin, "https://accounts.google.com");
      assert.equal(
        u.searchParams.get("scope"),
        "https://www.googleapis.com/auth/drive.file",
      );
      assert.equal(u.searchParams.get("code_challenge_method"), "S256");
      challenge = u.searchParams.get("code_challenge")!;
      callback = u.searchParams.get("redirect_uri")!;
      const wrong = await fetch(callback + "?state=wrong&code=fixture");
      assert.equal(wrong.status, 400);
      await wrong.text();
      const right = await fetch(
        callback +
          "?" +
          new URLSearchParams({
            state: u.searchParams.get("state")!,
            code: "fixture-code",
          }),
      );
      assert.equal(right.status, 200);
      await right.text();
    },
    async (url, init) => {
      if (String(url) === "https://oauth2.googleapis.com/token") {
        const body = new URLSearchParams(init!.body as URLSearchParams);
        assert.equal(body.get("code"), "fixture-code");
        assert.equal(body.get("redirect_uri"), callback);
        assert.equal(
          createHash("sha256")
            .update(body.get("code_verifier")!)
            .digest("base64url"),
          challenge,
        );
        return Response.json({
          access_token: "fixture-access",
          refresh_token: "fixture-refresh",
          expires_in: 3600,
        });
      }
      assert.equal(
        String(url),
        "https://www.googleapis.com/drive/v3/about?fields=user(permissionId)",
      );
      return Response.json({ user: { permissionId: "fixture-account" } });
    },
  );
  try {
    await drive.connect();
    assert.equal(store.setting("drive.account"), "fixture-account");
    assert.equal(
      JSON.parse(values.get("drive.tokens")!).refresh_token,
      "fixture-refresh",
    );
    await assert.rejects(fetch(callback));
    assert.equal(
      JSON.stringify(store.auditRows()).includes("fixture-refresh"),
      false,
    );
  } finally {
    store.close();
  }
});
