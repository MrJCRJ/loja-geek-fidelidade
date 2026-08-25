/**
 * ILockController — abstração para migrar depois ao login Windows (modo B).
 * Travado: overlay Electron fullscreen (todos os workspaces no Linux).
 * Liberado: janela oculta — status só na bandeja (estilo Steam).
 */
const isLinux = process.platform === "linux";

class OverlayLockController {
  constructor(getWindow) {
    this.getWindow = getWindow;
    /** @type {ReturnType<typeof setTimeout> | null} */
    this.blurTimer = null;
    this.onBlur = this.onBlur.bind(this);
  }

  attachBlurGuard(win) {
    if (!isLinux || !win || win.isDestroyed()) return;
    win.removeListener("blur", this.onBlur);
    win.on("blur", this.onBlur);
  }

  detachBlurGuard(win) {
    if (!win || win.isDestroyed()) return;
    win.removeListener("blur", this.onBlur);
    if (this.blurTimer) {
      clearTimeout(this.blurTimer);
      this.blurTimer = null;
    }
  }

  onBlur() {
    const win = this.getWindow();
    if (!win || win.isDestroyed() || !this.isLocked()) return;
    if (!win.isVisible()) return;
    if (this.blurTimer) clearTimeout(this.blurTimer);
    this.blurTimer = setTimeout(() => {
      this.blurTimer = null;
      if (!win.isDestroyed() && this.isLocked() && win.isVisible()) {
        win.focus();
      }
    }, 150);
  }

  lock() {
    const win = this.getWindow();
    if (!win || win.isDestroyed()) return;
    win.setResizable(true);
    win.setAlwaysOnTop(true, "screen-saver");
    if (isLinux) {
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }
    win.setFullScreen(true);
    win.setSkipTaskbar(true);
    win.show();
    win.focus();
    this.attachBlurGuard(win);
    win.webContents.send("lock:state", { locked: true });
  }

  unlock() {
    const win = this.getWindow();
    if (!win || win.isDestroyed()) return;

    this.detachBlurGuard(win);
    win.setAlwaysOnTop(false);
    if (isLinux) {
      win.setVisibleOnAllWorkspaces(false);
    }
    win.setFullScreen(false);
    win.setSkipTaskbar(true);
    win.hide();
    win.webContents.send("lock:state", { locked: false });
  }

  isLocked() {
    const win = this.getWindow();
    if (!win || win.isDestroyed()) return true;
    return win.isFullScreen();
  }
}

module.exports = { OverlayLockController };
