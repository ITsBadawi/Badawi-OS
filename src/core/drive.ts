import { createServer } from "node:http";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, unlink, lstat } from "node:fs/promises";
import { join } from "node:path";
import { captureProjects } from "./project-archive.ts";
import { Store, type Row } from "./store.ts";
import { boundedBody } from "./providers.ts";
import {
  snapshot,
  snapshotContentHash,
  BACKUP_MAX,
  encryptBackup,
  decryptBackup,
  validateSnapshot,
} from "./backup.ts";
export interface Secrets {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  remove(key: string): void;
}
export class Drive {
  private discardPreviews = new Map<
    string,
    { backupId: string; fingerprint: string; expires: number }
  >();
  private retentionPreviews = new Map<
    string,
    { account: string; fingerprint: string; expires: number; items: Row[] }
  >();
  constructor(
    private store: Store,
    private secrets: Secrets,
    private staging: string,
    private openAuth: (url: string) => Promise<void>,
    private transport: typeof fetch = fetch,
  ) {}
  private async request(
    url: string,
    init: RequestInit = {},
    signal?: AbortSignal,
  ) {
    try {
      const response = await this.transport(url, {
        ...init,
        // Drive uses HTTP 308 as a resumable-upload receipt. Expose it without
        // following redirects or forwarding credentials to another destination.
        redirect: "manual",
        signal: AbortSignal.any([
          signal || new AbortController().signal,
          AbortSignal.timeout(30000),
        ]),
      });
      return response;
    } catch {
      signal?.throwIfAborted();
      throw Error("WAITING_NETWORK");
    }
  }
  private async json(
    url: string,
    init: RequestInit = {},
    signal?: AbortSignal,
  ) {
    const r = await this.request(url, init, signal);
    if (!r.ok) {
      await r.body?.cancel();
      throw Error(
        r.status === 401
          ? "DRIVE_AUTH_EXPIRED"
          : r.status === 403
            ? "DRIVE_PERMISSION_OR_QUOTA"
            : `DRIVE_HTTP_${r.status}`,
      );
    }
    return JSON.parse((await boundedBody(r)).toString());
  }
  private async token(signal?: AbortSignal) {
    const value = this.secrets.get("drive.tokens");
    if (!value) throw Error("DRIVE_NOT_CONNECTED");
    let token = JSON.parse(value);
    if (token.expiresAt > Date.now() + 60000) return token.access_token;
    const config = this.store.setting("drive.config");
    if (!config || !token.refresh_token) throw Error("DRIVE_RECONNECT");
    const fresh = await this.json(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: this.secrets.get("drive.clientSecret") || "",
          refresh_token: token.refresh_token,
          grant_type: "refresh_token",
        }),
      },
      signal,
    );
    token = {
      ...token,
      ...fresh,
      expiresAt: Date.now() + fresh.expires_in * 1000,
    };
    this.secrets.set("drive.tokens", JSON.stringify(token));
    return token.access_token;
  }
  private async headers(signal?: AbortSignal) {
    return { Authorization: `Bearer ${await this.token(signal)}` };
  }
  async connect() {
    const config = this.store.setting("drive.config");
    if (!config) throw Error("DRIVE_CONFIG_REQUIRED");
    const state = randomBytes(24).toString("base64url"),
      verifier = randomBytes(48).toString("base64url");
    let finish!: (code: string) => void, fail!: (error: Error) => void;
    const codePromise = new Promise<string>((r, j) => {
      finish = r;
      fail = j;
    });
    const server = createServer((req, res) => {
      const url = new URL(req.url || "", "http://127.0.0.1");
      if (
        req.method !== "GET" ||
        url.pathname !== "/oauth" ||
        url.searchParams.get("state") !== state
      ) {
        res.writeHead(400);
        res.end("Invalid OAuth response");
        return;
      }
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Badawi OS: You may close this window.");
      if (url.searchParams.get("error")) fail(Error("DRIVE_CONSENT_DENIED"));
      else if (url.searchParams.get("code"))
        finish(url.searchParams.get("code")!);
      else fail(Error("DRIVE_AUTH_INVALID"));
    });
    await new Promise<void>((r, j) => {
      server.once("error", j);
      server.listen(0, "127.0.0.1", r);
    });
    const port = (server.address() as { port: number }).port;
    const redirect = `http://127.0.0.1:${port}/oauth`;
    const timer = setTimeout(() => fail(Error("DRIVE_AUTH_TIMEOUT")), 180000);
    try {
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.search = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: redirect,
        response_type: "code",
        scope: "https://www.googleapis.com/auth/drive.file",
        state,
        code_challenge: createHash("sha256")
          .update(verifier)
          .digest("base64url"),
        code_challenge_method: "S256",
        access_type: "offline",
        prompt: "consent",
      }).toString();
      await this.openAuth(url.toString());
      const code = await codePromise;
      const tokens = await this.json("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: this.secrets.get("drive.clientSecret") || "",
          code,
          code_verifier: verifier,
          redirect_uri: redirect,
          grant_type: "authorization_code",
        }),
      });
      if (!tokens.access_token || !tokens.refresh_token)
        throw Error("DRIVE_AUTH_INVALID");
      const about = await this.json(
        "https://www.googleapis.com/drive/v3/about?fields=user(permissionId)",
        { headers: { Authorization: `Bearer ${tokens.access_token}` } },
      );
      const account = about.user?.permissionId;
      if (!account) throw Error("DRIVE_ACCOUNT_UNKNOWN");
      this.secrets.set(
        "drive.tokens",
        JSON.stringify({
          ...tokens,
          expiresAt: Date.now() + tokens.expires_in * 1000,
        }),
      );
      if (this.store.setting("drive.account") !== account) {
        this.store.setting("drive.quota", null);
        this.store.setting("drive.folder", null);
      }
      this.store.setting("drive.account", account);
      this.store.audit("drive.connected");
    } finally {
      clearTimeout(timer);
      server.closeAllConnections();
      server.close();
    }
  }
  async disconnect() {
    const token = this.secrets.get("drive.tokens");
    this.secrets.remove("drive.tokens");
    this.store.setting("drive.quota", null);
    this.store.setting("drive.folder", null);
    this.store.audit("drive.disconnected");
    if (token) {
      const t = JSON.parse(token);
      await this.request("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: t.refresh_token || t.access_token }),
      }).catch(() => {});
    }
  }
  async list(signal: AbortSignal) {
    const q =
      "trashed=false and appProperties has { key='badawiKind' and value='backup' }";
    const data = await this.json(
      `https://www.googleapis.com/drive/v3/files?${new URLSearchParams({ q, pageSize: "100", fields: "files(id,name,size,createdTime,appProperties),nextPageToken", orderBy: "createdTime desc" })}`,
      { headers: await this.headers(signal) },
      signal,
    );
    return { files: data.files || [], truncated: !!data.nextPageToken };
  }
  async quota(signal: AbortSignal) {
    const data = await this.json(
      "https://www.googleapis.com/drive/v3/about?fields=storageQuota",
      { headers: await this.headers(signal) },
      signal,
    );
    const numeric = (v: any) => {
      if (v === undefined) return null;
      const n = Number(v);
      if (!Number.isSafeInteger(n) || n < 0) throw Error("DRIVE_QUOTA_INVALID");
      return n;
    };
    const limit = numeric(data.storageQuota?.limit),
      used = numeric(data.storageQuota?.usage),
      driveUsed = numeric(data.storageQuota?.usageInDrive);
    if (used === null) throw Error("DRIVE_QUOTA_INVALID");
    return {
      limit,
      used,
      available: limit === null ? null : Math.max(0, limit - used),
      driveUsed,
    };
  }
  private retentionState() {
    const account = this.store.setting("drive.account");
    if (!account) throw Error("DRIVE_NOT_CONNECTED");
    const policy = this.store.setting(`backup.retention.${account}`) || {
      keepLatest: 10,
      olderThanDays: 30,
    };
    if (
      !Number.isInteger(policy.keepLatest) ||
      policy.keepLatest < 2 ||
      policy.keepLatest > 1000 ||
      !Number.isInteger(policy.olderThanDays) ||
      policy.olderThanDays < 1 ||
      policy.olderThanDays > 3650
    )
      throw Error("RETENTION_POLICY_INVALID");
    const rows = this.store
      .all("backups")
      .filter(
        (b) =>
          b.account === account &&
          b.status === "verified" &&
          b.remoteId &&
          b.md5 &&
          Number.isFinite(Date.parse(b.createdAt)),
      )
      .sort(
        (a, b) =>
          Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
          a.id.localeCompare(b.id),
      );
    const counts = new Map<string, number>(),
      kept: Row[] = [];
    const items = rows.filter((b) => {
      const scope = JSON.stringify([b.projectIds || null, b.keyHash || null]),
        count = (counts.get(scope) || 0) + 1;
      counts.set(scope, count);
      if (count <= policy.keepLatest) {
        kept.push(b);
        return false;
      }
      return (
        !b.protected &&
        Date.parse(b.createdAt) < Date.now() - policy.olderThanDays * 86400000
      );
    });
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          account,
          policy,
          rows: rows.map((b) => ({
            id: b.id,
            remoteId: b.remoteId,
            md5: b.md5,
            size: b.size,
            createdAt: b.createdAt,
            protected: !!b.protected,
            projectIds: b.projectIds || null,
            keyHash: b.keyHash || null,
          })),
        }),
      )
      .digest("hex");
    return { account, policy, items, fingerprint, kept };
  }
  async previewRetention(signal: AbortSignal) {
    signal.throwIfAborted();
    await this.token(signal);
    const { account, policy, items, fingerprint } = this.retentionState();
    if (items.length > 100) throw Error("RETENTION_BATCH_TOO_LARGE");
    for (const [id, p] of this.retentionPreviews)
      if (p.expires < Date.now()) this.retentionPreviews.delete(id);
    if (this.retentionPreviews.size >= 10)
      throw Error("RETENTION_PREVIEW_LIMIT");
    const previewId = randomUUID(),
      expires = Date.now() + 300000;
    this.retentionPreviews.set(previewId, {
      account,
      items,
      fingerprint,
      expires,
    });
    this.store.audit("backup.retentionPreview", {
      previewId,
      backupIds: items.map((b) => b.id),
    });
    return {
      previewId,
      expiresAt: new Date(expires).toISOString(),
      policy,
      items: items.map((b) => ({
        id: b.id,
        remoteId: b.remoteId,
        createdAt: b.createdAt,
        size: b.size,
      })),
    };
  }
  async applyRetention(
    previewId: string,
    signal: AbortSignal,
    onProgress: () => void,
  ) {
    const preview = this.retentionPreviews.get(previewId);
    this.retentionPreviews.delete(previewId);
    if (!preview || preview.expires < Date.now())
      throw Error("RETENTION_PREVIEW_EXPIRED");
    const check = () => {
      signal.throwIfAborted();
      const current = this.retentionState();
      if (
        current.account !== preview.account ||
        current.fingerprint !== preview.fingerprint
      )
        throw Error("RETENTION_STATE_CHANGED");
    };
    check();
    const metadata = async (b: Row) =>
      this.json(
        `https://www.googleapis.com/drive/v3/files/${b.remoteId}?fields=id,size,md5Checksum,appProperties,trashed`,
        { headers: await this.headers(signal) },
        signal,
      );
    const matches = (m: any, b: Row) =>
      m.id === b.remoteId &&
      m.appProperties?.badawiKind === "backup" &&
      m.appProperties?.backupId === b.id &&
      Number(m.size) === b.size &&
      m.md5Checksum === b.md5;
    // Refuse cleanup when retained copies have disappeared or changed remotely.
    for (const b of this.retentionState().kept) {
      const meta = await metadata(b);
      if (meta.trashed || !matches(meta, b))
        throw Error("BACKUP_REMOTE_CHANGED");
      check();
    }
    // Check the entire approved selection before the first mutation.
    for (const b of preview.items) {
      const meta = await metadata(b);
      if (meta.trashed || !matches(meta, b))
        throw Error("BACKUP_REMOTE_CHANGED");
      check();
    }
    const trashed: string[] = [];
    for (const b of preview.items) {
      signal.throwIfAborted();
      // Previous successful rows change the fingerprint. Recheck the remaining
      // candidates against a freshly calculated conservative retention policy.
      const current = this.retentionState();
      if (
        current.account !== preview.account ||
        !current.items.some((x) => x.id === b.id) ||
        this.store.get("backups", b.id)?.protected
      )
        throw Error("RETENTION_STATE_CHANGED");
      const meta = await metadata(b);
      if (meta.trashed || !matches(meta, b))
        throw Error("BACKUP_REMOTE_CHANGED");
      signal.throwIfAborted();
      await this.json(
        `https://www.googleapis.com/drive/v3/files/${b.remoteId}?fields=id,trashed`,
        {
          method: "PATCH",
          headers: {
            ...(await this.headers(signal)),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ trashed: true }),
        },
        signal,
      );
      const receipt = await metadata(b);
      if (!receipt.trashed || !matches(receipt, b))
        throw Error("RETENTION_RECEIPT_REQUIRED");
      this.store.put("backups", {
        ...this.store.get("backups", b.id),
        status: "trashed",
        trashedAt: new Date().toISOString(),
      });
      this.store.audit("backup.trashed", {
        backupId: b.id,
        remoteId: b.remoteId,
        previewId,
      });
      trashed.push(b.id);
      onProgress();
    }
    return { trashed, permanentDeletion: false };
  }
  async download(fileId: string, signal: AbortSignal) {
    if (!/^[\w-]{1,200}$/.test(fileId)) throw Error("DRIVE_FILE_DENIED");
    const meta = await this.json(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,size,appProperties`,
      { headers: await this.headers(signal) },
      signal,
    );
    if (
      meta.appProperties?.badawiKind !== "backup" ||
      Number(meta.size) > BACKUP_MAX + 4096
    )
      throw Error("DRIVE_FILE_DENIED");
    const r = await this.request(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: await this.headers(signal) },
      signal,
    );
    if (!r.ok) throw Error("DRIVE_DOWNLOAD_FAILED");
    return boundedBody(r, BACKUP_MAX + 4096);
  }
  private async reserveId(signal: AbortSignal) {
    return (
      await this.json(
        "https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive&type=files",
        { headers: await this.headers(signal) },
        signal,
      )
    ).ids[0] as string;
  }
  private async createKnown(id: string, metadata: any, signal: AbortSignal) {
    const headers = {
      ...(await this.headers(signal)),
      "Content-Type": "application/json",
    };
    const r = await this.request(
      "https://www.googleapis.com/drive/v3/files?fields=id",
      { method: "POST", headers, body: JSON.stringify({ ...metadata, id }) },
      signal,
    );
    if (r.ok) {
      await boundedBody(r);
      return;
    }
    if (r.status === 409) {
      await r.body?.cancel();
      return;
    }
    await r.body?.cancel();
    throw Error(`DRIVE_CREATE_${r.status}`);
  }
  private async folder(signal: AbortSignal) {
    let folder = this.store.setting("drive.folder");
    if (!folder) {
      folder = await this.reserveId(signal);
      this.store.setting("drive.folder", folder);
    }
    await this.createKnown(
      folder,
      {
        name: "Badawi OS backups",
        mimeType: "application/vnd.google-apps.folder",
        appProperties: { badawiKind: "folder" },
      },
      signal,
    );
    return folder;
  }
  private async discardState(id: string) {
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)
    )
      throw Error("BACKUP_DISCARD_DENIED");
    const item = this.store.get("backups", id);
    if (
      !item ||
      !["checkpointed", "prepared", "uploading", "verifying"].includes(
        item.status,
      )
    )
      throw Error("BACKUP_DISCARD_DENIED");
    const file = join(this.staging, `${id}.stage`);
    let stage: {
      size: number;
      hash: string;
      inode: number;
      device: number;
      mtime: number;
    } | null = null;
    try {
      const stat = await lstat(file);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.size > BACKUP_MAX + 4096
      )
        throw Error("BACKUP_STAGE_INTEGRITY");
      const bytes = await readFile(file);
      stage = {
        size: bytes.length,
        hash: createHash("sha256").update(bytes).digest("hex"),
        inode: stat.ino,
        device: stat.dev,
        mtime: stat.mtimeMs,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        throw Error("BACKUP_STAGE_INTEGRITY");
    }
    return {
      item,
      file,
      stage,
      fingerprint: createHash("sha256")
        .update(
          JSON.stringify({
            item,
            stage,
            account: this.store.setting("drive.account") || null,
          }),
        )
        .digest("hex"),
    };
  }
  async previewDiscard(id: string) {
    const state = await this.discardState(id),
      approvalId = randomUUID(),
      expires = Date.now() + 300000;
    for (const [key, value] of this.discardPreviews)
      if (value.expires < Date.now()) this.discardPreviews.delete(key);
    if (this.discardPreviews.size >= 10)
      this.discardPreviews.delete(this.discardPreviews.keys().next().value!);
    this.discardPreviews.set(approvalId, {
      backupId: id,
      fingerprint: state.fingerprint,
      expires,
    });
    return {
      approvalId,
      backupId: id,
      expiresAt: new Date(expires).toISOString(),
      stagePresent: !!state.stage,
      stageBytes: state.stage?.size || 0,
      createdAt: state.item.createdAt || null,
      offset: state.item.offset || 0,
      projectIds: state.item.projectIds || null,
      remoteMayExist: !!state.item.remoteId,
      currentAccount:
        state.item.account === this.store.setting("drive.account"),
    };
  }
  async discard(approvalId: string, signal?: AbortSignal) {
    const preview = this.discardPreviews.get(approvalId);
    this.discardPreviews.delete(approvalId);
    if (!preview || preview.expires < Date.now())
      throw Error("BACKUP_DISCARD_STALE");
    let state: Awaited<ReturnType<Drive["discardState"]>>;
    try {
      state = await this.discardState(preview.backupId);
    } catch {
      throw Error("BACKUP_DISCARD_STALE");
    }
    if (state.fingerprint !== preview.fingerprint)
      throw Error("BACKUP_DISCARD_STALE");
    signal?.throwIfAborted();
    if (state.stage) await unlink(state.file);
    this.secrets.remove(`upload.${state.item.id}`);
    this.store.put("backups", {
      ...state.item,
      status: "discarded",
      reason: "ownerDiscard",
      stageDiscardedAt: new Date().toISOString(),
    });
    this.store.audit("backup.localStageDiscarded", {
      backupId: state.item.id,
      stageBytes: state.stage?.size || 0,
      remoteMayExist: !!state.item.remoteId,
      cloudChanged: false,
    });
    return {
      backupId: state.item.id,
      localStageRemoved: true,
      cloudChanged: false,
    };
  }
  async backup(
    signal: AbortSignal,
    onProgress: () => void,
    projectIds?: string[],
  ) {
    const selection = projectIds ? [...new Set(projectIds)].sort() : null;
    if (
      selection?.some((id) => {
        const p = this.store.get("projects", id);
        return !p?.root || !p.backupFiles || p.archived;
      })
    )
      throw Error("BACKUP_SELECTION_DENIED");
    const scopeIdentity = JSON.stringify(selection);
    const grants = () =>
      createHash("sha256")
        .update(
          JSON.stringify(
            this.store
              .all("projects")
              .filter(
                (p) =>
                  p.root &&
                  p.backupFiles &&
                  !p.archived &&
                  (!selection || selection.includes(p.id)),
              )
              .sort((a, b) => a.id.localeCompare(b.id))
              .map((p) => [
                p.id,
                p.root,
                p.backupInclude || [],
                p.backupExclude || [],
              ]),
          ),
        )
        .digest("hex");
    const secret = this.secrets.get("backup.key");
    if (!secret || !this.store.setting("backup.keyExported"))
      throw Error("RECOVERY_KEY_REQUIRED");
    const key = Buffer.from(secret, "base64");
    const account = this.store.setting("drive.account");
    if (!account) throw Error("DRIVE_NOT_CONNECTED");
    await mkdir(this.staging, { recursive: true });
    let item = this.store
      .all("backups")
      .find(
        (b) =>
          b.account === account &&
          JSON.stringify(b.projectIds || null) === scopeIdentity &&
          ["checkpointed", "uploading", "verifying", "prepared"].includes(
            b.status,
          ),
      );
    let artifact: Buffer;
    if (item) {
      if (!item.grantsHash || item.grantsHash !== grants())
        throw Error("BACKUP_SCOPE_CHANGED");
      artifact = await readFile(join(this.staging, `${item.id}.stage`));
      if (createHash("sha256").update(artifact).digest("hex") !== item.hash)
        throw Error("BACKUP_STAGE_INTEGRITY");
    } else {
      signal.throwIfAborted();
      const id = randomUUID();
      const grantsHash = grants();
      const archives = await captureProjects(
        this.store,
        signal,
        selection || undefined,
      );
      if (grantsHash !== grants()) throw Error("BACKUP_SCOPE_CHANGED");
      const plain = snapshot(this.store, archives),
        contentHash = snapshotContentHash(plain),
        keyHash = createHash("sha256").update(key).digest("hex");
      const previous = this.store
        .all("backups")
        .find(
          (b) =>
            b.account === account &&
            b.status === "verified" &&
            b.remoteId &&
            b.md5 &&
            b.contentHash === contentHash &&
            b.keyHash === keyHash,
        );
      if (previous) {
        let meta: any;
        try {
          meta = await this.json(
            `https://www.googleapis.com/drive/v3/files/${previous.remoteId}?fields=id,size,md5Checksum,appProperties,trashed`,
            { headers: await this.headers(signal) },
            signal,
          );
        } catch (e) {
          if ((e as Error).message !== "DRIVE_HTTP_404") throw e;
        }
        if (
          meta &&
          !meta.trashed &&
          meta.id === previous.remoteId &&
          Number(meta.size) === previous.size &&
          meta.md5Checksum === previous.md5 &&
          meta.appProperties?.badawiKind === "backup" &&
          meta.appProperties?.backupId === previous.id
        ) {
          this.store.put("backups", {
            ...previous,
            lastCheckedAt: new Date().toISOString(),
          });
          this.store.audit("backup.reused", { backupId: previous.id });
          onProgress();
          return { backupId: previous.id, verified: true, reused: true };
        }
        this.store.put("backups", {
          ...previous,
          status: meta ? "remoteChanged" : "remoteMissing",
          lastCheckedAt: new Date().toISOString(),
        });
        this.store.audit("backup.remoteChanged", {
          backupId: previous.id,
          missing: !meta,
        });
        onProgress();
      }
      artifact = encryptBackup(plain, key, id);
      await writeFile(join(this.staging, `${id}.stage`), artifact, {
        flag: "wx",
      });
      item = this.store.put("backups", {
        id,
        account,
        projectIds: selection,
        grantsHash,
        status: "prepared",
        hash: createHash("sha256").update(artifact).digest("hex"),
        size: artifact.length,
        plainSize: plain.length,
        contentHash,
        keyHash,
        md5: createHash("md5").update(artifact).digest("hex"),
        createdAt: new Date().toISOString(),
        offset: 0,
      });
    }
    const save = (values: Record<string, unknown>) => {
      item = this.store.put("backups", { ...item, ...values });
      onProgress();
    };
    try {
      const assertScope = () => {
        signal.throwIfAborted();
        if (item?.grantsHash && item.grantsHash !== grants())
          throw Error("BACKUP_SCOPE_CHANGED");
      };
      assertScope();
      signal.throwIfAborted();
      if (!item.remoteId) {
        const id = await this.reserveId(signal);
        save({ remoteId: id });
      }
      const folder = await this.folder(signal);
      await this.createKnown(
        item.remoteId,
        {
          name: `${item.id}.badawi`,
          parents: [folder],
          mimeType: "application/octet-stream",
          appProperties: { badawiKind: "backup", backupId: item.id },
        },
        signal,
      );
      let session = this.secrets.get(`upload.${item.id}`);
      let offset = 0;
      if (session) {
        this.validateSession(session);
        const r = await this.request(
          session,
          {
            method: "PUT",
            headers: {
              ...(await this.headers(signal)),
              "Content-Range": `bytes */${artifact.length}`,
              "Content-Length": "0",
            },
          },
          signal,
        );
        if (r.status === 308) offset = this.offset(r);
        else if (r.ok) offset = artifact.length;
        else if (r.status === 404 || r.status === 410) session = undefined;
        else throw Error("DRIVE_RECONCILE_REQUIRED");
        await r.body?.cancel();
      }
      if (!session) {
        const r = await this.request(
          `https://www.googleapis.com/upload/drive/v3/files/${item.remoteId}?uploadType=resumable`,
          {
            method: "PATCH",
            headers: {
              ...(await this.headers(signal)),
              "Content-Type": "application/json",
              "X-Upload-Content-Type": "application/octet-stream",
              "X-Upload-Content-Length": String(artifact.length),
            },
            body: "{}",
          },
          signal,
        );
        if (!r.ok) throw Error("DRIVE_UPLOAD_INIT");
        session = r.headers.get("location") || "";
        this.validateSession(session);
        this.secrets.set(`upload.${item.id}`, session);
        await r.body?.cancel();
      }
      save({ status: "uploading", offset });
      while (offset < artifact.length) {
        assertScope();
        signal.throwIfAborted();
        const end = Math.min(offset + 256 * 1024, artifact.length);
        const r = await this.request(
          session,
          {
            method: "PUT",
            headers: {
              ...(await this.headers(signal)),
              "Content-Type": "application/octet-stream",
              "Content-Length": String(end - offset),
              "Content-Range": `bytes ${offset}-${end - 1}/${artifact.length}`,
            },
            body: new Uint8Array(artifact.subarray(offset, end)),
          },
          signal,
        );
        if (r.status === 308) {
          const next = this.offset(r);
          if (next <= offset || next > end) throw Error("DRIVE_UPLOAD_RANGE");
          offset = next;
        } else if (r.ok) offset = artifact.length;
        else throw Error(`DRIVE_UPLOAD_${r.status}`);
        await r.body?.cancel();
        save({ offset });
      }
      signal.throwIfAborted();
      save({ status: "verifying" });
      assertScope();
      const downloaded = await this.download(item.remoteId, signal);
      if (createHash("sha256").update(downloaded).digest("hex") !== item.hash)
        throw Error("BACKUP_REMOTE_INTEGRITY");
      validateSnapshot(decryptBackup(downloaded, key));
      signal.throwIfAborted();
      save({ status: "verified", verifiedAt: new Date().toISOString() });
      this.secrets.remove(`upload.${item.id}`);
      await unlink(join(this.staging, `${item.id}.stage`));
      this.store.audit("backup.verified", { backupId: item.id });
      return { backupId: item.id, verified: true };
    } catch (e) {
      const raw = e instanceof Error ? e.message : "";
      const safeCode = /^[A-Z][A-Z0-9_]{1,100}$/.test(raw)
        ? raw
        : "BACKUP_FAILED";
      save({
        status: "checkpointed",
        reason: signal.aborted ? "userControl" : safeCode,
      });
      throw e;
    }
  }
  private offset(r: Response) {
    const range = r.headers.get("range");
    return range && /^bytes=0-\d+$/.test(range)
      ? Number(range.split("-")[1]) + 1
      : 0;
  }
  private validateSession(url: string) {
    const u = new URL(url);
    if (
      u.protocol !== "https:" ||
      u.hostname !== "www.googleapis.com" ||
      !u.pathname.startsWith("/upload/drive/")
    )
      throw Error("DRIVE_SESSION_DENIED");
  }
}
