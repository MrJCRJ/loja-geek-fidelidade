const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("node:path");
const { ServiceManager, isDev } = require("./services.cjs");

/** @type {BrowserWindow | null} */
let mainWindow = null;
const services = new ServiceManager(app);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 920,
    height: 720,
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  services.onChange = (status) => {
    mainWindow?.webContents.send("central:status", status);
  };

  if (isDev() && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  createWindow();
  try {
    await services.start();
  } catch (err) {
    services.status.phase = "error";
    services.status.error = err instanceof Error ? err.message : String(err);
    services.emit();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  services.stop();
});

app.on("window-all-closed", () => {
  services.stop();
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("central:get-status", () => ({ ...services.status }));

ipcMain.handle("central:restart", async () => {
  try {
    await services.start();
    return { ok: true, status: { ...services.status } };
  } catch (err) {
    services.status.phase = "error";
    services.status.error = err instanceof Error ? err.message : String(err);
    services.emit();
    return { ok: false, error: services.status.error, status: { ...services.status } };
  }
});

ipcMain.handle("central:open-admin", async () => {
  const url = `http://127.0.0.1:${services.status.apiPort}/admin`;
  await shell.openExternal(url);
  return { ok: true, url };
});

ipcMain.handle("central:open-url", async (_e, url) => {
  await shell.openExternal(String(url));
  return { ok: true };
});
