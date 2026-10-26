import { test } from "node:test";
import assert from "node:assert/strict";
import { listModels } from "../src/core/providers.ts";
test("provider model discovery uses its own credential header and returns names without secrets", async () => {
  let target = "",
    headers: any;
  const models = await listModels(
    "gemini",
    "PRIVATE_TEST_KEY",
    new AbortController().signal,
    async (u, i) => {
      target = String(u);
      headers = new Headers(i?.headers);
      return Response.json({
        models: [
          {
            name: "models/gemini-3.8-flash",
            supportedGenerationMethods: ["generateContent"],
          },
          {
            name: "models/embedding-001",
            supportedGenerationMethods: ["embedContent"],
          },
        ],
      });
    },
  );
  assert.ok(!target.includes("PRIVATE_TEST_KEY"));
  assert.equal(headers.get("x-goog-api-key"), "PRIVATE_TEST_KEY");
  assert.deepEqual(models, ["gemini-3.8-flash"]);
  let auth = "";
  await listModels(
    "openai",
    "SEPARATE_OPENAI_KEY",
    new AbortController().signal,
    async (u, i) => {
      assert.equal(String(u), "https://api.openai.com/v1/models");
      auth = new Headers(i?.headers).get("Authorization")!;
      return Response.json({
        data: [{ id: "gpt-fixture" }, { id: "text-embedding-fixture" }],
      });
    },
  );
  assert.equal(auth, "Bearer SEPARATE_OPENAI_KEY");
});
