/**
 * GeekAdmin — painel PC controle em janela Electron (sem navegador).
 * Carrega http://127.0.0.1:8787/admin com permissão de câmera liberada.
 */
const { app, BrowserWindow, session, Menu } = require("electron");
const path = require("node:path");

const ADMIN_URL = process.env.GEEK_ADMIN_URL || "http://127.0.0.1:8787/admin";
const TITLE = "GeekCentral — Loja Geek";

/** @type {BrowserWindow | null} */
let win = null;

function createAdminWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    show: true,
    autoHideMenuBar: true,
    title: TITLE,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  win.setMenuBarVisibility(false);
  Menu.setApplicationMenu(null);

  win.loadURL(ADMIN_URL);

  win.on("closed", () => {
    win = null;
  });
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === "media" || permission === "camera" || permission === "microphone") {
      callback(true);
      return;
    }
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return permission === "media" || permission === "camera" || permission === "microphone";
  });

  createAdminWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createAdminWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
