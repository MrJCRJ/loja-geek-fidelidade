/**
 * ILockController — abstração para migrar depois ao login Windows (modo B).
 * Travado: overlay Electron fullscreen (todos os workspaces no Linux).
 * Liberado: janela oculta (hide). Ao re-travar: mostra janela normal, pinta, depois fullscreen.
 */
const isLinux = process.platform === "linux";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

  /** Força o compositor a redesenhar após show/fullscreen. */
  forcePaint(win) {
    if (!win || win.isDestroyed()) return;
    try {
      win.webContents.invalidate();
    } catch {
      /* ignore */
    }
    try {
      win.webContents
        .executeJavaScript("void(document.body && document.body.offsetHeight);0", true)
        .catch(() => undefined);
    } catch {
      /* ignore */
    }
  }

  /** Pede ao renderer pintar LockedScreen antes do overlay fullscreen. */
  prepareRendererPaint(win) {
    if (!win || win.isDestroyed()) return;
    win.webContents.send("lock:state", { locked: true, paint: true, prepare: true });
    this.forcePaint(win);
  }

  async lockAsync() {
    const win = this.getWindow();
    if (!win || win.isDestroyed()) return;

    try {
      win.setIgnoreMouseEvents(false);
      win.setOpacity(1);
    } catch {
      /* ignore */
    }

    const wasHidden = !win.isVisible() || !win.isFullScreen();

    if (wasHidden) {
      win.setAlwaysOnTop(false);
      win.setFullScreen(false);
      if (isLinux) {
        win.setVisibleOnAllWorkspaces(false);
      }
      win.setSkipTaskbar(true);
      win.show();
      this.prepareRendererPaint(win);
      await delay(120);
    }

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
    this.forcePaint(win);

    await delay(50);
    if (win.isDestroyed()) return;
    this.forcePaint(win);
    win.webContents.send("lock:state", { locked: true, paint: true });
  }

  lock() {
    return this.lockAsync();
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
    try {
      win.setOpacity(1);
      win.setIgnoreMouseEvents(false);
    } catch {
      /* ignore */
    }
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
