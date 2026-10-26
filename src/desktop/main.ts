import { hostText } from "../core/host-localization.ts";
import {
  app,
  BrowserWindow,
  ipcMain,
  session,
  dialog,
  safeStorage,
  shell,
  powerMonitor,
} from "electron";
import { mkdirSync } from "node:fs";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Store } from "../core/store.ts";
import { Service } from "../core/service.ts";
import { RequestLedger } from "../core/requests.ts";
import { rendererAssetAllowed } from "./security.ts";
import { desktopIntegration } from "./integration.ts";
import { atomicExport } from "./export.ts";
import { envelopeSchema, type Reply } from "../contracts.ts";
import { createChatGPT, CHATGPT_USAGE_URL } from "@siwc/local";
import { ChatGPTSubscriptionProvider } from "../core/chatgpt-subscription.ts";
app.setName("Badawi OS");
app.setAppUserModelId("Badawi.OS");
app.disableHardwareAcceleration();
if (process.env.BADAWI_DATA_DIR) {
  const target = path.resolve(process.env.BADAWI_DATA_DIR);
  mkdirSync(target, { recursive: true });
  app.setPath("userData", target);
}
let window: BrowserWindow | null = null;
let store: Store;
let service: Service;
let quitting = false;
let readyToQuit = false;
let integration: ReturnType<typeof desktopIntegration>;
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (window?.isMinimized()) window.restore();
    window?.show();
    window?.focus();
  });
  app
    .whenReady()
    .then(async () => {
      const directory = app.getPath("userData");
      await mkdir(directory, { recursive: true });
      store = new Store(path.join(directory, "badawi.db"));
      const secrets = {
        get(key: string) {
          const row = store.db
            .prepare("SELECT ciphertext FROM secrets WHERE key=?")
            .get(key) as { ciphertext: Uint8Array } | undefined;
          if (!row) return undefined;
          if (!safeStorage.isEncryptionAvailable())
            throw Error("OS_ENCRYPTION_UNAVAILABLE");
          try {
            return safeStorage.decryptString(Buffer.from(row.ciphertext));
          } catch {
            throw Error("OS_SECRET_DECRYPT_FAILED");
          }
        },
        set(key: string, value: string) {
          if (!safeStorage.isEncryptionAvailable())
            throw Error("OS_ENCRYPTION_UNAVAILABLE");
          store.db
            .prepare(
              "INSERT INTO secrets VALUES(?,?) ON CONFLICT(key) DO UPDATE SET ciphertext=excluded.ciphertext",
            )
            .run(key, safeStorage.encryptString(value));
        },
        remove(key: string) {
          store.db.prepare("DELETE FROM secrets WHERE key=?").run(key);
        },
      };
      integration = desktopIntegration(
        store,
        () => window,
        () => service,
      );
      const subscription = new ChatGPTSubscriptionProvider(
        createChatGPT({
          appName: "Badawi OS",
          appId: "badawi-os",
          redirectPort: 0,
          storageDir: path.join(directory, "chatgpt-subscription"),
          credentialEncryption: {
            id: "badawi-electron-safe-storage-v1",
            isAvailable: () => safeStorage.isAsyncEncryptionAvailable(),
            encrypt: (plaintext) => safeStorage.encryptStringAsync(plaintext),
            decrypt: async (bytes) =>
              (await safeStorage.decryptStringAsync(Buffer.from(bytes))).result,
          },
          openBrowser: async (url) => {
            if (new URL(url).origin !== "https://auth.openai.com")
              throw Error("CHATGPT_AUTH_ORIGIN_DENIED");
            await shell.openExternal(url);
          },
        }),
        () => service?.emit("change"),
      );
      await subscription.restore();
      service = new Service(
        store,
        {
          secrets,
          subscription,
          manageChatGPT: async () => {
            await shell.openExternal(CHATGPT_USAGE_URL);
          },
          notify: integration.notify,
          desktop: integration.desktop,
          preferences: integration.preferences,
          async saveBytes(name, bytes) {
            const result = await dialog.showSaveDialog(window!, {
              title: hostText(store, "حفظ نسخة من الملف"),
              defaultPath: name,
            });
            if (result.canceled || !result.filePath) return false;
            const { writeFile, open, rename, unlink } =
              await import("node:fs/promises");
            const temporary = path.join(
              path.dirname(result.filePath),
              `.badawi-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`,
            );
            try {
              const file = await open(temporary, "wx");
              try {
                await file.writeFile(bytes);
                await file.sync();
              } finally {
                await file.close();
              }
              await rename(temporary, result.filePath);
              return true;
            } finally {
              await unlink(temporary).catch(() => {});
            }
          },
          async pickProject() {
            const selected = await dialog.showOpenDialog(window!, {
              title: hostText(store, "اختر مشروعاً للقراءة فقط"),
              properties: ["openDirectory"],
              buttonLabel: hostText(store, "السماح بالقراءة"),
            });
            return selected.canceled ? null : selected.filePaths[0];
          },
          async saveText(name, text) {
            const result = await dialog.showSaveDialog(window!, {
              title: name.includes("Recovery")
                ? hostText(store, "احفظ مفتاح الاسترداد في مكان آمن خارج Drive")
                : hostText(store, "حفظ الملف"),
              defaultPath: name,
              filters: [{ name: "JSON", extensions: ["json"] }],
            });
            if (result.canceled || !result.filePath) return false;
            await atomicExport(result.filePath, text);
            return true;
          },
          async pickKey() {
            const result = await dialog.showOpenDialog(window!, {
              title: hostText(store, "اختر مفتاح الاسترداد"),
              properties: ["openFile"],
              filters: [{ name: "Recovery key", extensions: ["json"] }],
            });
            if (result.canceled) return null;
            const file = await readFile(result.filePaths[0]);
            if (file.length > 8192) throw Error("INVALID_RECOVERY_KEY");
            return file.toString("utf8");
          },
          async pickRestoreDirectory() {
            const result = await dialog.showOpenDialog(window!, {
              title: hostText(
                store,
                "اختر المجلد الأب؛ ستنشأ مساحة جديدة داخله",
              ),
              properties: ["openDirectory"],
            });
            return result.canceled
              ? null
              : path.join(result.filePaths[0], `Badawi-Restored-${Date.now()}`);
          },
          async pickOAuthClient() {
            const result = await dialog.showOpenDialog(window!, {
              title: hostText(
                store,
                "اختر ملف OAuth Desktop الذي نزّلته من Google Cloud",
              ),
              properties: ["openFile"],
              filters: [
                { name: "Google Desktop OAuth JSON", extensions: ["json"] },
              ],
            });
            if (result.canceled) return null;
            const file = await readFile(result.filePaths[0]);
            if (file.length > 65536) throw Error("INVALID_DESKTOP_CLIENT");
            return file.toString("utf8");
          },
          async openAuth(url) {
            const u = new URL(url);
            if (
              u.protocol !== "https:" ||
              u.hostname !== "accounts.google.com" ||
              u.pathname !== "/o/oauth2/v2/auth"
            )
              throw Error("AUTH_URL_DENIED");
            await shell.openExternal(url);
          },
        },
        path.join(directory, "staging"),
      );
      service.gameMonitor.start();
      const entry = path.join(__dirname, "../dist/index.html");
      const trusted = pathToFileURL(entry).href;
      window = new BrowserWindow({
        title: "Badawi OS",
        width: 1440,
        height: 940,
        minWidth: 800,
        minHeight: 600,
        backgroundColor: "#f6f7fb",
        show: false,
        autoHideMenuBar: true,
        webPreferences: {
          preload: path.join(__dirname, "preload.cjs"),
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: true,
          spellcheck: false,
        },
      });
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.webContents.on("will-navigate", (event, url) => {
        if (url !== trusted) event.preventDefault();
      });
      window.webContents.on("will-attach-webview", (event) =>
        event.preventDefault(),
      );
      session.defaultSession.setPermissionRequestHandler(
        (_contents, _permission, callback) => callback(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      session.defaultSession.webRequest.onBeforeRequest((details, callback) =>
        callback({
          cancel: !rendererAssetAllowed(details.url, path.dirname(entry)),
        }),
      );
      const ledger = new RequestLedger(store);
      const rates: number[] = [];
      ipcMain.handle("badawi:command", async (event, input): Promise<Reply> => {
        if (
          event.sender !== window?.webContents ||
          event.senderFrame !== window.webContents.mainFrame ||
          event.senderFrame.url !== trusted
        )
          return { ok: false, error: "UNTRUSTED_SENDER" };
        const parsed = envelopeSchema.safeParse(input);
        if (!parsed.success) return { ok: false, error: "INVALID_REQUEST" };
        const { requestId, command } = parsed.data;
        const now = Date.now();
        while (rates[0] < now - 1000) rates.shift();
        if (rates.length >= 60)
          return { ok: false, error: "TOO_MANY_REQUESTS" };
        rates.push(now);
        const promise = ledger
          .execute(requestId, command, () => service.command(command))
          .then((data) => ({ ok: true, data }) as Reply)
          .catch((error) => {
            const message = error instanceof Error ? error.message : "FAILED";
            const code = /^[A-Z][A-Z0-9_]{1,100}$/.test(message)
              ? message
              : "OPERATION_FAILED";
            return { ok: false, error: code } as Reply;
          });
        return promise;
      });
      let notifyTimer: ReturnType<typeof setTimeout> | null = null;
      service.on("change", () => {
        if (quitting) return;
        if (notifyTimer) return;
        notifyTimer = setTimeout(() => {
          notifyTimer = null;
          if (quitting) return;
          if (!window?.isDestroyed())
            window?.webContents.send("badawi:changed");
          integration.refreshTray();
        }, 60);
      });
      window.once("ready-to-show", () => {
        integration.refreshTray();
        if (
          process.env.BADAWI_BACKGROUND !== "1" &&
          !process.argv.includes("--hidden")
        )
          window?.show();
      });
      window.on("close", (event) => {
        if (!readyToQuit) {
          event.preventDefault();
          if (!quitting && integration.hideOnClose()) {
            window?.hide();
            return;
          }
          app.quit();
        }
      });
      window.on("closed", () => {
        window = null;
      });
      powerMonitor.on("suspend", () => {
        const state = service.engine.snapshot();
        service.engine.setMode("Stop", state.epoch);
      });
      await window.loadFile(entry);
    })
    .catch(async (error) => {
      if (process.env.BADAWI_BACKGROUND === "1")
        console.error(
          "BADAWI_STARTUP_ERROR",
          /^[a-z_]+$/.test(error?.code || "")
            ? error.code
            : "initialization_failed",
        );
      dialog.showErrorBox(
        "Badawi OS",
        hostText(
          store,
          "تعذر فتح مساحة العمل. تحقق من مساحة القرص وصلاحية مجلد بيانات البرنامج.",
        ),
      );
      readyToQuit = true;
      app.quit();
    });
  app.on("before-quit", (event) => {
    if (readyToQuit || !service) return;
    event.preventDefault();
    if (quitting) return;
    quitting = true;
    const state = service.engine.snapshot();
    service.engine.setMode("Stop", state.epoch);
    const wait = setInterval(() => {
      if (service.engine.snapshot().active) return;
      clearInterval(wait);
      service.close();
      integration?.destroy();
      store.audit("app.cleanExit");
      store.close();
      readyToQuit = true;
      app.quit();
    }, 100);
  });
  app.on("window-all-closed", () => app.quit());
}
