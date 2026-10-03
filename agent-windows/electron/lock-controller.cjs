/**
 * ILockController — abstração para migrar depois ao login Windows (modo B).
 * Travado: kiosk Electron tela cheia (sem bordas) + harden OS (atalhos/USB/TaskMgr).
 * Liberado: janela oculta (hide); USB storage liberado; teclado/mouse do jogo.
 */
const isLinux = process.platform === "linux";
const isWin = process.platform === "win32";
const { applyOsHarden, unregisterLockShortcuts } = require("./os-harden.cjs");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class OverlayLockController {
  constructor(getWindow) {
    this.getWindow = getWindow;
    /** @type {ReturnType<typeof setTimeout> | null} */
    this.blurTimer = null;
    /** @type {boolean} */
    this._locked = true;
    this.onBlur = this.onBlur.bind(this);
    this.onMinimize = this.onMinimize.bind(this);
  }

  attachBlurGuard(win) {
    if (!win || win.isDestroyed()) return;
    win.removeListener("blur", this.onBlur);
    win.on("blur", this.onBlur);
    win.removeListener("minimize", this.onMinimize);
    win.on("minimize", this.onMinimize);
  }

  detachBlurGuard(win) {
    if (!win || win.isDestroyed()) return;
    win.removeListener("blur", this.onBlur);
    win.removeListener("minimize", this.onMinimize);
    if (this.blurTimer) {
      clearTimeout(this.blurTimer);
      this.blurTimer = null;
    }
  }

  onMinimize(e) {
    if (!this.isLocked()) return;
    try {
      e.preventDefault();
    } catch {
      /* ignore */
    }
    const win = this.getWindow();
    if (!win || win.isDestroyed()) return;
    try {
      win.restore();
      win.setFullScreen(true);
      if (isWin && typeof win.setKiosk === "function") win.setKiosk(true);
      win.focus();
    } catch {
      /* ignore */
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
        try {
          win.setAlwaysOnTop(true, "screen-saver");
        } catch {
          /* ignore */
        }
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

  refocusShortcut() {
    const win = this.getWindow();
    if (!win || win.isDestroyed() || !this.isLocked()) return;
    try {
      win.show();
      win.focus();
      win.setAlwaysOnTop(true, "screen-saver");
      if (isWin && typeof win.setKiosk === "function") win.setKiosk(true);
      else win.setFullScreen(true);
    } catch {
      /* ignore */
    }
  }

  async lockAsync() {
    const win = this.getWindow();
    if (!win || win.isDestroyed()) return;

    this._locked = true;

    try {
      win.setIgnoreMouseEvents(false);
      win.setOpacity(1);
      win.setMinimizable(false);
      win.setMaximizable(false);
      if (typeof win.setClosable === "function") win.setClosable(false);
    } catch {
      /* ignore */
    }

    const wasHidden = !win.isVisible() || (!win.isFullScreen() && !(isWin && win.isKiosk && win.isKiosk()));

    if (wasHidden) {
      try {
        if (isWin && typeof win.setKiosk === "function") win.setKiosk(false);
        win.setAlwaysOnTop(false);
        win.setFullScreen(false);
      } catch {
        /* ignore */
      }
      if (isLinux) {
        win.setVisibleOnAllWorkspaces(false);
      }
      win.setSkipTaskbar(true);
      win.show();
      this.prepareRendererPaint(win);
      await delay(120);
    }

    win.setResizable(false);
    win.setAlwaysOnTop(true, "screen-saver");
    if (isLinux) {
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }
    try {
      if (isWin && typeof win.setKiosk === "function") {
        win.setKiosk(true);
      } else {
        win.setFullScreen(true);
      }
    } catch {
      win.setFullScreen(true);
    }
    win.setSkipTaskbar(true);
    win.show();
    win.focus();
    this.attachBlurGuard(win);
    this.forcePaint(win);

    await applyOsHarden(true, { onShortcut: () => this.refocusShortcut() });

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

    this._locked = false;
    this.detachBlurGuard(win);
    unregisterLockShortcuts();
    void applyOsHarden(false);

    try {
      if (isWin && typeof win.setKiosk === "function") win.setKiosk(false);
      win.setAlwaysOnTop(false);
      win.setFullScreen(false);
      win.setMinimizable(true);
      win.setMaximizable(true);
      if (typeof win.setClosable === "function") win.setClosable(true);
      win.setResizable(true);
    } catch {
      /* ignore */
    }
    if (isLinux) {
      win.setVisibleOnAllWorkspaces(false);
    }
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
    return this._locked;
  }
}

module.exports = { OverlayLockController };
