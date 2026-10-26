import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gitExecutable } from "../src/core/git.ts";
import { inspectCommit, applyCommit, listChanges, inspectPush } from "../src/core/git-publishing.ts";
import { Store } from "../src/core/store.ts";
import { Service } from "../src/core/service.ts";

test("a reviewed commit contains only selected changed files and leaves other work untouched", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "badawi-git-publish-"));
  const git = (args: string[]) =>
    execFileSync(gitExecutable(), args, { cwd: root, encoding: "utf8" }).trim();
  try {
    git(["init", "-b", "main"]);
    git(["config", "user.name", "Badawi Test"]);
    git(["config", "user.email", "badawi@example.invalid"]);
    await writeFile(path.join(root, "chosen.txt"), "one\n");
    await writeFile(path.join(root, "other.txt"), "one\n");
    git(["add", "--", "chosen.txt", "other.txt"]);
    git(["commit", "-m", "Initial"]);
    await writeFile(path.join(root, "chosen.txt"), "two\n");
    await writeFile(path.join(root, "other.txt"), "two\n");
    await writeFile(path.join(root, "fresh.txt"), "new\n");
    const signal = new AbortController().signal;
    const preview = await inspectCommit(root, ["chosen.txt", "fresh.txt"], "Selected work", signal);
    assert.deepEqual(preview.selected, ["chosen.txt", "fresh.txt"]);
    const result = await applyCommit(root, preview, signal);
    assert.match(result.head, /^[a-f0-9]{40}$/);
    assert.deepEqual(git(["show", "--pretty=format:", "--name-only", "HEAD"]).split(/\r?\n/).filter(Boolean).sort(), ["chosen.txt", "fresh.txt"]);
    assert.equal(await readFile(path.join(root, "other.txt"), "utf8"), "two\n");
    assert.match(git(["status", "--porcelain"]), /other\.txt/);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});

test("an initialized empty repository can create its first reviewed commit and preview its first push", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "badawi-empty-git-"));
  const git = (args: string[]) => execFileSync(gitExecutable(), args, { cwd: root, encoding: "utf8" }).trim();
  try {
    git(["init", "-b", "main"]);
    await writeFile(path.join(root, "first.txt"), "first\n");
    const signal = new AbortController().signal;
    const preview = await inspectCommit(root, ["first.txt"], "First commit", signal, { name: "Badawi Test", email: "badawi@example.invalid" });
    assert.equal(preview.head, null);
    const committed = await applyCommit(root, preview, signal);
    assert.match(committed.head, /^[a-f0-9]{40}$/);
    assert.equal(committed.previousHead, null);
    const push = await inspectPush(root, "main", null, signal);
    assert.equal(push.remoteHead, null);
    assert.equal(push.localHead, committed.head);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});

