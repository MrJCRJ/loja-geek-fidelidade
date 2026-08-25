const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("geeklock", {
  getConfig: () => ipcRenderer.invoke("config:get"),
  saveToken: (token) => ipcRenderer.invoke("config:save-token", token),
  lock: () => ipcRenderer.invoke("lock:lock"),
  unlock: () => ipcRenderer.invoke("lock:unlock"),
  quitWithPin: (pin) => ipcRenderer.invoke("app:quit", pin),
  staffUnlock: (pin) => ipcRenderer.invoke("staff:unlock", pin),
  onLockState: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("lock:state", handler);
    return () => ipcRenderer.removeListener("lock:state", handler);
  },
  onRequestEndSession: (cb) => {
    const handler = () => cb();
    ipcRenderer.on("session:request-end", handler);
    return () => ipcRenderer.removeListener("session:request-end", handler);
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
