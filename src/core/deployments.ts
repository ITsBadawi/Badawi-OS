import { vercelLink, railwayLink } from "../contracts.ts";
import { boundedBody } from "./providers.ts";
import type { Evidence } from "./task-evidence.ts";
export type DeploymentProvider = "vercel" | "railway";
export type DeploymentReceipt = Evidence & {
  source: "deployment";
  provider: "Vercel" | "Railway";
  state: string;
  observedAt: string;
  commit: string | null;
  createdAt: string | null;
};
export class Deployments {
  constructor(
    private token: (p: DeploymentProvider) => string | undefined,
    private transport: typeof fetch = fetch,
  ) {}
  private async json(url: string, init: RequestInit, signal: AbortSignal) {
    signal.throwIfAborted();
    let response: Response;
    try {
      response = await this.transport(url, {
        ...init,
        redirect: "error",
        signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
      });
    } catch {
      signal.throwIfAborted();
      throw Error("DEPLOYMENT_NETWORK");
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw Error(
        response.status === 401
          ? "DEPLOYMENT_AUTH_INVALID"
          : response.status === 403
            ? "DEPLOYMENT_PERMISSION_DENIED"
            : response.status === 404
              ? "DEPLOYMENT_NOT_FOUND"
              : response.status === 429
                ? "DEPLOYMENT_RATE_LIMIT"
                : "DEPLOYMENT_REQUEST_FAILED",
      );
    }
    try {
      const result = JSON.parse(
        (await boundedBody(response, 1024 * 1024)).toString("utf8"),
      );
      signal.throwIfAborted();
      return result;
    } catch {
      signal.throwIfAborted();
      throw Error("DEPLOYMENT_RESPONSE_INVALID");
    }
  }
  async check(
    provider: DeploymentProvider,
    links: any,
    signal: AbortSignal,
    expectedCommit?: string,
  ): Promise<DeploymentReceipt> {
    signal.throwIfAborted();
    if (!links?.[provider]) throw Error("DEPLOYMENT_NOT_CONFIGURED");
    const parsed = (provider === "vercel" ? vercelLink : railwayLink).safeParse(
      links[provider],
    );
    if (!parsed.success) throw Error("DEPLOYMENT_LINK_INVALID");
    if (expectedCommit && !/^[a-f0-9]{40,64}$/.test(expectedCommit))
      throw Error("DEPLOYMENT_LINK_INVALID");
    const token = this.token(provider);
    if (!token) throw Error("DEPLOYMENT_NOT_CONNECTED");
    let reference: string | undefined,
      state = "NOT_FOUND",
      commit: string | null = null,
      createdAt: string | null = null;
    const asDate = (value: unknown) => {
      const n =
        typeof value === "number"
          ? value
          : typeof value === "string"
            ? Date.parse(value)
            : NaN;
      return Number.isFinite(n) && n >= 0 && n <= Date.now() + 300000
        ? new Date(n).toISOString()
        : null;
    };
    if (provider === "vercel") {
      const link = vercelLink.parse(parsed.data),
        headers = { Authorization: `Bearer ${token}` },
        query = new URLSearchParams({
          projectId: link.projectId,
          target: link.target,
          limit: "1",
          ...(link.teamId ? { teamId: link.teamId } : {}),
        });
      const body = await this.json(
        `https://api.vercel.com/v7/deployments?${query}`,
        { method: "GET", headers },
        signal,
      );
      if (!Array.isArray(body.deployments) || body.deployments.length > 1)
        throw Error("DEPLOYMENT_RESPONSE_INVALID");
      const item = body.deployments[0];
      if (item) {
        if (item.projectId !== link.projectId)
          throw Error("DEPLOYMENT_SCOPE_MISMATCH");
        if (
          typeof item.uid !== "string" ||
          !/^dpl_[a-zA-Z0-9_]{1,120}$/.test(item.uid)
        )
          throw Error("DEPLOYMENT_RESPONSE_INVALID");
        const detailQuery = new URLSearchParams({
          withGitRepoInfo: "true",
          ...(link.teamId ? { teamId: link.teamId } : {}),
        });
        const detail = await this.json(
          `https://api.vercel.com/v13/deployments/${encodeURIComponent(item.uid)}?${detailQuery}`,
          { method: "GET", headers },
          signal,
        );
        if (
          detail.id !== item.uid ||
          (detail.projectId && detail.projectId !== link.projectId)
        )
          throw Error("DEPLOYMENT_SCOPE_MISMATCH");
        const target = detail.target === null ? "preview" : detail.target;
        if (target !== link.target) throw Error("DEPLOYMENT_SCOPE_MISMATCH");
        reference = item.uid;
        state =
          typeof detail.readyState === "string" ? detail.readyState : "UNKNOWN";
        createdAt = asDate(detail.createdAt ?? item.created);
        const sha = detail.gitSource?.sha;
        commit =
          typeof sha === "string" && /^[a-f0-9]{40,64}$/.test(sha) ? sha : null;
      }
    } else {
      const link = railwayLink.parse(parsed.data),
        headers = {
          "Project-Access-Token": token,
          "Content-Type": "application/json",
        },
        url = "https://backboard.railway.com/graphql/v2";
      const post = async (query: string, variables: unknown) => {
        const body = await this.json(
          url,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ query, variables }),
          },
          signal,
        );
        if (body.errors?.length || !body.data)
          throw Error("DEPLOYMENT_QUERY_FAILED");
        return body.data;
      };
      const scope = await post(
        "query BadawiProjectScope { projectToken { projectId environmentId } }",
        {},
      );
      if (
        scope.projectToken?.projectId !== link.projectId ||
        scope.projectToken?.environmentId !== link.environmentId
      )
        throw Error("DEPLOYMENT_SCOPE_MISMATCH");
      const body = await post(
        "query BadawiDeploymentStatus($input: DeploymentListInput!, $first: Int) { deployments(input: $input, first: $first) { edges { node { id status createdAt } } } }",
        { input: link, first: 1 },
      );
      const edges = body.deployments?.edges;
      if (!Array.isArray(edges) || edges.length > 1)
        throw Error("DEPLOYMENT_RESPONSE_INVALID");
      const item = edges[0]?.node;
      if (item) {
        if (typeof item.id !== "string" || !/^[a-f0-9-]{36}$/i.test(item.id))
          throw Error("DEPLOYMENT_RESPONSE_INVALID");
        reference = item.id;
        state = typeof item.status === "string" ? item.status : "UNKNOWN";
        createdAt = asDate(item.createdAt);
      }
      // Railway documents meta as opaque JSON, not a stable commit schema. Never
      // manufacture a SHA match from an assumed metadata property.
    }
    signal.throwIfAborted();
    const knownStates =
      provider === "vercel"
        ? [
            "READY",
            "ERROR",
            "CANCELED",
            "BUILDING",
            "INITIALIZING",
            "QUEUED",
            "BLOCKED",
          ]
        : [
            "SUCCESS",
            "FAILED",
            "CRASHED",
            "REMOVED",
            "BUILDING",
            "DEPLOYING",
            "INITIALIZING",
            "WAITING",
            "QUEUED",
            "SLEEPING",
            "SKIPPED",
            "REMOVING",
          ];
    if (state !== "NOT_FOUND" && !knownStates.includes(state))
      state = "UNKNOWN";
    const ready = provider === "vercel" ? "READY" : "SUCCESS",
      failures =
        provider === "vercel"
          ? ["ERROR", "CANCELED"]
          : ["FAILED", "CRASHED", "REMOVED"];
    let status: Evidence["status"] =
      reference && state === ready
        ? "verified"
        : reference && failures.includes(state)
          ? "failed"
          : "unverified";
    let reason =
      state === "NOT_FOUND"
        ? "DEPLOYMENT_NOT_FOUND"
        : status === "verified"
          ? undefined
          : status === "failed"
            ? "DEPLOYMENT_FAILED"
            : "DEPLOYMENT_NOT_READY";
    if (status === "verified" && !createdAt) {
      status = "unverified";
      reason = "DEPLOYMENT_RESPONSE_INVALID";
    }
    if (status === "verified" && expectedCommit && commit !== expectedCommit) {
      status = "unverified";
      reason = commit
        ? "DEPLOYMENT_COMMIT_MISMATCH"
        : "DEPLOYMENT_COMMIT_UNAVAILABLE";
    }
    return {
      source: "deployment",
      provider: provider === "vercel" ? "Vercel" : "Railway",
      status,
      state,
      reference,
      commit,
      createdAt,
      observedAt: new Date().toISOString(),
      ...(reason ? { reason } : {}),
    };
  }
}