test("owner commands use one-time review; project and credential changes invalidate Git publishing", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "badawi-git-publish-"));
  const git = (args: string[]) => execFileSync(gitExecutable(), args, { cwd: root, encoding: "utf8" }).trim();
  const store = new Store(":memory:");
  const secrets = new Map([["integration.github", "test-token"]]);
  const service = new Service(store, {
    pickProject: async () => null, saveText: async () => false,
    pickKey: async () => null, pickRestoreDirectory: async () => null,
    openAuth: async () => {},
    secrets: { get: (key) => secrets.get(key), set: (key, value) => { secrets.set(key, value); }, remove: (key) => { secrets.delete(key); } },
  }, path.join(root, "stage"), async (url) => {
    const target = String(url);
    if (target.includes("/compare/")) return Response.json({ message: "not found" }, { status: 404 });
    return Response.json(target.includes("/commits/") ? { sha: remoteHead } : {
      id: 42, private: true, archived: false, default_branch: "main", size: 1,
    });
  });
  let remoteHead = "";
  try {
    git(["init", "-b", "main"]);
    git(["config", "user.name", "Badawi Test"]);
    git(["config", "user.email", "badawi@example.invalid"]);
    await writeFile(path.join(root, "a.txt"), "one");
    git(["add", "a.txt"]);
    git(["commit", "-m", "Initial"]);
    remoteHead = git(["rev-parse", "HEAD"]);
    const project = store.put("projects", { name: "Publish test", root, github: { owner: "owner", repo: "repo", branch: "main" }, archived: false });
    await service.command({ op: "engine.mode", mode: "Running", epoch: service.snapshot().engine.epoch });
    await writeFile(path.join(root, "a.txt"), "two");
    const preview = await service.command({ op: "git.commit.preview", projectId: project.id, paths: ["a.txt"], message: "Changed a" });
    store.put("projects", { ...project, github: { owner: "other", repo: "repo", branch: "main" } });
    await assert.rejects(service.command({ op: "git.commit.apply", previewId: preview.previewId }), /GIT_PREVIEW_STALE/);
    store.put("projects", project);
    const second = await service.command({ op: "git.commit.preview", projectId: project.id, paths: ["a.txt"], message: "Changed a" });
    const committed = await service.command({ op: "git.commit.apply", previewId: second.previewId });
    assert.match(committed.head, /^[a-f0-9]{40}$/);
    await assert.rejects(service.command({ op: "git.commit.apply", previewId: second.previewId }), /GIT_PREVIEW_STALE/);
    const push = await service.command({ op: "git.push.preview", projectId: project.id });
    assert.equal(push.localHead, committed.head);
    assert.equal(push.remoteHead, remoteHead);
    secrets.set("integration.github", "replaced-token");
    await assert.rejects(service.command({ op: "git.push.apply", previewId: push.previewId }), /GIT_PREVIEW_STALE/);
    assert.equal(remoteHead, git(["rev-parse", "HEAD~1"]));
    await writeFile(path.join(root, "a.txt"), "three");
    await writeFile(path.join(root, ".env.local"), "secret");
    const observation = await service.command({ op: "git.changes", projectId: project.id });
    assert.match(observation.statusHash, /^[a-f0-9]{64}$/);
    const proposal = { op: "git.selection.propose" as const, projectId: project.id, head: observation.head, statusHash: observation.statusHash, paths: ["a.txt"], explanation: "Include the requested source file only" };
    assert.equal(service.assistant.validate(proposal).op, "git.selection.propose");
    await assert.rejects(service.command({ ...proposal, paths: [".env.local"] }), /GIT_PATH_DENIED/);
    await assert.rejects(service.command({ ...proposal, statusHash: "0".repeat(64) }), /GIT_PREVIEW_STALE/);
    const selected = await service.command(proposal);
    assert.deepEqual(selected.paths, ["a.txt"]);
    assert.deepEqual((await service.command({ op: "git.selection.read", projectId: project.id })).proposal.paths, ["a.txt"]);
    await writeFile(path.join(root, "a.txt"), "four");
    assert.deepEqual(await service.command({ op: "git.selection.read", projectId: project.id }), { proposal: null });
  } finally {
    service.close(); store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("commit review rejects changed bytes, pre-staged files and secret names", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "badawi-git-publish-"));
  const git = (args: string[]) => execFileSync(gitExecutable(), args, { cwd: root, encoding: "utf8" }).trim();
  try {
    git(["init", "-b", "main"]);
    git(["config", "user.name", "Badawi Test"]);
    git(["config", "user.email", "badawi@example.invalid"]);
    await writeFile(path.join(root, "a.txt"), "one");
    git(["add", "a.txt"]);
    git(["commit", "-m", "Initial"]);
    await writeFile(path.join(root, "a.txt"), "two");
    await writeFile(path.join(root, ".env.local"), "secret");
    const signal = new AbortController().signal;
    const changes = await listChanges(root, signal);
    assert.deepEqual(changes.changes.map(row => row.path).sort(), [".env.local", "a.txt"]);
    await assert.rejects(inspectCommit(root, [".env.local"], "Oops", signal), /GIT_PATH_DENIED/);
    const preview = await inspectCommit(root, ["a.txt"], "Safe", signal);
    await writeFile(path.join(root, "a.txt"), "three");
    await assert.rejects(applyCommit(root, preview, signal), /GIT_PREVIEW_STALE/);
    assert.equal(git(["rev-parse", "HEAD"]), preview.head);
    git(["add", "a.txt"]);
    await assert.rejects(listChanges(root, signal), /GIT_INDEX_NOT_CLEAN/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
