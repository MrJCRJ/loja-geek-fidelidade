const { createElectronDebug } = require("./debug.cjs");
const { app, ipcMain, shell, Tray, Menu, nativeImage } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { ServiceManager, isDev } = require("./services.cjs");
const { ensureApiFirewallRule } = require("./firewall.cjs");
const { createWindowsShortcuts, removeWindowsShortcuts } = require("./shortcuts.cjs");

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

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

function openGeekAdmin() {
  const local = `http://127.0.0.1:${services.status.apiPort || 8787}/admin`;
  shell.openExternal(shopAdminUrl()).catch(() => shell.openExternal(local));
}

function updateTrayTooltip(status) {
  if (!tray) return;
  const phase = status?.phase || "…";
  const api = status?.api ? "API ok" : "API off";
  const face = status?.face ? "Face ok" : "Face off";
  tray.setToolTip(`GeekCentral — ${phase} · ${api} · ${face}`);
}

function shopAdminUrl() {
  return "https://loja.geekloja.com.br/admin";
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: "Abrir GeekAdmin", click: () => openGeekAdmin() },
    {
      label: "Atualizar agora",
      click: () => {
        runInstallUpdate().catch((err) => debug.warn("update:", err));
      },
    },
    { type: "separator" },
    {
      label: "Reiniciar serviços",
      click: async () => {
        try {
          await services.start({ skipBootDelay: true });
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
  tray.on("double-click", () => openGeekAdmin());
  tray.on("click", () => {
    if (isWin) openGeekAdmin();
  });
}

function ensureHeadlessSetup() {
  const peek = services.peekSetup();
  if (!peek.needsSetup) return peek;
  const pwd = crypto.randomBytes(12).toString("base64url");
  const dataDir = services.dataDir();
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(
    path.join(dataDir, "SENHA-INICIAL.txt"),
    `Senha admin gerada (troque no GeekAdmin):\n${pwd}\n`,
    "utf8",
  );
  services.completeSetup({
    adminPassword: pwd,
    jwtSecret: peek.suggestedJwt,
    stationSharedSecret: peek.suggestedStation,
    unitName: peek.unitName || "Unidade 1",
  });
  return services.peekSetup();
}

if (gotSingleInstanceLock) {
  app.on("second-instance", () => openGeekAdmin());
}

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return;

  services.onChange = (status) => updateTrayTooltip(status);

  let peek = ensureHeadlessSetup();
  const openAtLogin = peek.openAtLogin !== false;
  if (!isLinux) {
    applyLoginItem(openAtLogin && peek.setupComplete);
  }

  createTray();

  try {
    const { setupAutoUpdate } = require("./auto-update.cjs");
    setupAutoUpdate(console);
  } catch {
    /* ignore */
  }

  try {
    if (!peek.firewallRuleDone && isWin && peek.setupComplete) {
      const fw = await ensureApiFirewallRule(peek.apiPort || 8787);
      services.markFirewallAttempt(fw);
    }
    await services.start({ fromBoot: peek.setupComplete });
    watchPhoneUpdateRequest();
  } catch (err) {
    services.status.phase = "error";
    services.status.error = err instanceof Error ? err.message : String(err);
    services.emit();
  }
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

ipcMain.handle("central:open-admin", async () => {
  openGeekAdmin();
  return { ok: true, url: shopAdminUrl() };
});

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

ipcMain.handle("central:get-ui-compact", () => ({
  uiCompact: services.getUiCompact(),
}));

ipcMain.handle("central:set-ui-compact", (_e, enabled) => ({
  ok: true,
  uiCompact: services.setUiCompact(Boolean(enabled)),
}));

ipcMain.handle("central:get-update-info", () => {
  const { currentVersion } = require("./github-update.cjs");
  return {
    currentVersion: currentVersion(),
    hasGithubToken: Boolean(services.getGithubUpdateToken()),
  };
});

ipcMain.handle("central:set-github-token", (_e, token) => services.setGithubUpdateToken(token));

ipcMain.handle("central:check-update", async () => {
  try {
    const { checkForUpdate } = require("./github-update.cjs");
    return await checkForUpdate(services.getGithubUpdateToken());
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

async function runInstallUpdate() {
  const { checkForUpdate, downloadAndInstall } = require("./github-update.cjs");
  const token = services.getGithubUpdateToken();
  const info = await checkForUpdate(token);
  if (!info.ok) return info;
  if (!info.updateAvailable) {
    return { ok: false, error: "Já está na versão mais recente", ...info };
  }
  services.stopWatchdog();
  services.stop();
  const result = await downloadAndInstall(token, info, { log: console });
  setTimeout(() => {
    const { app } = require("electron");
    app.quit();
  }, 400);
  return result;
}

ipcMain.handle("central:install-update", async () => {
  try {
    return await runInstallUpdate();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

function watchPhoneUpdateRequest() {
  const f = path.join(services.dataDir(), "update-request.json");
  setInterval(() => {
    if (!fs.existsSync(f)) return;
    let req = {};
    try {
      req = JSON.parse(fs.readFileSync(f, "utf8"));
    } catch {
      return;
    }
    if (req.action !== "install") return;
    try {
      fs.unlinkSync(f);
    } catch {
      /* ignore */
    }
    runInstallUpdate().catch((err) => {
      console.error("[update] pedido do celular falhou:", err);
    });
  }, 2000);
}

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
