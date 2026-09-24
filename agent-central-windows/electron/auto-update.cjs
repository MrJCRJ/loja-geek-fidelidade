/**
 * Auto-update via GitHub Releases (electron-updater).
 * Só roda em app empacotado. Build NSIS + publish github para funcionar de verdade.
 */
const { app } = require("electron");

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

  autoUpdater.on("update-available", () => undefined);
  autoUpdater.on("update-downloaded", () => undefined);

  autoUpdater.on("error", (err) => {
    log.warn?.("[auto-update]", err?.message || err);
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => log.warn?.("[auto-update] check:", err));
  }, 25_000);
}

module.exports = { setupAutoUpdate };
