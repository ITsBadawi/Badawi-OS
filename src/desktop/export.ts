import { open, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
/** Flush a separate file, then atomically replace the user-selected destination. */
export async function atomicExport(
  destination: string,
  contents: string,
  signal?: AbortSignal,
) {
  const target = path.resolve(destination);
  const parent = path.dirname(target);
  const temporary = path.join(parent, `.badawi-${randomUUID()}.tmp`);
  if (path.dirname(temporary) !== parent) throw Error("EXPORT_PATH_DENIED");
  let created = false;
  try {
    signal?.throwIfAborted();
    const file = await open(temporary, "wx", 0o600);
    created = true;
    try {
      await file.writeFile(contents, "utf8");
      await file.sync();
    } finally {
      await file.close();
    }
    signal?.throwIfAborted();
    await rename(temporary, target);
    created = false;
  } finally {
    if (created) await unlink(temporary).catch(() => {});
  }
}
