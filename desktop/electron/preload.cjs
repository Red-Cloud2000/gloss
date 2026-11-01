/**
 * Sandboxed preload. Exposes a tiny desktop bridge; the UI talks to the local
 * API over HTTP so this file stays free of Node builtins beyond electron.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("glossDesktop", {
  isDesktop: true,
  pickDataRoot: () => ipcRenderer.invoke("gloss:pick-data-root"),
  openLogin: (platform) => ipcRenderer.invoke("gloss:open-login", platform),
  openExternal: (url) => ipcRenderer.invoke("gloss:open-external", url),
});
