const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("geekcentral", {
  getStatus: () => ipcRenderer.invoke("central:get-status"),
  restart: () => ipcRenderer.invoke("central:restart"),
  openAdmin: () => ipcRenderer.invoke("central:open-admin"),
  openUrl: (url) => ipcRenderer.invoke("central:open-url", url),
  onStatus: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("central:status", handler);
    return () => ipcRenderer.removeListener("central:status", handler);
  },
});
