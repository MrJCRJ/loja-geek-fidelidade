/**
 * Mini-HUD de sessão — canto, bem transparente; legível no hover.
 * Soft lock (ausência ≤15s): janela maior + alerta forte no desktop.
 */
const { BrowserWindow, screen } = require("electron");

const HUD_W = 300;
const HUD_H = 52;
const HUD_SOFT_W = 360;
const HUD_SOFT_H = 88;

class SessionHud {
  constructor() {
    /** @type {BrowserWindow | null} */
    this.win = null;
    this.softLock = false;
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
    flex-wrap: wrap;
    align-items: center;
    gap: 0.45rem;
    padding: 0 0.7rem;
    border-radius: 12px;
    background: rgba(15, 17, 21, 0.28);
    border: 1px solid rgba(42, 51, 68, 0.35);
    color: #f4f1ea;
    font: 600 12px/1.2 "Segoe UI", system-ui, sans-serif;
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
  #bar.soft {
    opacity: 1;
    background: rgba(120, 48, 0, 0.94);
    border-color: rgba(245, 158, 11, 0.95);
    animation: softPulse 1.1s ease-in-out infinite;
  }
  @keyframes softPulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.015); }
  }
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
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  #state.warn { color: #f5b942; }
  #state.danger { color: #f87171; }
  #soft {
    display: none;
    width: 100%;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: #fff7ed;
  }
  #bar.soft #soft { display: block; }
</style>
</head>
<body>
  <div id="bar">
    <span id="dot"></span>
    <span id="name">VIP</span>
    <span id="time">0m 00s</span>
    <span id="state">Presente</span>
    <span id="soft">Volte à cadeira — trava em breve</span>
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
      var h = Math.floor(s / 3600);
      var m = Math.floor((s % 3600) / 60);
      var r = s % 60;
      if (h > 0) {
        return h + "h " + String(m).padStart(2, "0") + "m " + String(r).padStart(2, "0") + "s";
      }
      return m + "m " + String(r).padStart(2, "0") + "s";
    }
    window.__setHud = function (p) {
      var name = (p && p.name) || "VIP";
      var present = !p || p.present !== false;
      var absent = p && p.absentLeft != null ? p.absentLeft : null;
      var bal = p && p.balanceSeconds != null ? p.balanceSeconds : null;
      var low = !!(p && p.lowBalanceWarn);
      var paused = !!(p && p.billingPaused);
      var soft = !!(p && p.softLock);
      document.getElementById("name").textContent = name;
      var timeEl = document.getElementById("time");
      var balTxt = fmtBal(bal);
      timeEl.textContent = balTxt != null ? "resta " + balTxt : (p && p.time) || "0m 00s";
      timeEl.className = low ? "warn" : "";
      var state = document.getElementById("state");
      var dot = document.getElementById("dot");
      var softEl = document.getElementById("soft");
      bar.classList.toggle("alert", low);
      bar.classList.toggle("soft", false);
      softEl.textContent = "";
      if (low) {
        state.textContent = "Saldo baixo";
        state.className = "danger";
        dot.className = "danger";
        setPeek(true);
      } else if (!present) {
        if (absent != null && absent > 0) {
          state.textContent = "Ausente · trava em " + absent + "s";
          state.className = absent <= 15 ? "danger" : "warn";
          dot.className = absent <= 15 ? "danger" : "warn";
          if (absent <= 15) {
            bar.classList.add("soft");
            softEl.textContent = "Volte à cadeira — trava em " + absent + "s";
            softEl.style.display = "block";
            setPeek(true);
          }
        } else {
          state.textContent = "Ausente";
          state.className = "warn";
          dot.className = "warn";
        }
      } else {
        state.textContent = "Presente · sessão ativa";
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
    const w = this.softLock ? HUD_SOFT_W : HUD_W;
    const h = this.softLock ? HUD_SOFT_H : HUD_H;
    const x = Math.max(workArea.x, workArea.x + workArea.width - w - 16);
    const y = Math.max(workArea.y, workArea.y + workArea.height - h - 16);
    this.win.setBounds({ x, y, width: w, height: h });
  }

  formatTime(seconds) {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(r).padStart(2, "0")}s`;
    return `${m}m ${String(r).padStart(2, "0")}s`;
  }

  /**
   * @param {{ name?: string, elapsed?: number, present?: boolean, absentLeft?: number | null, balanceSeconds?: number | null, lowBalanceWarn?: boolean, billingPaused?: boolean, softLock?: boolean }} payload
   */
  update(payload) {
    const win = this.ensure();
    const softLock =
      Boolean(payload?.softLock) ||
      (payload?.absentLeft != null && payload.absentLeft > 0 && payload.absentLeft <= 15);
    if (softLock !== this.softLock) {
      this.softLock = softLock;
      this.positionBottomRight();
    }
    const data = {
      name: payload?.name || "VIP",
      time: this.formatTime(payload?.elapsed),
      present: payload?.present !== false,
      absentLeft: payload?.absentLeft ?? null,
      balanceSeconds: payload?.balanceSeconds ?? null,
      lowBalanceWarn: Boolean(payload?.lowBalanceWarn),
      billingPaused: Boolean(payload?.billingPaused),
      softLock,
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
    this.update(payload);
    this.positionBottomRight();
    if (!win.isVisible()) {
      win.showInactive();
    }
  }

  hide() {
    if (!this.win || this.win.isDestroyed()) return;
    this.softLock = false;
    this.win.hide();
  }

  destroy() {
    if (!this.win || this.win.isDestroyed()) return;
    this.win.destroy();
    this.win = null;
  }
}

module.exports = { SessionHud };
