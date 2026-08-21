/**
 * ILockController — abstração para migrar depois ao login Windows (modo B).
 * Hoje: overlay Electron fullscreen.
 */
class OverlayLockController {
  constructor(getWindow) {
    this.getWindow = getWindow;
  }

  lock() {
    const win = this.getWindow();
    if (!win || win.isDestroyed()) return;
    win.setAlwaysOnTop(true, "screen-saver");
    win.setFullScreen(true);
    win.setSkipTaskbar(false);
    win.show();
    win.focus();
    win.webContents.send("lock:state", { locked: true });
  }

  unlock() {
    const win = this.getWindow();
    if (!win || win.isDestroyed()) return;
    win.setFullScreen(false);
    win.setAlwaysOnTop(false);
    win.minimize();
    win.webContents.send("lock:state", { locked: false });
  }

  isLocked() {
    const win = this.getWindow();
    if (!win || win.isDestroyed()) return true;
    return win.isFullScreen() || win.isAlwaysOnTop();
  }
}

module.exports = { OverlayLockController };
