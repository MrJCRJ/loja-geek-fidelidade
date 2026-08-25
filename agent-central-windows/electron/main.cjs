const { createElectronDebug } = require("./debug.cjs");
const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  Tray,
  Menu,
  nativeImage,
} = require("electron");
const path = require("node:path");
const { ServiceManager, isDev } = require("./services.cjs");
const { ensureApiFirewallRule } = require("./firewall.cjs");
const { createWindowsShortcuts, removeWindowsShortcuts } = require("./shortcuts.cjs");
const QRCode = require("qrcode");

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {Tray | null} */
let tray = null;
/** @type {ServiceManager} */
const services = new ServiceManager(app);

let isQuitting = false;

const isWin = process.platform === "win32";
const isLinux = process.platform === "linux";
const debug = createElectronDebug("geekcentral", isDev());

function trayIcon() {
  // Ícone mínimo 16x16 (laranja geek) — evita depender de arquivo no pack
  return nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAPElEQVQ4T2NkYGD4z0ABYBzVMKoBQw0AGqZhYGBg+M/AwPCfkYGBgRGmEQYGBgbG/wz/GRkZ/jMwMDCgGwAA3B0EAfQk4WwAAAAASUVORK5CYII=",
  );
}

function applyLoginItem(enabled) {
  if (isLinux) return { openAtLogin: false };
  try {
    app.setLoginItemSettings({
      openAtLogin: Boolean(enabled),
      openAsHidden: true,
      name: "GeekCentral",
      path: process.execPath,
      args: isDev() ? [] : [],
    });
  } catch (err) {
    debug.warn("setLoginItemSettings:", err);
  }
  try {
    return app.getLoginItemSettings();
  } catch {
    return { openAtLogin: Boolean(enabled) };
  }
}

function wasOpenedAtLogin() {
  try {
    const s = app.getLoginItemSettings();
    return Boolean(s.wasOpenedAtLogin || s.wasOpenedAsHidden);
  } catch {
    return process.argv.includes("--hidden");
  }
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow({ show: true });
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createWindow(opts = {}) {
  const show = opts.show !== false;
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (show) focusMainWindow();
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 920,
    height: 780,
    show,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  services.onChange = (status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("central:status", status);
    }
    updateTrayTooltip(status);
  };

  if (isDev() && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.on("close", (e) => {
    if (isQuitting) return;
    e.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  return mainWindow;
}

function updateTrayTooltip(status) {
  if (!tray) return;
  const phase = status?.phase || "…";
  const api = status?.api ? "API ok" : "API off";
  const face = status?.face ? "Face ok" : "Face off";
  tray.setToolTip(`GeekCentral — ${phase} · ${api} · ${face}`);
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: "Abrir GeekCentral",
      click: () => focusMainWindow(),
    },
    {
      label: "Abrir admin",
      click: () => {
        openAdminWindow().catch(() => undefined);
      },
    },
    { type: "separator" },
    {
      label: "Reiniciar serviços",
      click: async () => {
        try {
          await services.start();
        } catch (err) {
          services.status.phase = "error";
          services.status.error = err instanceof Error ? err.message : String(err);
          services.emit();
        }
      },
    },
    { type: "separator" },
    {
      label: "Sair",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
}

function createTray() {
  if (tray) return;
  tray = new Tray(trayIcon());
  tray.setToolTip("GeekCentral");
  tray.setContextMenu(buildTrayMenu());
  tray.on("double-click", () => focusMainWindow());
  tray.on("click", () => {
    if (isWin) focusMainWindow();
  });
}

async function openAdminWindow() {
  const { session } = require("electron");
  const url = `http://127.0.0.1:${services.status.apiPort}/admin`;
  const adminWin = new BrowserWindow({
    width: 1280,
    height: 860,
    title: "GeekCentral — Loja Geek",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === "media" || permission === "camera" || permission === "microphone") {
      callback(true);
      return;
    }
    callback(false);
  });
  adminWin.loadURL(url);
  return { ok: true, url };
}

if (gotSingleInstanceLock) {
  app.on("second-instance", () => {
    focusMainWindow();
  });
}

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return;

  const peek = services.peekSetup();
  const openAtLogin = peek.openAtLogin !== false; // default true após 1º setup
  if (!isLinux) {
    applyLoginItem(openAtLogin && peek.setupComplete);
  }

  createTray();

  const startHidden = wasOpenedAtLogin() && peek.setupComplete && !peek.needsSetup;
  createWindow({ show: !startHidden });

  try {
    if (!peek.firewallRuleDone && isWin && peek.setupComplete) {
      const fw = await ensureApiFirewallRule(peek.apiPort || 8787);
      services.markFirewallAttempt(fw);
    }
    await services.start({ fromBoot: startHidden });
  } catch (err) {
    services.status.phase = "error";
    services.status.error = err instanceof Error ? err.message : String(err);
    services.emit();
    if (startHidden) focusMainWindow();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow({ show: true });
    else focusMainWindow();
  });
});

