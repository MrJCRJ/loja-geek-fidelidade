const { createElectronDebug } = require("./debug.cjs");
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, globalShortcut, session, dialog } = require("electron");
const path = require("node:path");
const { OverlayLockController } = require("./lock-controller.cjs");
const { SessionHud } = require("./session-hud.cjs");
const { loadConfig, saveStationToken, saveConfig } = require("./config.cjs");
const { startListener } = require("../../shared/lan-discovery.cjs");
const { writeLastFailure, readLastFailure, clearLastFailure } = require("./last-failure.cjs");

process.on("uncaughtException", (err) => {
  writeLastFailure("uncaught", err instanceof Error ? err.message : String(err));
});
process.on("unhandledRejection", (err) => {
  writeLastFailure("unhandled", err instanceof Error ? err.message : String(err));
});

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {Tray | null} */
let tray = null;
/** @type {Record<string, unknown> | null} */
let lastTrayPayload = null;
/** @type {string} */
let lastMenuKey = "";
/** @type {string} */
let lastIconKey = "";
/** @type {string} */
let lastTooltip = "";
/** @type {string} */
let lastTipKey = "";
/** @type {number} */
let lastTooltipAt = 0;
const TOOLTIP_MIN_MS = 5000;
const lock = new OverlayLockController(() => mainWindow);
const sessionHud = new SessionHud();

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const debug = createElectronDebug("geeklock", isDev);
const isLinux = process.platform === "linux";

// Linux sem GPU dedicada: evita crash "GPU process isn't usable" (câmera para de funcionar).
if (isLinux) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("disable-gpu-compositing");
  // DroidCam alimenta /dev/video0 (v4l2) — preferir captura direta no kiosk.
  app.commandLine.appendSwitch("disable-features", "WebRTCPipeWireCapturer");
}
const ICONS_DIR = path.join(__dirname, "icons");
const DIST_INDEX = path.join(__dirname, "..", "dist", "index.html");
const TRAY_ICON_SIZE = isLinux ? 22 : 16;
let loadFallbackAttempted = false;

/** @type {Record<string, Electron.NativeImage>} */
const trayIcons = {};

function loadTrayIcon(name) {
  const file = path.join(ICONS_DIR, name);
  const img = nativeImage.createFromPath(file);
  if (img.isEmpty()) {
    return nativeImage.createFromDataURL(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAANElEQVQoz2NgGAWjYBSMglEwCkbBKBgFo2AUjIJRMApGwSgYBaNgFIyCUTAKRsEoGAWjYBSMglEwCkbBKBgFo2AUjIJRMApGwSgYBaNgFIwCAAAbXgE3YQ7+oQAAAABJRU5ErkJggg==",
    );
  }
  return img.resize({ width: TRAY_ICON_SIZE, height: TRAY_ICON_SIZE });
}

function iconKeyForPhase(phase, present) {
  if (phase === "offline") return "offline";
  if (phase === "locked" || phase === "boot") return "locked";
  if (phase === "unlocked" && present === false) return "warn";
  if (phase === "unlocked") return "active";
  return "locked";
}

function iconForPhase(phase, present) {
  return trayIcons[iconKeyForPhase(phase, present)] || trayIcons.locked;
}

