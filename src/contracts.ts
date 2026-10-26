import { z } from "zod";
import { policyOperations } from "./core/tool-policy.ts";
const id = z.string().min(1).max(100);
const title = z.string().trim().min(1).max(160);
const text = z.string().max(100000);
export const retryPolicySchema = z
  .object({
    maxAttempts: z.number().int().min(2).max(3),
    delaySeconds: z.number().int().min(15).max(300),
  })
  .strict();
export const taskExtras = {
  acceptanceCriteria: z
    .array(
      z
        .object({
          id: z.string().min(1).max(100),
          text: z.string().trim().min(1).max(300),
          source: z.enum(["manual", "gitCommit", "ci", "deployment"]),
          target: z.string().trim().min(1).max(200).optional(),
        })
        .strict(),
    )
    .max(20)
    .refine(
      (items) => new Set(items.map((c) => c.id)).size === items.length,
      "Duplicate criterion IDs",
    )
    .optional(),
  evidenceCommit: z
    .string()
    .regex(/^[a-f0-9]{40,64}$/)
    .nullable()
    .optional(),
  deadlineFixed: z.boolean().optional(),
  confirmDeadlineChange: z.boolean().optional(),
  recurrence: z
    .object({
      frequency: z.enum(["daily", "weekly", "monthly"]),
      zone: z.string().min(1).max(80),
    })
    .strict()
    .nullable()
    .optional(),
  description: z.string().max(10000).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  status: z.enum(["todo", "doing", "done"]).optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  remindAt: z.string().datetime({ offset: true }).nullable().optional(),
  subtasks: z
    .array(
      z
        .object({
          id: z.string().max(100),
          title: z.string().min(1).max(160),
          done: z.boolean(),
        })
        .strict(),
    )
    .max(50)
    .optional(),
};
export const workflowStep = z
  .object({
    kind: z.enum([
      "reminder",
      "report",
      "summary",
      "backup",
      "briefing",
      "integration",
    ]),
    integration: z.enum(["github", "vercel", "railway"]).optional(),
    name: z.string().min(1).max(160),
    message: z.string().max(1000).optional(),
    projectId: id.optional(),
    noteIds: z.array(id).min(1).max(10).optional(),
    provider: z.enum(["gemini", "openai", "chatgpt"]).optional(),
  })
  .strict();
const provider = z.enum(["gemini", "openai", "chatgpt"]);
export const githubLink = z
  .object({
    owner: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/),
    repo: z.string().regex(/^[a-zA-Z0-9_.-]{1,100}$/),
    branch: z
      .string()
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9_./-]{0,150}$/)
      .optional(),
  })
  .strict();
export const vercelLink = z
  .object({
    projectId: z.string().regex(/^prj_[a-zA-Z0-9_]{1,80}$/),
    teamId: z
      .string()
      .regex(/^team_[a-zA-Z0-9_]{1,80}$/)
      .optional(),
    target: z.enum(["production", "preview"]),
  })
  .strict();
export const railwayLink = z
  .object({
    projectId: z.string().uuid(),
    serviceId: z.string().uuid(),
    environmentId: z.string().uuid(),
  })
  .strict();
export const deploymentLinks = z
  .object({
    vercel: vercelLink.nullable().optional(),
    railway: railwayLink.nullable().optional(),
  })
  .strict();
