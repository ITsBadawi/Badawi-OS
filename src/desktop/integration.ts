import { hostText, hostFormat } from "../core/host-localization.ts";
import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  Notification,
  shell,
  dialog,
} from "electron";
import { mkdir, readFile, lstat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { Store } from "../core/store.ts";
import { Service } from "../core/service.ts";
export function desktopIntegration(
  store: Store,
  getWindow: () => BrowserWindow | null,
  getService: () => Service,
) {
  let tray: Tray | null = null;
  const diagnostic = process.env.BADAWI_BACKGROUND === "1";
  const prefs = () =>
    store.setting("preferences") || {
      notifications: true,
      tray: true,
      startup: false,
    };
  const show = () => {
    const w = getWindow();
    if (w) {
      w.show();
      w.restore();
      w.focus();
    }
  };
  function notify(title: string, body: string) {
    if (!prefs().notifications || diagnostic || !Notification.isSupported())
      return;
    const n = new Notification({
      title: title.slice(0, 160),
      body: body.slice(0, 240),
      silent: false,
    });
    n.on("click", () => {
      show();
      getWindow()?.webContents.send("badawi:navigate", "inbox");
    });
    n.on("show", () => store.audit("notification.shown"));
    n.on("failed", () => store.audit("notification.failed"));
    n.show();
    store.audit("notification.dispatched", { supported: true });
  }
  function refreshTray() {
    if (diagnostic) return;
    if (!prefs().tray) {
      tray?.destroy();
      tray = null;
      return;
    }
    if (!tray) {
      const pixels = Buffer.alloc(32 * 32 * 4);
      for (let y = 0; y < 32; y++)
        for (let x = 0; x < 32; x++) {
          const i = (y * 32 + x) * 4;
          const white =
            (x >= 9 && x <= 12 && y >= 6 && y <= 25) ||
            (x >= 13 &&
              x <= 22 &&
              ((y >= 6 && y <= 9) ||
                (y >= 14 && y <= 17) ||
                (y >= 22 && y <= 25))) ||
            (x >= 20 &&
              x <= 23 &&
              ((y >= 9 && y <= 13) || (y >= 18 && y <= 21)));
          pixels[i] = white ? 255 : 112;
          pixels[i + 1] = white ? 255 : 96;
          pixels[i + 2] = white ? 255 : 215;
          pixels[i + 3] = 255;
        }
      tray = new Tray(
        nativeImage.createFromBitmap(pixels, { width: 32, height: 32 }),
      );
      tray.setToolTip("Badawi OS");
      tray.on("double-click", show);
    }
    const state = getService().engine.snapshot();
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: `Badawi OS · ${state.mode}`, enabled: false },
        { label: hostText(store, "فتح مساحة العمل"), click: show },
        { type: "separator" },
        ...(["Running", "Pause", "Stop"] as const).map((mode) => ({
          label: {
            Running: hostText(store, "تشغيل المحرك"),
            Pause: hostText(store, "تعليق المحرك"),
            Stop: hostText(store, "إيقاف المحرك"),
          }[mode],
          type: "radio" as const,
          checked: state.mode === mode,
          click: () => {
            const e = getService().engine.snapshot();
            getService().engine.setMode(mode, e.epoch);
            refreshTray();
          },
        })),
        { type: "separator" },
        {
          label: hostText(store, "خروج كامل وإيقاف الجدولة"),
          click: () => app.quit(),
        },
      ]),
    );
  }
  function preferences(value: any) {
    if (diagnostic) return;
    app.setLoginItemSettings({
      openAtLogin: !!value.startup,
      path: process.execPath,
      args: ["--hidden"],
    });
    // The caller saves the preferences immediately; refresh after that transaction.
    setImmediate(refreshTray);
  }
  async function desktop(operation: string, argument?: string) {
    if (operation === "openFolder") {
      const error = await shell.openPath(argument || app.getPath("userData"));
      if (error) throw Error("FOLDER_OPEN_FAILED");
      return { opened: true };
    }
    if (operation === "install") {
      if (diagnostic) throw Error("DIAGNOSTIC_INSTALL_DENIED");
      const folder = path.join(
        app.getPath("appData"),
        "Microsoft",
        "Windows",
        "Start Menu",
        "Programs",
      );
      await mkdir(folder, { recursive: true });
      const options = {
        target: process.execPath,
        cwd: path.dirname(process.execPath),
        description: "Badawi OS — your local workspace",
        appUserModelId: "Badawi.OS",
      };
      const a = shell.writeShortcutLink(
          path.join(folder, "Badawi OS.lnk"),
          "create",
          options,
        ),
        b = shell.writeShortcutLink(
          path.join(app.getPath("desktop"), "Badawi OS.lnk"),
          "create",
          options,
        );
      if (!a || !b) throw Error("SHORTCUT_INSTALL_FAILED");
      store.audit("desktop.shortcutsInstalled");
      return { installed: true };
    }
    if (operation === "update") {
      if (diagnostic) throw Error("DIAGNOSTIC_INSTALL_DENIED");
      if (getService().engine.snapshot().active) throw Error("ENGINE_BUSY");
      const selected = await dialog.showOpenDialog(getWindow()!, {
        title: hostText(store, "اختر مجلد تحديث Badawi OS بعد فك ZIP"),
        properties: ["openDirectory"],
      });
      if (selected.canceled) return null;
      const root = selected.filePaths[0],
        exe = path.join(root, "Badawi OS.exe"),
        metadata = path.join(root, "resources", "app", "package.json");
      const st = await lstat(root);
      if (st.isSymbolicLink()) throw Error("UPDATE_PACKAGE_INVALID");
      for (const relative of [
        "Badawi OS.exe",
        "resources",
        "resources/app",
        "resources/app/package.json",
        "resources/app/dist-desktop",
        "resources/app/dist-desktop/main.cjs",
      ]) {
        const f = await lstat(path.join(root, relative));
        if (f.isSymbolicLink()) throw Error("UPDATE_PACKAGE_INVALID");
      }
      const info = JSON.parse(await readFile(metadata, "utf8"));
      if (
        info.name !== "badawi-os" ||
        info.main !== "dist-desktop/main.cjs" ||
        !/^\d+\.\d+\.\d+$/.test(info.version)
      )
        throw Error("UPDATE_PACKAGE_INVALID");
      const current = app.getVersion().split(".").map(Number),
        next = info.version.split(".").map(Number);
      let newer = false;
      for (let i = 0; i < 3; i++) {
        if (next[i] > current[i]) {
          newer = true;
          break;
        }
        if (next[i] < current[i]) break;
      }
      if (!newer) throw Error("UPDATE_NOT_NEWER");
      const digest = createHash("sha256")
        .update(await readFile(exe))
        .digest("hex");
      const mainPath = path.join(
        root,
        "resources",
        "app",
        "dist-desktop",
        "main.cjs",
      );
      const mainDigest = createHash("sha256")
        .update(await readFile(mainPath))
        .digest("hex");
      const metadataText = await readFile(metadata, "utf8");
      const response = await dialog.showMessageBox(getWindow()!, {
        type: "question",
        buttons: [
          hostText(store, "إلغاء"),
          hostText(store, "فتح التحديث وإعادة التشغيل"),
        ],
        defaultId: 0,
        cancelId: 0,
        title: hostText(store, "مراجعة تحديث محلي"),
        message: `Badawi OS ${info.version}`,
        detail: hostFormat(
          store,
          "المجلد: {0}\nSHA-256 للتنفيذ: {1}\nاختر تحديثاً نزّلته من مصدر تثق به. تبقى بياناتك في مجلد البرنامج، ولا تُنشأ نسخة احتياطية محلية دائمة.",
          [root, digest],
        ),
      });
      if (response.response !== 1) return null;
      if (
        createHash("sha256")
          .update(await readFile(exe))
          .digest("hex") !== digest ||
        createHash("sha256")
          .update(await readFile(mainPath))
          .digest("hex") !== mainDigest ||
        (await readFile(metadata, "utf8")) !== metadataText
      )
        throw Error("UPDATE_PACKAGE_CHANGED");
      store.audit("desktop.updateReviewed", { version: info.version });
      app.relaunch({ execPath: exe, args: [] });
      app.quit();
      return { restarting: true };
    }
    throw Error("DESKTOP_OPERATION_DENIED");
  }
  return {
    notify,
    preferences,
    desktop,
    refreshTray,
    hideOnClose: () => !diagnostic && prefs().tray,
    show,
    destroy: () => tray?.destroy(),
  };
}
