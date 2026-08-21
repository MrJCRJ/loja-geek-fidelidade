const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, globalShortcut, session } = require("electron");
const path = require("node:path");
const { OverlayLockController } = require("./lock-controller.cjs");
const { loadConfig, saveStationToken } = require("./config.cjs");

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {Tray | null} */
let tray = null;
const lock = new OverlayLockController(() => mainWindow);

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    show: true,
    autoHideMenuBar: true,
    fullscreen: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.on("close", (e) => {
    // Impede fechar sem PIN/staff — só esconde se desbloqueado? Mantém aberto.
    if (!app.isQuitting) {
      e.preventDefault();
      lock.lock();
    }
  });

  lock.lock();
}

function createTray() {
  const img = nativeImage.createEmpty();
  tray = new Tray(img);
  tray.setToolTip("GeekLock VIP");
  const menu = Menu.buildFromTemplate([
    {
      label: "Mostrar trava",
      click: () => {
        lock.lock();
        mainWindow?.show();
      },
    },
    {
      label: "Encerrar sessão VIP",
      click: () => mainWindow?.webContents.send("session:request-end"),
    },
    { type: "separator" },
    {
      label: "Sair (requer PIN no app)",
      click: () => mainWindow?.webContents.send("staff:request-quit"),
    },
  ]);
  tray.setContextMenu(menu);
}

app.whenReady().then(() => {
  // Libera webcam sem prompt travando o kiosk
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

  createWindow();
  createTray();

  // Best-effort: bloqueia F11 / Esc de sair do fullscreen facilmente
  globalShortcut.register("F11", () => {
    lock.lock();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  app.isQuitting = true;
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("config:get", () => loadConfig());

ipcMain.handle("config:save-token", (_e, token) => {
  saveStationToken(String(token || ""));
  return loadConfig();
});

ipcMain.handle("lock:lock", () => {
  lock.lock();
  return { locked: true };
});

ipcMain.handle("lock:unlock", () => {
  lock.unlock();
  return { locked: false };
});

ipcMain.handle("app:quit", (_e, pin) => {
  const cfg = loadConfig();
  if (String(pin) !== String(cfg.staffPin)) {
    return { ok: false, error: "PIN inválido" };
  }
  app.isQuitting = true;
  app.quit();
  return { ok: true };
});

ipcMain.handle("staff:unlock", (_e, pin) => {
  const cfg = loadConfig();
  if (String(pin) !== String(cfg.staffPin)) {
    return { ok: false, error: "PIN inválido" };
  }
  lock.unlock();
  return { ok: true };
});
