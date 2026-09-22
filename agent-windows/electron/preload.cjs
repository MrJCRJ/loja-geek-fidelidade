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
  quitWithPin: (pin) => ipcRenderer.invoke("app:quit", pin),
  staffUnlock: (pin) => ipcRenderer.invoke("staff:unlock", pin),
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
  onRequestQuit: (cb) => {
    const handler = () => cb();
    ipcRenderer.on("staff:request-quit", handler);
    return () => ipcRenderer.removeListener("staff:request-quit", handler);
  },
  onRequestStaffPin: (cb) => {
    const handler = () => cb();
    ipcRenderer.on("staff:request-pin", handler);
    return () => ipcRenderer.removeListener("staff:request-pin", handler);
  },
  onRequestLock: (cb) => {
    const handler = () => cb();
    ipcRenderer.on("session:request-lock", handler);
    return () => ipcRenderer.removeListener("session:request-lock", handler);
  },
  updateTray: (payload) => ipcRenderer.send("tray:update", payload),
});