function formatTrayTime(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

/** Status para o menu (sem tempo / presença — evita rebuild). */
function menuStatusFromPayload(payload) {
  const phase = payload?.phase || "boot";
  const name = payload?.name || "VIP";
  const isAdmin = name === "Admin" || payload?.mode === "admin";

  if (phase === "offline") return "Sem conexão com o servidor";
  if (phase === "locked" || phase === "boot") return "Aguardando VIP";
  if (phase === "unlocked") return isAdmin ? "Admin · liberado" : `Sessão · ${name}`;
  return "GeekLock";
}

function tooltipFromPayload(payload) {
  const phase = payload?.phase || "boot";
  const name = payload?.name || "VIP";
  const elapsed = formatTrayTime(payload?.elapsed);
  const present = payload?.present !== false;
  const absentLeft = payload?.absentLeft;
  const bal = payload?.balanceSeconds;
  const balTxt = bal != null ? formatTrayTime(bal) : null;
  const isAdmin = name === "Admin" || payload?.mode === "admin";

  if (phase === "offline") return "GeekLock — Sem conexão com o servidor";
  if (phase === "locked" || phase === "boot") return "GeekLock — Aguardando VIP";
  if (phase === "unlocked") {
    if (isAdmin) {
      const leftTxt = balTxt || elapsed;
      return leftTxt
        ? `GeekLock — Equipe · resta ${leftTxt}`
        : "GeekLock — Equipe · liberado sem conta";
    }
    const balPart = balTxt ? ` · resta ${balTxt}` : "";
    if (payload?.lowBalanceWarn) return `GeekLock — ${name}${balPart} · SALDO BAIXO`;
    if (!present) {
      if (absentLeft != null && absentLeft > 0) {
        return `GeekLock — ${name}${balPart} · AUSENTE · trava em ${absentLeft}s`;
      }
      return `GeekLock — ${name}${balPart} · ausente`;
    }
    return `GeekLock — ${name}${balPart} · presente · sessão ativa`;
  }
  return "GeekLock VIP";
}

function menuKeyFromPayload(payload) {
  const phase = payload?.phase || "boot";
  if (phase === "unlocked") {
    const bal = payload?.balanceSeconds;
    const absentLeft = payload?.absentLeft;
    const present = payload?.present !== false ? "1" : "0";
    return `unlocked|${present}|${absentLeft ?? ""}|${bal ?? ""}`;
  }
  return phase;
}

function promptEndSession() {
  void (async () => {
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
    const phase = lastTrayPayload?.phase;
    if (phase !== "unlocked") {
      if (win) {
        win.show();
        win.focus();
      }
      return;
    }
    const isAdmin = lastTrayPayload?.mode === "admin" || lastTrayPayload?.name === "Admin";
    const { response } = await dialog.showMessageBox(win, {
      type: "warning",
      buttons: ["Continuar sessão", "Encerrar sessão"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      title: "Encerrar sessão",
      message: isAdmin
        ? "Travar a estação e voltar ao reconhecimento facial?"
        : "Antes de encerrar, faça logout do Steam e do Discord se a conta não for sua.",
      detail: isAdmin
        ? "O modo Admin será encerrado."
        : "Confirme só depois de sair das contas. A tela de reconhecimento volta em seguida.",
    });
    if (response === 1 && win) {
      win.webContents.send("session:request-end-confirmed");
    }
  })();
}

function buildTrayMenu(payload) {
  const phase = payload?.phase || "boot";
  const unlocked = phase === "unlocked";
  const name = payload?.name || "VIP";
  const elapsed = formatTrayTime(payload?.elapsed);
  const bal = payload?.balanceSeconds;
  const balTxt = bal != null ? formatTrayTime(bal) : null;

  if (unlocked) {
    const isAdmin = name === "Admin" || payload?.mode === "admin";
    const displayName = isAdmin ? "Equipe" : name;
    const absentLeft = payload?.absentLeft;
    const present = payload?.present !== false;
    const balTxt = bal != null ? formatTrayTime(bal) : null;
    const restaPart = balTxt != null ? `resta ${balTxt}` : elapsed;
    let statusLine;
    if (isAdmin) {
      statusLine = `${restaPart} · sem conta`;
    } else if (!present) {
      statusLine =
        absentLeft != null && absentLeft > 0
          ? `${restaPart} · ausente · trava em ${absentLeft}s`
          : `${restaPart} · ausente`;
    } else {
      statusLine = restaPart;
    }
    return Menu.buildFromTemplate([
      {
        label: `${displayName} — ${statusLine}`,
        enabled: false,
      },
      { type: "separator" },
      {
        label: "Encerrar sessão",
        click: () => promptEndSession(),
      },
    ]);
  }

  const status = menuStatusFromPayload(payload);
  return Menu.buildFromTemplate([
    {
      label: `GeekLock — ${status}`,
      enabled: false,
    },
  ]);
}

function applyTrayUpdate(payload) {
  if (!tray) return;
  lastTrayPayload = payload || {};
  const phase = lastTrayPayload.phase || "boot";
  const present = lastTrayPayload.present !== false;

  const iconKey = iconKeyForPhase(phase, present);
  if (iconKey !== lastIconKey) {
    lastIconKey = iconKey;
    tray.setImage(iconForPhase(phase, present));
  }

  const tip = tooltipFromPayload(lastTrayPayload);
  const balKey =
    lastTrayPayload.balanceSeconds != null ? Math.floor(Number(lastTrayPayload.balanceSeconds)) : "";
  const tipKey = `${phase}|${lastTrayPayload.name || ""}|${present}|${lastTrayPayload.absentLeft ?? ""}|${balKey}`;
  const now = Date.now();
  const tipStatusChanged = tipKey !== lastTipKey;
  const tipTimeDue = tip !== lastTooltip && now - lastTooltipAt >= TOOLTIP_MIN_MS;
  if (tipStatusChanged || tipTimeDue) {
    lastTipKey = tipKey;
    lastTooltip = tip;
    lastTooltipAt = now;
    tray.setToolTip(tip);
  }

  const menuKey = menuKeyFromPayload(lastTrayPayload);
  // Menu com relógio: atualiza a cada tick quando sessão ativa
  const menuDue =
    lastTrayPayload.phase === "unlocked" ||
    menuKey !== lastMenuKey;
  if (menuDue) {
    lastMenuKey = menuKey;
    tray.setContextMenu(buildTrayMenu(lastTrayPayload));
  }

  if (phase === "unlocked") {
    const isAdmin = lastTrayPayload.name === "Admin" || lastTrayPayload.mode === "admin";
    sessionHud.show({
      name: isAdmin ? "Equipe" : lastTrayPayload.name,
      mode: isAdmin ? "admin" : lastTrayPayload.mode,
      elapsed: lastTrayPayload.elapsed,
      present,
      absentLeft: lastTrayPayload.absentLeft,
      balanceSeconds: lastTrayPayload.balanceSeconds,
      lowBalanceWarn: lastTrayPayload.lowBalanceWarn,
      billingPaused: lastTrayPayload.billingPaused,
      softLock:
        lastTrayPayload.absentLeft != null &&
        lastTrayPayload.absentLeft > 0 &&
        lastTrayPayload.absentLeft <= 15,
    });
  } else {
    sessionHud.hide();
  }
}

function showLoadErrorPage(win) {
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>GeekLock</title>
  <style>
    body { margin:0; min-height:100vh; display:grid; place-items:center;
      font-family:system-ui,sans-serif; color:#eef2f8;
      background:linear-gradient(160deg,#060f1f,#0c1e3d); }
    .box { max-width:480px; padding:2rem; border:1px solid rgba(255,255,255,.1);
      border-radius:14px; background:rgba(12,30,61,.45); backdrop-filter:blur(12px);
      text-align:center; box-shadow:0 12px 40px rgba(0,0,0,.28); }
    h1 { margin:0 0 0.5rem; color:#2dd4bf; }
    p { color:#8fa4c4; line-height:1.5; }
    kbd { background:rgba(255,255,255,.08); padding:0.15rem 0.4rem; border-radius:4px; }
  </style>
</head>
<body>
  <div class="box">
    <h1>GeekLock</h1>
    <p>Não foi possível carregar a interface.</p>
    <p>Use <kbd>Ctrl+Shift+R</kbd> para atualizar a página,<br/>
    ou peça no GeekCentral: Encerrar app / Reload.<br/>
    <code>bash scripts/linux-loja.sh geeklock</code></p>
  </div>
</body>
</html>`;
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

function loadApp(win) {
  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(DIST_INDEX);
  }
}

function setupLoadFallback(win) {
  win.webContents.on("did-fail-load", (_event, errorCode, _desc, _url, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    if (isDev && !loadFallbackAttempted) {
      loadFallbackAttempted = true;
      win.loadFile(DIST_INDEX);
      return;
    }
    showLoadErrorPage(win);
  });
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
}

function quitAppFromCentral() {
  app.isQuitting = true;
  app.quit();
}

function reloadAppPage() {
  focusMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  loadFallbackAttempted = false;
  mainWindow.webContents.reloadIgnoringCache();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    show: false,
    autoHideMenuBar: true,
    fullscreen: false,
    alwaysOnTop: false,
    skipTaskbar: true,
    backgroundColor: "#060f1f",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.setSkipTaskbar(true);
  setupLoadFallback(mainWindow);
  loadApp(mainWindow);

  mainWindow.once("ready-to-show", () => {
    lock.lock();
  });

  mainWindow.on("close", (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.webContents.send("session:request-lock");
    }
  });
}

function createTray() {
  trayIcons.locked = loadTrayIcon("tray-locked.png");
  trayIcons.active = loadTrayIcon("tray-active.png");
  trayIcons.warn = loadTrayIcon("tray-warn.png");
  trayIcons.offline = loadTrayIcon("tray-offline.png");

  tray = new Tray(trayIcons.locked);
  lastTrayPayload = { phase: "boot" };
  lastMenuKey = menuKeyFromPayload(lastTrayPayload);
  lastIconKey = "locked";
  lastTooltip = tooltipFromPayload(lastTrayPayload);
  lastTooltipAt = Date.now();
  tray.setToolTip(lastTooltip);
  tray.setContextMenu(buildTrayMenu(lastTrayPayload));
  tray.on("click", () => promptEndSession());
}

function registerShortcut(accelerators, handler, label) {
  for (const accel of accelerators) {
    try {
      const ok = globalShortcut.register(accel, handler);
      if (ok) {
        debug.log(`atalho ${label}: ${accel}`);
        return true;
      }
    } catch (err) {
      debug.warn(`falha ao registrar ${accel}:`, err);
    }
  }
  debug.warn(`não foi possível registrar ${label} — use o menu da bandeja`);
  return false;
}

function registerAppShortcuts() {
  registerShortcut(
    ["Control+Shift+R", "CommandOrControl+Shift+R"],
    () => reloadAppPage(),
    "reload",
  );
}

if (gotSingleInstanceLock) {
  app.on("second-instance", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    // Mesmo caminho do F11/bandeja: renderer pinta reconhecimento antes do overlay
    mainWindow.webContents.send("session:request-lock");
  });
}

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return;

  // Linux: autostart só via XDG (.desktop). Evita 3º launcher.
  if (!isLinux) {
    try {
      app.setLoginItemSettings({
        openAtLogin: true,
        openAsHidden: true,
        name: "GeekLock",
        path: process.execPath,
        args: isDev ? [] : [path.join(__dirname, "..")],
      });
    } catch (err) {
      debug.warn("setLoginItemSettings:", err);
    }
  }

  if (app.dock?.hide) {
    try {
      app.dock.hide();
    } catch {
      /* ignore */
    }
  }

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

  try {
    const { setupAutoUpdate } = require("./auto-update.cjs");
    setupAutoUpdate(debug);
  } catch {
    /* ignore */
  }

  // Não chama lock.lock() direto: na fase unlocked a UI é tela “vazia” e
  // aparecer fullscreen antes do React pintar o reconhecimento = tela preta.
  globalShortcut.register("F11", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send("session:request-lock");
  });

  registerAppShortcuts();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  app.isQuitting = true;
  sessionHud.destroy();
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

ipcMain.handle("config:save", (_e, partial) => {
  return saveConfig(partial || {});
});

/** @type {ReturnType<typeof startListener> | null} */
let discovery = null;

ipcMain.handle("discovery:start", () => {
  if (discovery) {
    return { ok: true, peers: discovery.getPeers() };
  }
  discovery = startListener(() => {
    // peers atualizados sob demanda via discovery:peers
  });
  return { ok: true, peers: [] };
});

ipcMain.handle("discovery:peers", () => {
  if (!discovery) return [];
  return discovery.getPeers();
});

ipcMain.handle("discovery:stop", () => {
  if (discovery) {
    discovery.stop();
    discovery = null;
  }
  return { ok: true };
});

ipcMain.handle("lock:lock", async () => {
  await lock.lock();
  return { locked: true };
});

ipcMain.handle("lock:unlock", () => {
  lock.unlock();
  return { locked: false };
});

ipcMain.handle("app:quit-central", () => {
  quitAppFromCentral();
  return { ok: true };
});

ipcMain.handle("failure:get", () => readLastFailure());
ipcMain.handle("failure:clear", () => {
  clearLastFailure();
  return { ok: true };
});
ipcMain.handle("failure:write", (_e, payload) => {
  writeLastFailure(payload?.kind || "app", payload?.message || "");
  return { ok: true };
});

ipcMain.handle("app:version", () => {
  try {
    const { currentVersion } = require("./lock-update.cjs");
    return currentVersion();
  } catch {
    return app.getVersion();
  }
});

ipcMain.handle("lock:apply-update", async () => {
  const cfg = loadConfig();
  const { downloadAndInstall } = require("./lock-update.cjs");
  const result = await downloadAndInstall(cfg.serverUrl, cfg.stationToken, debug);
  if (result.ok && result.willRelaunch) {
    setTimeout(() => {
      app.isQuitting = true;
      app.quit();
    }, 800);
  }
  return result;
});

const { collectHardware, collectLoadSample } = require("./hardware.cjs");
ipcMain.handle("hw:inventory", async () => collectHardware());
ipcMain.handle("hw:sample", async (_e, opts) => collectLoadSample(opts || {}));

ipcMain.on("tray:update", (_e, payload) => {
  applyTrayUpdate(payload);
});
