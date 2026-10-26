import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";
import { mkdir, readdir, rm } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";
import { join } from "node:path";
import { z } from "zod";
import {
  validateProjectArchives,
  restoreProjectFiles,
  type ProjectArchive,
} from "./project-archive.ts";
import {
  triggerSchema,
  taskExtras,
  workflowStep,
  retryPolicySchema,
  projectDetails,
} from "../contracts.ts";
import { Store, type Table } from "./store.ts";
import { safeSegments } from "./workspace.ts";
const TABLES: Table[] = [
  "projects",
  "notes",
  "tasks",
  "jobs",
  "inbox",
  "chats",
  "memories",
];
const MAGIC = Buffer.from("BADAWI01");
export const BACKUP_MAX = 64 * 1024 * 1024;
const MAX = BACKUP_MAX;
export function encryptBackup(plain: Buffer, key: Buffer, id: string) {
  if (key.length !== 32 || plain.length > MAX) throw Error("BACKUP_LIMIT");
  const zipped = gzipSync(plain, { level: 6 });
  const compressed = zipped.length + 32 < plain.length;
  const payload = compressed ? zipped : plain;
  const header = Buffer.from(
    JSON.stringify({
      format: 1,
      id,
      size: plain.length,
      ...(compressed ? { compression: "gzip" } : {}),
      sha256: createHash("sha256").update(plain).digest("hex"),
    }),
  );
  const size = Buffer.alloc(4);
  size.writeUInt32BE(header.length);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(header);
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  return Buffer.concat([
    MAGIC,
    size,
    header,
    iv,
    cipher.getAuthTag(),
    encrypted,
  ]);
}
export function decryptBackup(artifact: Buffer, key: Buffer) {
  try {
    if (
      artifact.length > MAX + 4096 ||
      artifact.length < 60 ||
      !artifact.subarray(0, 8).equals(MAGIC)
    )
      throw Error();
    const length = artifact.readUInt32BE(8);
    if (length > 2048 || length < 1) throw Error();
    const at = 12 + length;
    const header = artifact.subarray(12, at);
    const meta = JSON.parse(header.toString());
    if (
      meta.format !== 1 ||
      !Number.isSafeInteger(meta.size) ||
      meta.size < 0 ||
      meta.size > MAX ||
      (meta.compression !== undefined && meta.compression !== "gzip")
    )
      throw Error();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      artifact.subarray(at, at + 12),
    );
    decipher.setAAD(header);
    decipher.setAuthTag(artifact.subarray(at + 12, at + 28));
    const decrypted = Buffer.concat([
      decipher.update(artifact.subarray(at + 28)),
      decipher.final(),
    ]);
    const plain =
      meta.compression === "gzip"
        ? gunzipSync(decrypted, { maxOutputLength: Math.max(meta.size, 1) })
        : decrypted;
    if (
      plain.length !== meta.size ||
      createHash("sha256").update(plain).digest("hex") !== meta.sha256
    )
      throw Error();
    return plain;
  } catch {
    throw Error("BACKUP_INTEGRITY");
  }
}
export function snapshotContentHash(plain: Buffer) {
  const data = JSON.parse(plain.toString("utf8"));
  // Snapshot creation and capture time describe the read, not changed content.
  // Record-level timestamps, grants, selections and every byte remain significant.
  const { createdAt, ...content } = data;
  content.archives = (content.archives || []).map(
    ({ capturedAt, ...archive }: any) => archive,
  );
  const stable = (value: any): any =>
    Array.isArray(value)
      ? value.map(stable)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((k) => [k, stable(value[k])]),
          )
        : value;
  return createHash("sha256")
    .update(JSON.stringify(stable(content)))
    .digest("hex");
}
export function snapshot(store: Store, archives: ProjectArchive[] = []) {
  // A read transaction yields a consistent logical SQLite snapshot. Credentials, root grants,
  // provider settings and absolute source paths are intentionally excluded.
  const data = store.transaction(() =>
    Object.fromEntries(
      TABLES.map((t) => [
        t,
        store.all(t).map((r) => {
          if (t === "projects") {
            const { root, workspaceRoot, projectsRoot, inboxRoot, ...safe } = r;
            return {
              ...safe,
              root: null,
              aiRead: false,
              backupFiles: false,
              monitor: false,
            };
          }
          if (t === "jobs") {
            const {
              grant,
              allowBackgroundAI,
              allowBackgroundIntegration,
              ...definition
            } = r;
            return {
              ...definition,
              steps: r.steps?.map(({ grant, ...step }: any) => step),
              enabled: false,
              nextDueAt: null,
            };
          }
          if (t === "chats")
            return {
              ...r,
              status: r.status === "pending" ? "interrupted" : r.status,
              messages: r.messages.map((m: any) =>
                m.status === "pending"
                  ? {
                      ...m,
                      status: "interrupted",
                      error: "OPERATION_UNCERTAIN",
                    }
                  : m,
              ),
            };
          return r;
        }),
      ]),
    ),
  );
  const bytes = Buffer.from(
    JSON.stringify({
      format: 3,
      archives,
      createdAt: new Date().toISOString(),
      tables: data,
    }),
  );
  if (bytes.length > MAX) throw Error("BACKUP_LIMIT");
  return bytes;
}
const base = {
  id: z.string().min(1).max(100),
  createdAt: z.string().max(50).optional(),
  updatedAt: z.string().max(50).optional(),
};
const title = z.string().min(1).max(160),
  body = z.string().max(100000);
