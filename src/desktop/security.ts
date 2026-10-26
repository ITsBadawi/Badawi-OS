import path from "node:path";
import { fileURLToPath } from "node:url";
/** The renderer may load the shipped UI, never arbitrary device files. */
export function rendererAssetAllowed(url: string, uiDirectory: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "file:" || parsed.hostname) return false;
    const file = fileURLToPath(parsed);
    const relative = path.relative(
      path.resolve(uiDirectory),
      path.resolve(file),
    );
    return (
      !!relative && !relative.startsWith("..") && !path.isAbsolute(relative)
    );
  } catch {
    return false;
  }
}
