const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("geekAdminShell", {
  isElectron: true,
});