export const projectDetails = {
  deployments: deploymentLinks.optional(),
  description: z.string().max(5000).optional(),
  technologies: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  github: githubLink.nullable().optional(),
};
export const conditionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.enum(["tasks.overdue", "tasks.open"]),
      projectId: id.optional(),
      minCount: z.number().int().min(1).max(1000).default(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("backup.stale"),
      projectId: id.optional(),
      ageHours: z.number().int().min(1).max(8760),
    })
    .strict(),
]);
export const triggerSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("condition"),
      checkEveryMinutes: z.number().int().min(1).max(60),
      condition: conditionSchema,
    })
    .strict(),
  z.object({ type: z.literal("manual") }).strict(),
  z
    .object({
      type: z.literal("event"),
      event: z.enum([
        "task.completed",
        "note.saved",
        "project.added",
        "project.changed",
      ]),
      projectId: id.optional(),
    })
    .strict(),
  z.object({ type: z.literal("once"), at: z.string().max(40) }).strict(),
  z
    .object({
      type: z.enum(["daily", "weekly"]),
      time: z.string().max(5),
      zone: z.string().max(80),
      weekday: z.number().int().min(1).max(7).optional(),
    })
    .strict(),
]);
export const commandSchema = z.discriminatedUnion("op", [
  z
    .object({ op: z.literal("condition.preview"), condition: conditionSchema })
    .strict(),
  z
    .object({
      op: z.literal("deployment.check"),
      projectId: id,
      provider: z.enum(["vercel", "railway"]),
    })
    .strict(),
  z
    .object({
      op: z.literal("report.read"),
      days: z.number().int().min(1).max(365),
      projectId: id.optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal("report.export"),
      days: z.number().int().min(1).max(365),
      projectId: id.optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal("task.criteria.review"),
      id,
      criterionId: id,
      accepted: z.boolean(),
    })
    .strict(),
  z.object({ op: z.literal("task.verify"), id }).strict(),
  z
    .object({
      op: z.literal("project.clone.preview"),
      workspaceId: id,
      name: title,
      folder: z.string().min(1).max(100),
      github: githubLink,
    })
    .strict(),
  z
    .object({
      op: z.literal("project.clone.apply"),
      previewId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      op: z.literal("tool.policy.set"),
      tool: z.enum(policyOperations),
      policy: z.enum(["readOnly", "auto", "approval", "forbidden"]),
    })
    .strict(),
  z
    .object({
      op: z.literal("integration.save"),
      integration: z.enum(["github", "vercel", "railway"]),
      token: z.string().regex(/^[!-~]{1,1000}$/),
    })
    .strict(),
  z
    .object({
      op: z.literal("integration.disconnect"),
      integration: z.enum(["github", "vercel", "railway"]),
    })
    .strict(),
  z.object({ op: z.literal("github.check"), projectId: id }).strict(),
  z
    .object({
      op: z.literal("project.create"),
      workspaceId: id,
      name: title,
      folder: z.string().min(1).max(100),
    })
    .strict(),
  z
    .object({
      op: z.literal("project.details"),
      id,
      name: title,
      ...projectDetails,
    })
    .strict(),
  z.object({ op: z.literal("provider.default"), provider }).strict(),
  z
    .object({ op: z.literal("backup.protect"), id, protected: z.boolean() })
    .strict(),
  z
    .object({
      op: z.literal("backup.retention.save"),
      keepLatest: z.number().int().min(2).max(1000),
      olderThanDays: z.number().int().min(1).max(3650),
    })
    .strict(),
  z
    .object({ op: z.literal("backup.discard.preview"), id: z.string().uuid() })
    .strict(),
  z
    .object({
      op: z.literal("backup.discard.apply"),
      approvalId: z.string().uuid(),
    })
    .strict(),
  z.object({ op: z.literal("backup.retention.preview") }).strict(),
  z
    .object({
      op: z.literal("backup.retention.apply"),
      previewId: z.string().uuid(),
    })
    .strict(),
  z.object({ op: z.literal("drive.quota") }).strict(),
  z
    .object({
      op: z.literal("backup.expiry"),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable(),
    })
    .strict(),
  z
    .object({
      op: z.literal("project.backupScope"),
      id,
      includePaths: z.array(z.string().min(1).max(600)).max(100),
      excludePaths: z.array(z.string().min(1).max(600)).max(100),
    })
    .strict(),
  z
    .object({
      op: z.literal("backup.inspect"),
      fileId: z.string().regex(/^[\w-]{1,200}$/),
    })
    .strict(),
  z
    .object({
      op: z.literal("files.catalog.refresh"),
      projectIds: z.array(id).min(1).max(10),
    })
    .strict(),
  z
    .object({
      op: z.literal("files.catalog"),
      space: z.enum(["files", "projects", "all"]).optional(),
      projectId: id.optional(),
      mode: z.enum(["name", "content"]).optional(),
      query: z.string().min(1).max(200).optional(),
      extension: z
        .string()
        .regex(/^\.?[a-zA-Z0-9]{1,20}$/)
        .optional(),
      category: z
        .enum(["design", "document", "asset", "other", "unclassified"])
        .optional(),
      tag: z.string().min(1).max(50).optional(),
      linkedProjectId: id.optional(),
      inboxOnly: z.boolean().optional(),
      sourceOffset: z.number().int().min(0).max(100).optional(),
      offset: z.number().int().min(0).max(100000).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    })
    .strict(),
  z.object({ op: z.literal("files.index"), projectId: id }).strict(),
  z
    .object({
      op: z.literal("files.classify"),
      projectId: id,
      path: z.string().min(1).max(600),
      category: z.enum(["design", "document", "asset", "other"]),
      tags: z.array(z.string().trim().min(1).max(50)).max(10),
      linkedProjectIds: z.array(id).max(10),
    })
    .strict(),
  z
    .object({
      op: z.literal("workspace.create"),
      path: z.string().min(1).max(1000),
      inbox: z.boolean(),
    })
    .strict(),
  z
    .object({
      op: z.literal("files.change.preview"),
      projectId: id,
      kind: z.enum(["mkdir", "move"]),
      source: z.string().max(600).optional(),
      destination: z.string().min(1).max(600),
    })
    .strict(),
  z.object({ op: z.literal("files.change.apply"), approvalId: id }).strict(),
  z
    .object({ op: z.literal("chatgpt.connect"), reconsent: z.boolean() })
    .strict(),
  z.object({ op: z.literal("chatgpt.cancel") }).strict(),
  z.object({ op: z.literal("chatgpt.status") }).strict(),
  z.object({ op: z.literal("chatgpt.manage") }).strict(),
  z
    .object({
      op: z.literal("provider.models"),
      provider,
      key: z.string().min(1).max(500).optional(),
    })
    .strict(),
  z.object({ op: z.literal("provider.check"), provider }).strict(),
  z
    .object({
      op: z.literal("workspace.add"),
      path: z.string().min(1).max(1000),
      name: title.optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal("project.permissions"),
      id,
      aiRead: z.boolean(),
      backupFiles: z.boolean(),
      monitor: z.boolean(),
    })
    .strict(),
  z
    .object({
      op: z.literal("memory.save"),
      id: id.optional(),
      title,
      body: z.string().max(4000),
    })
    .strict(),
  z.object({ op: z.literal("memory.remove"), id }).strict(),
  z.object({ op: z.literal("assistant.execute"), planId: id }).strict(),
  z.object({ op: z.literal("assistant.dismiss"), planId: id }).strict(),
  z
    .object({
      op: z.literal("preferences.save"),
      notifications: z.boolean(),
      tray: z.boolean(),
      startup: z.boolean(),
    })
    .strict(),
  z
    .object({ op: z.literal("desktop.openFolder"), projectId: id.optional() })
    .strict(),
  z.object({ op: z.literal("desktop.install") }).strict(),
  z.object({ op: z.literal("desktop.update") }).strict(),
  z.object({ op: z.literal("notification.test") }).strict(),
  z
    .object({
      op: z.literal("chat.create"),
      provider,
      title: title.optional(),
      source: z
        .object({
          noteId: id.optional(),
          projectId: id.optional(),
          filePath: z.string().min(1).max(600).optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
  z.object({ op: z.literal("chat.read"), chatId: id }).strict(),
  z.object({ op: z.literal("chat.remove"), chatId: id }).strict(),
  z.object({ op: z.literal("chat.retry"), chatId: id }).strict(),
  z.object({ op: z.literal("chat.cancel"), chatId: id }).strict(),
  z.object({ op: z.literal("chat.draft"), chatId: id }).strict(),
  z
    .object({
      op: z.literal("chat.send"),
      chatId: id,
      text: z.string().trim().min(1).max(10000),
      noteId: id.optional(),
      projectId: id.optional(),
      filePath: z.string().min(1).max(600).optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal("task.list"),
      query: z.string().max(200).optional(),
      offset: z.number().int().min(0).max(10000).optional(),
    })
    .strict(),
  z.object({ op: z.literal("task.read"), id }).strict(),
  z.object({ op: z.literal("note.read"), id }).strict(),
  z.object({ op: z.literal("snapshot") }).strict(),
  z
    .object({
      op: z.literal("engine.mode"),
      mode: z.enum(["Running", "Pause", "Stop"]),
      epoch: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      op: z.literal("engine.gaming"),
      enabled: z.boolean(),
      epoch: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      op: z.literal("game.list.save"),
      names: z.array(z.string().max(100)).max(30),
    })
    .strict(),
  z.object({ op: z.literal("project.pick") }).strict(),
  z
    .object({ op: z.literal("project.archive"), id, archived: z.boolean() })
    .strict(),
  z.object({ op: z.literal("project.remove"), id }).strict(),
  z
    .object({
      op: z.literal("workspace.relink.preview"),
      id,
      path: z.string().min(1).max(1000),
    })
    .strict(),
  z
    .object({ op: z.literal("workspace.relink.apply"), approvalId: id })
    .strict(),
  z.object({ op: z.literal("project.relink"), id }).strict(),
  z.object({ op: z.literal("files.list"), projectId: id }).strict(),
  z
    .object({
      op: z.literal("files.preview"),
      catalogedAt: z.string().datetime().optional(),
      projectId: id,
      path: z.string().min(1).max(600),
    })
    .strict(),
  z
    .object({
      op: z.literal("files.export"),
      projectId: id,
      path: z.string().min(1).max(600),
    })
    .strict(),
  z
    .object({
      op: z.literal("files.search"),
      projectId: id,
      query: z.string().trim().min(1).max(200),
    })
    .strict(),
  z
    .object({
      op: z.literal("files.read"),
      projectId: id,
      path: z.string().min(1).max(600),
    })
    .strict(),
  z
    .object({
      op: z.literal("git.read"),
      projectId: id,
      tool: z.enum(["status", "log", "diff", "showText", "branches"]),
      revision: z.string().max(150).optional(),
      path: z.string().max(600).optional(),
    })
    .strict(),
  z.object({ op: z.literal("git.changes"), projectId: id }).strict(),
  z.object({ op: z.literal("git.selection.read"), projectId: id }).strict(),
  z.object({
    op: z.literal("git.selection.propose"), projectId: id,
    head: z.string().regex(/^[a-f0-9]{40,64}$/).nullable(),
    statusHash: z.string().regex(/^[a-f0-9]{64}$/),
    paths: z.array(z.string().min(1).max(600)).min(1).max(100).refine((items) => new Set(items).size === items.length),
    explanation: z.string().trim().min(1).max(1000),
  }).strict(),
  z.object({
    op: z.literal("git.commit.preview"), projectId: id,
    paths: z.array(z.string().min(1).max(600)).min(1).max(100),
    message: z.string().trim().min(1).max(160),
    authorName: z.string().trim().min(1).max(100).optional(),
    authorEmail: z.string().trim().min(1).max(160).optional(),
  }).strict(),
  z.object({ op: z.literal("git.commit.apply"), previewId: z.string().uuid() }).strict(),
  z.object({ op: z.literal("git.push.preview"), projectId: id }).strict(),
  z.object({ op: z.literal("git.push.apply"), previewId: z.string().uuid() }).strict(),
  z
    .object({
      op: z.literal("note.save"),
      id: id.optional(),
      title,
      body: text,
    })
    .strict(),
  z.object({ op: z.literal("note.remove"), id }).strict(),
  z
    .object({
      op: z.literal("task.save"),
      id: id.optional(),
      title,
      done: z.boolean(),
      ...taskExtras,
      projectId: id.nullable().optional(),
    })
    .strict(),
  z
    .object({ op: z.literal("language.save"), language: z.enum(["ar", "en"]) })
    .strict(),
  z.object({ op: z.literal("task.remove"), id }).strict(),
  z
    .object({
      op: z.literal("job.save"),
      id: id.optional(),
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
      steps: z.array(workflowStep).min(1).max(8).optional(),
      provider: provider.optional(),
      noteIds: z.array(id).min(1).max(10).optional(),
      allowBackgroundAI: z.boolean().optional(),
      allowBackgroundIntegration: z.boolean().optional(),
      integration: z.enum(["github", "vercel", "railway"]).optional(),
      projectId: id.optional(),
      message: z.string().max(1000).optional(),
      trigger: triggerSchema,
      enabled: z.boolean(),
      missedPolicy: z.enum(["skip", "coalesceLatest"]),
      retry: retryPolicySchema.optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal("dashboard.context"),
      mode: z.enum(["today", "project", "review"]),
      projectId: id.optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal("dashboard.pin"),
      type: z.enum(["task", "project", "note", "job"]),
      id,
      pinned: z.boolean(),
    })
    .strict(),
  z.object({ op: z.literal("job.remove"), id }).strict(),
  z
    .object({
      op: z.literal("job.run"),
      id,
      confirmReplay: z.boolean().optional(),
    })
    .strict(),
  z.object({ op: z.literal("workflow.recovery.preview"), runId: id }).strict(),
  z
    .object({
      op: z.literal("workflow.recovery.apply"),
      approvalId: id,
      acknowledgeUncertain: z.boolean(),
    })
    .strict(),
  z
    .object({ op: z.literal("schedule.preview"), trigger: triggerSchema })
    .strict(),
  z.object({ op: z.literal("run.cancel"), id }).strict(),
  z.object({ op: z.literal("run.resume"), id }).strict(),
  z
    .object({
      op: z.literal("provider.save"),
      provider,
      model: z.string().regex(/^[\w.\-:/]{1,120}$/),
      key: z.string().max(1000).optional(),
      maxTokens: z.number().int().min(128).max(4096),
      maxRequests: z.number().int().min(1).max(100),
      budget: z
        .object({
          dailyUSD: z.number().finite().positive().max(1000),
          inputPerMillion: z.number().finite().nonnegative().max(1000),
          outputPerMillion: z.number().finite().nonnegative().max(1000),
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        })
        .strict()
        .nullable()
        .optional(),
    })
    .strict(),
  z.object({ op: z.literal("provider.disconnect"), provider }).strict(),
  z
    .object({
      op: z.literal("ai.preview"),
      provider,
      noteId: id.optional(),
      prompt: z.string().trim().min(1).max(10000),
    })
    .strict(),
  z.object({ op: z.literal("ai.confirm"), approvalId: id }).strict(),
  z.object({ op: z.literal("inbox.remove"), id }).strict(),
  z
    .object({ op: z.literal("theme.set"), theme: z.enum(["light", "dark"]) })
    .strict(),
  z.object({ op: z.literal("audit.export") }).strict(),
  z
    .object({
      op: z.literal("drive.setup"),
      clientId: z.string().regex(/^[\w-]+\.apps\.googleusercontent\.com$/),
      clientSecret: z.string().max(300),
    })
    .strict(),
  z.object({ op: z.literal("drive.connect") }).strict(),
  z.object({ op: z.literal("drive.importClient") }).strict(),
  z.object({ op: z.literal("drive.disconnect") }).strict(),
  z.object({ op: z.literal("backup.keyExport") }).strict(),
  z.object({ op: z.literal("backup.keyImport") }).strict(),
  z
    .object({
      op: z.literal("backup.run"),
      projectIds: z.array(id).min(1).max(100).optional(),
    })
    .strict(),
  z.object({ op: z.literal("backup.list") }).strict(),
  z
    .object({
      op: z.literal("backup.restore"),
      fileId: z.string().regex(/^[\w-]{1,200}$/),
      selection: z
        .object({ projectId: id, path: z.string().min(1).max(600).optional() })
        .strict()
        .optional(),
    })
    .strict(),
]);
export const envelopeSchema = z
  .object({ requestId: z.string().uuid(), command: commandSchema })
  .strict();
export type Command = z.infer<typeof commandSchema>;
export type AppSnapshot = {
  toolPolicies: {
    op: string;
    policy: "readOnly" | "auto" | "approval" | "forbidden";
    automaticAllowed: boolean;
    locked: boolean;
  }[];
  integrations: Record<
    "github" | "vercel" | "railway",
    { configured: boolean }
  >;
  defaultProvider: "gemini" | "openai" | "chatgpt";
  engine: {
    mode: "Running" | "Pause" | "Stop";
    gaming: boolean;
    gamingManual: boolean;
    gamingAutomatic: boolean;
    epoch: number;
    active: number;
    effective: string;
    gamingQuiescing: boolean;
    settlingUntil: number;
  };
  gameDetection: { names: string[]; supported: boolean };
  projects: any[];
  notes: any[];
  tasks: any[];
  jobs: any[];
  runs: any[];
  inbox: any[];
  backups: any[];
  audit: any[];
  auditValid: boolean;
  theme: "light" | "dark";
  providers: Record<
    "gemini" | "openai" | "chatgpt",
    {
      model: string;
      configured: boolean;
      maxTokens: number;
      maxRequests: number;
      usedToday: number;
      verified: { model: string; at: string } | null;
      budget: {
        dailyUSD: number;
        inputPerMillion: number;
        outputPerMillion: number;
        date: string;
      } | null;
      budgetUsage: { heldUSD: number; spentUSD: number };
    }
  >;
  drive: {
    retention?: { keepLatest: number; olderThanDays: number };
    quota?: {
      limit: number | null;
      used: number;
      available: number | null;
      driveUsed: number | null;
      checkedAt: string;
    } | null;
    planExpiry?: string | null;
    configured: boolean;
    connected: boolean;
    keyReady: boolean;
    keyExported: boolean;
  };
  chatgpt?: {
    status: string;
    sharing: boolean;
    identity?: { name?: string; email?: string };
    error?: string;
  };
  version: string;
  language: "ar" | "en";
  chats: any[];
  plans: any[];
  memories: any[];
  preferences: { notifications: boolean; tray: boolean; startup: boolean };
  dashboard: ReturnType<typeof import("./core/dashboard.ts").dashboardView>;
};
export type Reply = { ok: true; data: any } | { ok: false; error: string };
export interface Bridge {
  command(command: Command): Promise<Reply>;
  subscribe(callback: () => void): () => void;
  onNavigate?: (callback: (page: string) => void) => () => void;
}
declare global {
  interface Window {
    badawi: Bridge;
  }
}