app.on("before-quit", () => {
  isQuitting = true;
  services.stopWatchdog();
  services.stop();
});

app.on("window-all-closed", () => {
  // Mantém app + serviços vivos na bandeja (Windows/Linux)
  if (process.platform === "darwin") return;
});

ipcMain.handle("central:get-status", () => ({
  ...services.status,
  openAtLogin: services.getOpenAtLogin(),
}));

ipcMain.handle("central:peek-setup", () => services.peekSetup());

ipcMain.handle("central:complete-setup", async (_e, input) => {
  try {
    services.completeSetup(input || {});
    applyLoginItem(true);
    services.setOpenAtLogin(true);
    const fw = await ensureApiFirewallRule(services.status.apiPort || 8787);
    services.markFirewallAttempt(fw);
    await createWindowsShortcuts({
      target: process.execPath,
      name: "GeekCentral",
      cwd: path.dirname(process.execPath),
    });
    await services.start();
    return { ok: true, status: { ...services.status, openAtLogin: true } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    services.status.error = message;
    services.emit();
    return { ok: false, error: message, status: { ...services.status } };
  }
});

ipcMain.handle("central:restart", async () => {
  try {
    await services.start();
    return { ok: true, status: { ...services.status, openAtLogin: services.getOpenAtLogin() } };
  } catch (err) {
    services.status.phase = "error";
    services.status.error = err instanceof Error ? err.message : String(err);
    services.emit();
    return { ok: false, error: services.status.error, status: { ...services.status } };
  }
});

ipcMain.handle("central:open-admin", async () => openAdminWindow());

ipcMain.handle("central:open-url", async (_e, url) => {
  await shell.openExternal(String(url));
  return { ok: true };
});

ipcMain.handle("central:get-autostart", () => {
  let login = { openAtLogin: services.getOpenAtLogin() };
  try {
    login = { ...login, ...app.getLoginItemSettings() };
  } catch {
    /* ignore */
  }
  return {
    openAtLogin: Boolean(login.openAtLogin ?? services.getOpenAtLogin()),
    bootDelayMs: services.getBootDelayMs(),
  };
});

ipcMain.handle("central:set-autostart", (_e, enabled) => {
  const on = Boolean(enabled);
  services.setOpenAtLogin(on);
  const settings = applyLoginItem(on);
  return {
    ok: true,
    openAtLogin: Boolean(settings.openAtLogin ?? on),
    bootDelayMs: services.getBootDelayMs(),
  };
});

ipcMain.handle("central:ensure-firewall", async () => {
  const fw = await ensureApiFirewallRule(services.status.apiPort || 8787);
  services.markFirewallAttempt(fw);
  return fw;
});

ipcMain.handle("central:set-tunnel", async (_e, input) => {
  try {
    return await services.setTunnel(input || { tunnelMode: "off" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message, status: { ...services.status } };
  }
});

ipcMain.handle("central:check-tunnel", async () => {
  const ok = await services.tunnel.checkPublicHealth();
  return {
    ok,
    publicUrl: services.status.tunnelPublicUrl,
    publicHealthy: services.status.tunnelPublicHealthy,
    status: { ...services.status },
  };
});

ipcMain.handle("central:qr", async (_e, text) => {
  const data = String(text || "").trim();
  if (!data) return { ok: false, error: "vazio" };
  try {
    const dataUrl = await QRCode.toDataURL(data, { margin: 1, width: 220 });
    return { ok: true, dataUrl };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle("central:create-shortcuts", async () => {
  const res = await createWindowsShortcuts({
    target: process.execPath,
    name: "GeekCentral",
    cwd: path.dirname(process.execPath),
    desktop: true,
    startMenu: true,
  });
  if (res.ok) services.log("[setup] atalhos criados (Área de trabalho / Menu Iniciar)");
  else services.log(`[setup] atalhos: ${res.error || "falhou"}`);
  return res;
});

ipcMain.handle("central:uninstall-local", async (_e, opts) => {
  const wipeData = Boolean(opts?.wipeData);
  try {
    app.setLoginItemSettings({ openAtLogin: false, path: process.execPath });
  } catch {
    /* ignore */
  }
  services.setOpenAtLogin(false);
  const removed = removeWindowsShortcuts("GeekCentral");
  let dataDeleted = false;
  if (wipeData) {
    try {
      const dataDir = services.dataDir();
      // não apaga a pasta inteira se o exe está dentro — só limpa db/config sensíveis com cuidado
      const fs = require("node:fs");
      for (const name of ["fidelidade.db", "fidelidade.db-wal", "fidelidade.db-shm", "config.json"]) {
        const p = path.join(dataDir, name);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
      dataDeleted = true;
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        removed: removed.removed,
      };
    }
  }
  services.log("[setup] remoção local: autostart off + atalhos");
  return { ok: true, removed: removed.removed, dataDeleted };
});
