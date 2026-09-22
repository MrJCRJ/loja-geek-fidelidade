const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("geekcentral", {
  getStatus: () => ipcRenderer.invoke("central:get-status"),
  peekSetup: () => ipcRenderer.invoke("central:peek-setup"),
  completeSetup: (input) => ipcRenderer.invoke("central:complete-setup", input),
  restart: () => ipcRenderer.invoke("central:restart"),
  openAdmin: () => ipcRenderer.invoke("central:open-admin"),
  openUrl: (url) => ipcRenderer.invoke("central:open-url", url),
  getAutostart: () => ipcRenderer.invoke("central:get-autostart"),
  setAutostart: (enabled) => ipcRenderer.invoke("central:set-autostart", enabled),
  getUiCompact: () => ipcRenderer.invoke("central:get-ui-compact"),
  setUiCompact: (enabled) => ipcRenderer.invoke("central:set-ui-compact", enabled),
  getUpdateInfo: () => ipcRenderer.invoke("central:get-update-info"),
  setGithubToken: (token) => ipcRenderer.invoke("central:set-github-token", token),
  checkUpdate: () => ipcRenderer.invoke("central:check-update"),
  installUpdate: () => ipcRenderer.invoke("central:install-update"),
  ensureFirewall: () => ipcRenderer.invoke("central:ensure-firewall"),
  setTunnel: (input) => ipcRenderer.invoke("central:set-tunnel", input),
  checkTunnel: () => ipcRenderer.invoke("central:check-tunnel"),
  qr: (text) => ipcRenderer.invoke("central:qr", text),
  createShortcuts: () => ipcRenderer.invoke("central:create-shortcuts"),
  uninstallLocal: (opts) => ipcRenderer.invoke("central:uninstall-local", opts),
  onStatus: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("central:status", handler);
    return () => ipcRenderer.removeListener("central:status", handler);
  },
});
