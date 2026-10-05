const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("geeklock", {
  getConfig: () => ipcRenderer.invoke("config:get"),
  saveToken: (token) => ipcRenderer.invoke("config:save-token", token),
  saveConfig: (partial) => ipcRenderer.invoke("config:save", partial),
  startDiscovery: () => ipcRenderer.invoke("discovery:start"),
  getDiscoveryPeers: () => ipcRenderer.invoke("discovery:peers"),
  stopDiscovery: () => ipcRenderer.invoke("discovery:stop"),
  lock: () => ipcRenderer.invoke("lock:lock"),
  unlock: () => ipcRenderer.invoke("lock:unlock"),
  quitFromCentral: () => ipcRenderer.invoke("app:quit-central"),
  powerFromCentral: (kind) => ipcRenderer.invoke("app:power", kind),
  getLastFailure: () => ipcRenderer.invoke("failure:get"),
  clearLastFailure: () => ipcRenderer.invoke("failure:clear"),
  writeLastFailure: (payload) => ipcRenderer.invoke("failure:write", payload),
  onLockState: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("lock:state", handler);
    return () => ipcRenderer.removeListener("lock:state", handler);
  },
  onRequestEndSessionConfirmed: (cb) => {
    const handler = () => cb();
    ipcRenderer.on("session:request-end-confirmed", handler);
    return () => ipcRenderer.removeListener("session:request-end-confirmed", handler);
  },
  onRequestLock: (cb) => {
    const handler = () => cb();
    ipcRenderer.on("session:request-lock", handler);
    return () => ipcRenderer.removeListener("session:request-lock", handler);
  },
  updateTray: (payload) => ipcRenderer.send("tray:update", payload),
  getAppVersion: () => ipcRenderer.invoke("app:version"),
  applyLockUpdate: () => ipcRenderer.invoke("lock:apply-update"),
  collectHardware: () => ipcRenderer.invoke("hw:inventory"),
  collectLoadSample: (opts) => ipcRenderer.invoke("hw:sample", opts || {}),
  collectHealth: () => ipcRenderer.invoke("hw:health"),
});
