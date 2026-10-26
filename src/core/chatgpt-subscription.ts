import type { ChatGPTClient, SessionState } from "@siwc/local";
import type { ProviderRequest, Generation } from "./providers.ts";

function code(error: unknown): string {
  const c = String((error as any)?.code || "");
  if (/usage_limit|rate_limit/.test(c)) return "CHATGPT_USAGE_LIMIT";
  if (c === "cancelled") return "CHATGPT_CANCELLED";
  if (c === "revocation_failed") return "CHATGPT_REMOTE_DISCONNECT_UNCONFIRMED";
  if (c === "sharing_not_enabled") return "CHATGPT_SHARING_NOT_ENABLED";
  if (
    /sign_in_required|invalid_grant|invalid_refresh|token_expired|token_invalidated|token_reused|invalid_token|invalid_api_key/.test(
      c,
    )
  )
    return "CHATGPT_RECONNECT_REQUIRED";
  if (/not_eligible/.test(c)) return "CHATGPT_NOT_ELIGIBLE";
  if (/unsupported_capability|route_not_supported/.test(c))
    return "CHATGPT_UNSUPPORTED_CAPABILITY";
  if (/storage|encryption/.test(c)) return "CHATGPT_STORAGE_ERROR";
  if (c === "access_denied") return "CHATGPT_CANCELLED";
  return "CHATGPT_REQUEST_FAILED";
}
/** Trusted host only. The official SDK owns OAuth, refresh, encrypted disk
 * persistence and revocation. No token getter or general-purpose API proxy. */
export class ChatGPTSubscriptionProvider {
  private state: SessionState = { status: "disconnected", sharing: false };
  private lastError: string | undefined;
  constructor(
    private client: ChatGPTClient,
    private changed: () => void = () => {},
  ) {
    client.subscribe((s) => {
      this.state = s;
      this.lastError = s.error ? code(s.error) : undefined;
      this.changed();
    });
  }
  status() {
    return {
      status: this.state.status,
      sharing: this.state.sharing,
      identity: this.state.identity
        ? { name: this.state.identity.name, email: this.state.identity.email }
        : undefined,
      error: this.lastError,
    };
  }
  available() {
    return this.state.status === "connected" && this.state.sharing;
  }
  async restore() {
    this.state = await this.client.getSession();
    this.lastError = this.state.error ? code(this.state.error) : undefined;
    return this.status();
  }
  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      this.lastError = code(e);
      this.changed();
      throw Error(this.lastError);
    }
  }
  async connect(reconsent = false) {
    return this.call(async () => {
      await this.client.signIn({ reconsent });
      await this.restore();
      return this.status();
    });
  }
  cancel() {
    this.client.cancelSignIn();
  }
  async disconnect() {
    return this.call(async () => {
      try {
        await this.client.disconnect();
      } finally {
        await this.restore();
      }
      return this.status();
    });
  }
  async models(signal: AbortSignal) {
    return this.call(async () =>
      (await this.client.listModels({ signal })).map((m) => m.slug),
    );
  }
  async generate(
    req: ProviderRequest,
    signal: AbortSignal,
    onDelta?: (text: string) => void,
  ): Promise<Generation> {
    await this.restore();
    if (!this.available())
      throw Error(
        this.state.status === "connected"
          ? "CHATGPT_SHARING_NOT_ENABLED"
          : "CHATGPT_RECONNECT_REQUIRED",
      );
    if (
      !req.model ||
      req.prompt.length > 32000 ||
      JSON.stringify(req.history || []).length > 512000
    )
      throw Error("INVALID_AI_REQUEST");
    const input = [
      ...(req.history || []).map((m) => ({ role: m.role, content: m.text })),
      { role: "user" as const, content: req.prompt },
    ];
    // DevKit currently exposes text streaming, not max_output_tokens, usage,
    // structured-output schema, arbitrary tools or server-stored conversations.
    // Keep bounded app-side context and validate proposals after completion.
    const output = await this.call(() =>
      this.client.streamResponse({ model: req.model, input, signal, onDelta }),
    );
    this.lastError = undefined;
    return { text: output.text, model: req.model, usage: null, wire: [] };
  }
}
