/**
 * Auto-update via GitHub Releases (electron-updater).
 * Só roda em app empacotado. Build NSIS + publish github para funcionar de verdade.
 */
const { app, dialog } = require("electron");

function setupAutoUpdate(log = console) {
  if (!app.isPackaged) return;

  let autoUpdater;
  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch (err) {
    log.warn?.("[auto-update] electron-updater ausente:", err);
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    dialog
      .showMessageBox({
        type: "info",
        title: "Atualização disponível",
        message: `Versão ${info.version} pronta para baixar.`,
        buttons: ["Baixar agora", "Depois"],
        defaultId: 0,
        cancelId: 1,
      })
      .then((r) => {
        if (r.response === 0) autoUpdater.downloadUpdate().catch(() => undefined);
      })
      .catch(() => undefined);
  });

  autoUpdater.on("update-downloaded", () => {
    dialog
      .showMessageBox({
        type: "info",
        title: "Atualização pronta",
        message: "Reinicie o app para instalar.",
        buttons: ["Reiniciar agora", "Na próxima abertura"],
        defaultId: 0,
        cancelId: 1,
      })
      .then((r) => {
        if (r.response === 0) autoUpdater.quitAndInstall();
      })
      .catch(() => undefined);
  });

  autoUpdater.on("error", (err) => {
    log.warn?.("[auto-update]", err?.message || err);
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => log.warn?.("[auto-update] check:", err));
  }, 20_000);
}

module.exports = { setupAutoUpdate };
