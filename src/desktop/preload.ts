import { contextBridge, ipcRenderer } from "electron";
import type { Bridge, Command, Reply } from "../contracts.ts";
const bridge: Bridge = {
  command: (command: Command): Promise<Reply> =>
    ipcRenderer.invoke("badawi:command", {
      requestId: globalThis.crypto.randomUUID(),
      command,
    }),
  onNavigate: (callback) => {
    const pages = new Set([
      "dashboard",
      "tasks",
      "chat",
      "projects",
      "files",
      "notes",
      "automations",
      "inbox",
      "backups",
      "settings",
    ]);
    const listener = (_e: unknown, page: string) => {
      if (pages.has(page)) callback(page);
    };
    ipcRenderer.on("badawi:navigate", listener);
    return () => ipcRenderer.removeListener("badawi:navigate", listener);
  },
  subscribe: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("badawi:changed", listener);
    return () => ipcRenderer.removeListener("badawi:changed", listener);
  },
};
contextBridge.exposeInMainWorld("badawi", Object.freeze(bridge));
