/**
 * Mini-HUD de sessão — canto, bem transparente; legível no hover.
 * Mostra saldo restante, aviso de fim e pausa de cobrança (ausência).
 */
const { BrowserWindow, screen } = require("electron");

const HUD_W = 300;
const HUD_H = 52;

class SessionHud {
  constructor() {
    /** @type {BrowserWindow | null} */
    this.win = null;
  }

  ensure() {
    if (this.win && !this.win.isDestroyed()) return this.win;

    this.win = new BrowserWindow({
      width: HUD_W,
      height: HUD_H,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: true,
      alwaysOnTop: true,
      hasShadow: false,
      backgroundColor: "#00000000",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    this.win.setAlwaysOnTop(true, "floating");
    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.positionBottomRight();

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: transparent; }
  #bar {
    box-sizing: border-box;
    height: 100%;
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0 0.7rem;
    border-radius: 10px;
    background: rgba(15, 17, 21, 0.28);
    border: 1px solid rgba(42, 51, 68, 0.35);
    color: #f4f1ea;
    font: 600 12px/1.2 system-ui, "Segoe UI", sans-serif;
    user-select: none;
    opacity: 0.55;
    transition: opacity 0.25s ease, background 0.25s ease, border-color 0.25s ease;
  }
  #bar.peek, #bar.alert {
    opacity: 0.94;
    background: rgba(15, 17, 21, 0.9);
    border-color: rgba(42, 51, 68, 0.85);
  }
  #bar.alert { border-color: rgba(245, 185, 66, 0.85); }
  #dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: #2dd4bf; flex-shrink: 0;
  }
  #dot.warn { background: #f5b942; }
  #dot.danger { background: #f87171; }
  #name {
    max-width: 72px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    color: #e8ecf4;
  }
  #time {
    font-variant-numeric: tabular-nums;
    color: #2dd4bf;
    font-size: 12px;
    margin-left: auto;
    flex-shrink: 0;
  }
  #time.warn { color: #f5b942; }
  #state {
    font-size: 11px;
    font-weight: 500;
    color: #9aa3b5;
    flex-shrink: 0;
    max-width: 110px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  #state.warn { color: #f5b942; }
  #state.danger { color: #f87171; }
</style>
</head>
<body>
  <div id="bar">
    <span id="dot"></span>
    <span id="name">VIP</span>
    <span id="time">0m 00s</span>
    <span id="state">Presente</span>
  </div>
  <script>
    var peekTimer = null;
    var bar = document.getElementById("bar");
    function setPeek(on) {
      if (on) {
        bar.classList.add("peek");
        if (peekTimer) clearTimeout(peekTimer);
        peekTimer = setTimeout(function () { bar.classList.remove("peek"); }, 2500);
      } else {
        if (peekTimer) clearTimeout(peekTimer);
        peekTimer = setTimeout(function () { bar.classList.remove("peek"); }, 400);
      }
    }
    bar.addEventListener("mouseenter", function () { setPeek(true); });
    bar.addEventListener("mouseleave", function () { setPeek(false); });
    function fmtBal(sec) {
      if (sec == null || !isFinite(sec)) return null;
      var s = Math.max(0, Math.floor(sec));
      var m = Math.floor(s / 60);
      var r = s % 60;
      if (m >= 60) return Math.floor(m / 60) + "h " + (m % 60) + "m";
      return m + "m " + String(r).padStart(2, "0") + "s";
    }
    window.__setHud = function (p) {
      var name = (p && p.name) || "VIP";
      var present = !p || p.present !== false;
      var absent = p && p.absentLeft != null ? p.absentLeft : null;
      var bal = p && p.balanceSeconds != null ? p.balanceSeconds : null;
      var low = !!(p && p.lowBalanceWarn);
      var paused = !!(p && p.billingPaused);
      document.getElementById("name").textContent = name;
      var timeEl = document.getElementById("time");
      var balTxt = fmtBal(bal);
      timeEl.textContent = balTxt != null ? "resta " + balTxt : (p && p.time) || "0m 00s";
      timeEl.className = low ? "warn" : "";
      var state = document.getElementById("state");
      var dot = document.getElementById("dot");
      bar.classList.toggle("alert", low || !present || paused);
      if (!present) {
        state.textContent = "Ausente " + (absent != null ? absent + "s" : "…") + (paused ? " · pausa" : "");
        state.className = "warn";
        dot.className = "warn";
      } else if (low) {
        state.textContent = "Saldo baixo";
        state.className = "danger";
        dot.className = "danger";
        setPeek(true);
      } else if (paused) {
        state.textContent = "Crédito pausado";
        state.className = "warn";
        dot.className = "warn";
      } else {
        state.textContent = "Presente";
        state.className = "";
        dot.className = "";
      }
    };
  </script>
</body>
</html>`;

    this.win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    this.win.on("closed", () => {
      this.win = null;
    });
    return this.win;
  }

  positionBottomRight() {
    if (!this.win || this.win.isDestroyed()) return;
    const { workArea } = screen.getPrimaryDisplay();
    const x = Math.max(workArea.x, workArea.x + workArea.width - HUD_W - 16);
    const y = Math.max(workArea.y, workArea.y + workArea.height - HUD_H - 16);
    this.win.setPosition(x, y);
  }

  formatTime(seconds) {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
    return `${m}m ${String(r).padStart(2, "0")}s`;
  }

  /**
   * @param {{ name?: string, elapsed?: number, present?: boolean, absentLeft?: number | null, balanceSeconds?: number | null, lowBalanceWarn?: boolean, billingPaused?: boolean }} payload
   */
  update(payload) {
    const win = this.ensure();
    const data = {
      name: payload?.name || "VIP",
      time: this.formatTime(payload?.elapsed),
      present: payload?.present !== false,
      absentLeft: payload?.absentLeft ?? null,
      balanceSeconds: payload?.balanceSeconds ?? null,
      lowBalanceWarn: Boolean(payload?.lowBalanceWarn),
      billingPaused: Boolean(payload?.billingPaused),
    };
    const run = () => {
      if (win.isDestroyed()) return;
      win.webContents
        .executeJavaScript(`window.__setHud && window.__setHud(${JSON.stringify(data)})`)
        .catch(() => undefined);
    };
    if (win.webContents.isLoading()) {
      win.webContents.once("did-finish-load", run);
    } else {
      run();
    }
  }

  show(payload) {
    const win = this.ensure();
    this.positionBottomRight();
    this.update(payload);
    if (!win.isVisible()) {
      win.showInactive();
    }
  }

  hide() {
    if (!this.win || this.win.isDestroyed()) return;
    this.win.hide();
  }

  destroy() {
    if (!this.win || this.win.isDestroyed()) return;
    this.win.destroy();
    this.win = null;
  }
}

module.exports = { SessionHud };
