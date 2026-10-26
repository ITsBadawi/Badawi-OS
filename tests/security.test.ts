import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { rendererAssetAllowed } from "../src/desktop/security.ts";
test("renderer assets are confined to the compiled UI directory, not arbitrary file URLs", () => {
  const root = path.resolve("dist");
  assert.equal(
    rendererAssetAllowed(
      pathToFileURL(path.join(root, "assets", "app.js")).href,
      root,
    ),
    true,
  );
  assert.equal(
    rendererAssetAllowed(
      pathToFileURL(path.join(root, "fonts", "font.ttf")).href,
      root,
    ),
    true,
  );
  assert.equal(
    rendererAssetAllowed(pathToFileURL(path.resolve(".env")).href, root),
    false,
  );
  assert.equal(
    rendererAssetAllowed(
      pathToFileURL(path.join(root, "../private.txt")).href,
      root,
    ),
    false,
  );
  assert.equal(
    rendererAssetAllowed("file://other-computer/share/private.txt", root),
    false,
  );
  assert.equal(
    rendererAssetAllowed("https://example.invalid/steal", root),
    false,
  );
  assert.equal(rendererAssetAllowed("data:text/html,script", root), false);
});
