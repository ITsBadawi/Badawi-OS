import { boundedBody } from "./providers.ts";
import type { Evidence } from "./task-evidence.ts";
export type GitHubLink = { owner: string; repo: string; branch?: string };
export class GitHub {
  constructor(
    private token: () => string | undefined,
    private transport: typeof fetch = fetch,
  ) {}
  private async get(path: string, signal: AbortSignal) {
    signal.throwIfAborted();
    const token = this.token();
    let response: Response;
    try {
      response = await this.transport("https://api.github.com" + path, {
        method: "GET",
        redirect: "error",
        signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2026-03-10",
          "User-Agent": "Badawi-OS",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
    } catch {
      signal.throwIfAborted();
      throw Error("GITHUB_NETWORK");
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw Error(
        response.status === 401
          ? "GITHUB_AUTH_INVALID"
          : response.status === 404
            ? "GITHUB_NOT_FOUND_OR_DENIED"
            : response.status === 409
              ? "GITHUB_EMPTY_REPOSITORY"
            : response.status === 403 || response.status === 429
              ? "GITHUB_RATE_OR_PERMISSION"
              : `GITHUB_HTTP_${response.status}`,
      );
    }
    try {
      return JSON.parse(
        (await boundedBody(response, 1024 * 1024)).toString("utf8"),
      );
    } catch {
      signal.throwIfAborted();
      throw Error("GITHUB_RESPONSE_INVALID");
    }
  }
  async workflowEvidence(
    link: GitHubLink,
    sha: string,
    target: string | undefined,
    signal: AbortSignal,
  ): Promise<Evidence> {
    if (
      !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(link.owner) ||
      !/^[a-zA-Z0-9_.-]{1,100}$/.test(link.repo) ||
      !/^[a-f0-9]{40,64}$/.test(sha) ||
      (target && target.length > 200)
    )
      throw Error("GITHUB_TARGET_INVALID");
    const data = await this.get(
      `/repos/${encodeURIComponent(link.owner)}/${encodeURIComponent(link.repo)}/actions/runs?${new URLSearchParams({ head_sha: sha, per_page: "100" })}`,
      signal,
    );
    if (
      !Array.isArray(data.workflow_runs) ||
      data.workflow_runs.length > 100 ||
      !Number.isSafeInteger(data.total_count) ||
      data.total_count < data.workflow_runs.length
    )
      throw Error("GITHUB_RESPONSE_INVALID");
    const base: Evidence = {
      source: "ci",
      provider: "GitHub Actions",
      status: "unverified",
      observedAt: new Date().toISOString(),
    };
    if (data.total_count > 100)
      return { ...base, reason: "CI_RESULTS_INCOMPLETE" };
    const runs = data.workflow_runs.filter(
      (r: any) =>
        r.head_sha === sha &&
        (!target ||
          r.name === target ||
          r.path === target ||
          (typeof r.path === "string" && r.path.endsWith("/" + target))),
    );
    if (!runs.length) return { ...base, reason: "CI_NOT_FOUND" };
    if (
      runs.some(
        (r: any) =>
          !Number.isSafeInteger(r.id) ||
          r.id < 1 ||
          !Number.isSafeInteger(r.workflow_id) ||
          r.workflow_id < 1,
      )
    )
      throw Error("GITHUB_RESPONSE_INVALID");
    const latest = new Map<number, any>();
    for (const r of runs.sort((a: any, b: any) => b.id - a.id))
      if (!latest.has(r.workflow_id)) latest.set(r.workflow_id, r);
    const selected = [...latest.values()],
      reference = `https://github.com/${link.owner}/${link.repo}/actions/runs/${selected[0].id}`;
    if (
      selected.some((r) =>
        [
          "failure",
          "cancelled",
          "timed_out",
          "action_required",
          "startup_failure",
          "stale",
        ].includes(r.conclusion),
      )
    )
      return { ...base, status: "failed", reference, reason: "CI_FAILED" };
    if (
      selected.some(
        (r) => r.status !== "completed" || r.conclusion !== "success",
      )
    )
      return { ...base, reference, reason: "CI_NOT_SUCCESSFUL" };
    signal.throwIfAborted();
    return { ...base, status: "verified", reference };
  }
  async check(
    link: GitHubLink,
    localHead: string | undefined,
    signal: AbortSignal,
  ) {
    if (
      !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(link.owner) ||
      !/^[a-zA-Z0-9_.-]{1,100}$/.test(link.repo) ||
      (link.branch &&
        (!/^[a-zA-Z0-9][a-zA-Z0-9_./-]{0,150}$/.test(link.branch) ||
          link.branch.includes(".."))) ||
      (localHead && !/^[a-f0-9]{40,64}$/.test(localHead))
    )
      throw Error("GITHUB_TARGET_INVALID");
    const target = `/repos/${encodeURIComponent(link.owner)}/${encodeURIComponent(link.repo)}`,
      repo = await this.get(target, signal);
    if (
      !Number.isSafeInteger(repo.id) ||
      typeof repo.default_branch !== "string" ||
      repo.default_branch.length > 151 ||
      typeof repo.private !== "boolean" ||
      typeof repo.archived !== "boolean"
    )
      throw Error("GITHUB_RESPONSE_INVALID");
    const branch = link.branch || repo.default_branch;
    let commit: any = null;
    try {
      commit = await this.get(
        `${target}/commits/${encodeURIComponent(branch)}`,
        signal,
      );
    } catch (error) {
      if ((error as Error).message !== "GITHUB_EMPTY_REPOSITORY" || repo.size !== 0)
        throw error;
    }
    if (commit && !/^[a-f0-9]{40,64}$/.test(commit.sha))
      throw Error("GITHUB_RESPONSE_INVALID");
    let comparison: {
      state: string;
      ahead: number | null;
      behind: number | null;
      reason?: string;
    } = {
      state: "unverified",
      ahead: null,
      behind: null,
      reason: commit ? "LOCAL_GIT_UNAVAILABLE" : "GITHUB_EMPTY_REPOSITORY",
    };
    if (commit && localHead === commit.sha)
      comparison = { state: "identical", ahead: 0, behind: 0 };
    else if (commit && localHead) {
      try {
        const c = await this.get(
          `${target}/compare/${commit.sha}...${localHead}?per_page=1`,
          signal,
        );
        if (
          !["ahead", "behind", "diverged", "identical"].includes(c.status) ||
          !Number.isSafeInteger(c.ahead_by) ||
          c.ahead_by < 0 ||
          !Number.isSafeInteger(c.behind_by) ||
          c.behind_by < 0
        )
          throw Error("GITHUB_RESPONSE_INVALID");
        comparison = {
          state: c.status,
          ahead: c.ahead_by,
          behind: c.behind_by,
        };
      } catch (e) {
        if ((e as Error).message !== "GITHUB_NOT_FOUND_OR_DENIED") throw e;
        comparison = {
          state: "unverified",
          ahead: null,
          behind: null,
          reason: "GITHUB_NOT_FOUND_OR_DENIED",
        };
      }
    }
    signal.throwIfAborted();
    return {
      owner: link.owner,
      repo: link.repo,
      branch,
      private: repo.private,
      archived: repo.archived,
      repositorySizeKB:
        Number.isSafeInteger(repo.size) && repo.size >= 0 ? repo.size : null,
      remoteHead: commit?.sha || null,
      localHead: localHead || null,
      comparison,
      pushedAt:
        typeof repo.pushed_at === "string" &&
        Number.isFinite(Date.parse(repo.pushed_at))
          ? repo.pushed_at
          : null,
      source: "GitHub REST API",
      checkedAt: new Date().toISOString(),
    };
  }
}
