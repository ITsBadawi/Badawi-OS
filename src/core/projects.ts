import { mkdir, rmdir } from "node:fs/promises";
import path from "node:path";
import { canonicalRoot, safeSegments } from "./workspace.ts";
export async function createEmptyProject(
  projectsRoot: string,
  folder: string,
  signal: AbortSignal,
) {
  const segments = safeSegments(folder);
  if (segments.length !== 1 || /[<>"|?*\x00-\x1f]/.test(folder))
    throw Error("PATH_DENIED");
  const root = await canonicalRoot(projectsRoot),
    destination = path.join(root, folder);
  signal.throwIfAborted();
  try {
    await mkdir(destination);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST")
      throw Error("DESTINATION_EXISTS");
    throw e;
  }
  try {
    signal.throwIfAborted();
    return await canonicalRoot(destination);
  } catch (e) {
    await rmdir(destination).catch(() => {});
    throw e;
  }
}
