/**
 * Electron main process, CommonJS on purpose: sandbox preload + no ESM __dirname.
 * Starts the same local API the browser uses, then opens one window.
 */

const { app, BrowserWindow, ipcMain, session, shell, dialog, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");

process.env.ELECTRON = "1";
process.env.SERVE_STATIC = "1";
process.env.NODE_ENV = process.env.NODE_ENV || "production";

const iconPng = app.isPackaged
  ? path.join(process.resourcesPath, "icon.png")
  : path.join(__dirname, "..", "assets", "icon.png");

let mainWindow = null;

function socialFetch(url, opts = {}) {
  const { social, timeout, ...rest } = opts;
  return session.fromPartition("persist:kb-social").fetch(url, rest);
}

function createWindow() {
  const icon = fs.existsSync(iconPng) ? nativeImage.createFromPath(iconPng) : undefined;
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: "Gloss",
    backgroundColor: "#f6f3ec",
    icon,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const port = process.env.PORT || "3921";
  const devUrl = process.env.ELECTRON_START_URL;
  mainWindow.loadURL(devUrl || `http://127.0.0.1:${port}/`);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

ipcMain.handle("gloss:pick-data-root", async () => {
  const r = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory"] });
  if (r.canceled || !r.filePaths[0]) return "";
  return r.filePaths[0];
});

ipcMain.handle("gloss:open-external", async (_e, url) => {
  if (typeof url === "string" && /^https?:\/\//i.test(url)) await shell.openExternal(url);
  return true;
});

ipcMain.handle("gloss:open-login", async (_e, platform) => {
  const url = platform === "instagram"
    ? "https://www.instagram.com/accounts/login/"
    : platform === "facebook"
      ? "https://www.facebook.com/login"
      : "https://www.facebook.com/login";
  const win = new BrowserWindow({
    width: 480,
    height: 780,
    parent: mainWindow || undefined,
    title: "Gloss",
    autoHideMenuBar: true,
    webPreferences: {
      partition: "persist:kb-social",
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  await win.loadURL(url);
  return new Promise((resolve) => {
    win.on("closed", () => resolve({ ok: true }));
  });
});

app.whenReady().then(async () => {
  if (process.platform === "win32") app.setAppUserModelId("io.usegloss.knowledge");
  global.__kbSocialFetch = socialFetch;
  process.env.GLOSS_USER_DIR = app.getPath("userData");
  if (!process.env.ELECTRON_START_URL) {
    const { start } = require("../server/http.cjs");
    await start();
  }
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