const rowSchemas = {
  memories: z.object({ ...base, title, body: z.string().max(4000) }),
  projects: z.object({
    ...base,
    ...projectDetails,
    name: title,
    backupInclude: z.array(z.string().max(600)).max(100).optional(),
    backupExclude: z.array(z.string().max(600)).max(100).optional(),
    kind: z.enum(["workfiles"]).optional(),
    fileEntries: z
      .array(
        z.object({
          path: z.string().min(1).max(600),
          category: z.enum(["design", "document", "asset", "other"]),
          tags: z.array(z.string().max(50)).max(10),
          linkedProjectIds: z.array(z.string().max(100)).max(10),
        }),
      )
      .max(5000)
      .optional(),
    archived: z.boolean().default(false),
  }),
  notes: z.object({ ...base, title, body }),
  tasks: z.object({
    ...base,
    title,
    ...taskExtras,
    nextOccurrenceId: z.string().max(100).optional(),
    repeatFromId: z.string().max(100).optional(),
    seriesId: z.string().max(100).optional(),
    done: z.boolean(),
    projectId: z.string().max(100).nullable().optional(),
  }),
  jobs: z.object({
    ...base,
    name: title,
    kind: z.enum([
      "reminder",
      "report",
      "backup",
      "summary",
      "workflow",
      "briefing",
      "integration",
    ]),
    integration: z.enum(["github", "vercel", "railway"]).optional(),
    steps: z.array(workflowStep).max(8).optional(),
    provider: z.enum(["gemini", "openai", "chatgpt"]).optional(),
    noteIds: z.array(z.string().max(100)).min(1).max(10).optional(),
    trigger: triggerSchema,
    projectId: z.string().max(100).optional(),
    message: z.string().max(1000).optional(),
    missedPolicy: z.enum(["skip", "coalesceLatest"]),
    retry: retryPolicySchema.optional(),
    enabled: z.boolean(),
  }),
  inbox: z.object({
    ...base,
    title,
    body,
    provider: z.enum(["gemini", "openai", "chatgpt"]).optional(),
    model: z.string().max(120).optional(),
    noteIds: z.array(z.string().max(100)).max(10).optional(),
    usage: z
      .object({
        input: z.number().nonnegative(),
        output: z.number().nonnegative(),
        thought: z.number().nonnegative(),
      })
      .nullable()
      .optional(),
    evidence: z
      .union([
        z.object({
          type: z.literal("integration"),
          target: z.string().max(600).optional(),
          projectId: z.string().max(100),
          integration: z.enum(["github", "vercel", "railway"]),
          checkedAt: z.string().max(50),
          state: z.string().max(100),
          status: z.enum(["verified", "failed", "unverified", "needsReview"]),
          reference: z.string().max(300).nullable(),
        }),
        z.object({
          projectId: z.string().max(100),
          fileCount: z.number().nonnegative(),
          truncated: z.boolean(),
          readAt: z.string().max(50),
        }),
      ])
      .nullable()
      .optional(),
  }),
  chats: z.object({
    ...base,
    title,
    provider: z.enum(["gemini", "openai", "chatgpt"]),
    model: z.string().max(120),
    status: z.enum(["idle", "pending", "failed", "cancelled", "interrupted"]),
    messages: z
      .array(
        z.object({
          id: z.string().max(100),
          role: z.enum(["user", "assistant"]),
          text: body,
          payload: z.string().max(32000).optional(),
          sourceHash: z.string().max(64).optional(),
          noteId: z.string().max(100).optional(),
          projectId: z.string().max(100).optional(),
          filePath: z.string().max(600).optional(),
          status: z.enum([
            "complete",
            "pending",
            "failed",
            "cancelled",
            "interrupted",
          ]),
          createdAt: z.string().max(50),
          error: z
            .string()
            .regex(/^[A-Z][A-Z0-9_]{1,100}$/)
            .optional(),
          wire: z.array(z.json()).max(200).optional(),
          readProjects: z.array(z.string().max(100)).max(100).optional(),
          projectIds: z.array(z.string().max(100)).max(100).optional(),
          toolReceipts: z.array(z.json()).max(24).optional(),
          usage: z
            .object({
              input: z.number().nonnegative(),
              output: z.number().nonnegative(),
              thought: z.number().nonnegative(),
            })
            .nullable()
            .optional(),
        }),
      )
      .max(200),
  }),
};
export function validateSnapshot(plain: Buffer) {
  try {
    const data = JSON.parse(plain.toString("utf8"));
    if (
      ![1, 2, 3].includes(data.format) ||
      !data.tables ||
      Object.keys(data.tables).some((t) => !TABLES.includes(t as Table))
    )
      throw Error();
    const clean: Record<string, any[]> = {};
    for (const t of TABLES) {
      if (
        (t === "chats" && data.format === 1 && !data.tables.chats) ||
        (t === "memories" && !data.tables.memories)
      ) {
        clean[t] = [];
        continue;
      }
      if (!Array.isArray(data.tables[t]) || data.tables[t].length > 10000)
        throw Error();
      clean[t] = data.tables[t].map((row: unknown) =>
        rowSchemas[t as keyof typeof rowSchemas].parse(row),
      );
    }
    return {
      format: data.format,
      tables: clean,
      archives: validateProjectArchives(data.archives || []),
    };
  } catch {
    throw Error("BACKUP_SCHEMA");
  }
}
export async function restoreBytes(plain: Buffer, directory: string) {
  const data = validateSnapshot(plain);
  try {
    await mkdir(directory);
  } catch {
    throw Error("RESTORE_DESTINATION_MUST_BE_NEW");
  }
  let store: Store | undefined;
  try {
    store = new Store(join(directory, "badawi.db"));
    store.transaction(() => {
      for (const table of TABLES)
        for (const row of data.tables[table])
          store!.put(
            table,
            table === "jobs"
              ? { ...row, enabled: false, nextDueAt: null }
              : table === "projects"
                ? {
                    ...row,
                    root: null,
                    aiRead: false,
                    backupFiles: false,
                    monitor: false,
                  }
                : row,
          );
      store!.setting("engine", { mode: "Stop", gaming: false, epoch: 0 });
      store!.audit("backup.restored");
    });
    const check = store.db.prepare("PRAGMA integrity_check").get() as any;
    if (Object.values(check)[0] !== "ok") throw Error("RESTORE_INTEGRITY");
    await restoreProjectFiles(
      data.archives,
      directory,
      new Set(
        data.tables.projects
          .filter((p: any) => p.kind === "workfiles")
          .map((p: any) => p.id),
      ),
    );
    store.close();
    store = undefined;
    return {
      workspaces: data.archives
        .filter((p) =>
          data.tables.projects.some(
            (row: any) => row.id === p.id && row.kind === "workfiles",
          ),
        )
        .map((p) => ({
          projectId: p.id,
          directory: join(directory, "workspaces", p.id),
        })),
    };
  } catch (e) {
    store?.close();
    await rm(directory, { recursive: true, force: true });
    throw e;
  }
}
export async function restoreSelected(
  plain: Buffer,
  directory: string,
  selection: { projectId: string; path?: string },
) {
  const data = validateSnapshot(plain),
    project = data.archives.find((p) => p.id === selection.projectId);
  if (!project) throw Error("BACKUP_SELECTION_NOT_FOUND");
  const selected = selection.path ? safeSegments(selection.path).join("/") : "";
  const files = project.files.filter(
    (f) =>
      !selected || f.path === selected || f.path.startsWith(selected + "/"),
  );
  if (!files.length) throw Error("BACKUP_SELECTION_NOT_FOUND");
  try {
    await mkdir(directory);
  } catch {
    throw Error("RESTORE_DESTINATION_MUST_BE_NEW");
  }
  try {
    await restoreProjectFiles(
      [{ ...project, files }],
      directory,
      new Set(
        data.tables.projects
          .filter((p: any) => p.kind === "workfiles")
          .map((p: any) => p.id),
      ),
    );
    return {
      files: files.length,
      workspaces: data.tables.projects.some(
        (row: any) => row.id === project.id && row.kind === "workfiles",
      )
        ? [
            {
              projectId: project.id,
              directory: join(directory, "workspaces", project.id),
            },
          ]
        : [],
    };
  } catch (e) {
    await rm(directory, { recursive: true, force: true });
    throw e;
  }
}
export async function restoreSnapshot(store: Store, directory: string) {
  return restoreBytes(snapshot(store), directory);
}
