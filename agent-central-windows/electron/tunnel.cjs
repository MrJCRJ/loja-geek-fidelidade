const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { pipeline } = require("node:stream/promises");
const { createWriteStream } = require("node:fs");

const QUICK_URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
const CLOUDFLARED_WIN_URL =
  "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe";

/**
 * @param {string} runtimeDir resources/runtime
 * @param {string} dataDir
 */
function resolveCloudflared(runtimeDir, dataDir) {
  const candidates = [];
  if (process.platform === "win32") {
    candidates.push(path.join(runtimeDir, "cloudflared", "cloudflared.exe"));
    candidates.push(path.join(dataDir, "cloudflared", "cloudflared.exe"));
    candidates.push(path.join(dataDir, "cloudflared.exe"));
  } else {
    candidates.push(path.join(runtimeDir, "cloudflared", "cloudflared"));
    candidates.push(path.join(dataDir, "cloudflared", "cloudflared"));
    candidates.push("/usr/local/bin/cloudflared");
    candidates.push("/usr/bin/cloudflared");
  }
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Baixa cloudflared para data/cloudflared/ (Windows amd64).
 * @param {string} dataDir
 * @param {(msg: string) => void} log
 */
async function ensureCloudflaredBinary(runtimeDir, dataDir, log = () => {}) {
  const existing = resolveCloudflared(runtimeDir, dataDir);
  if (existing) return existing;

  if (process.platform !== "win32") {
    throw new Error(
      "cloudflared não encontrado. Instale no sistema (apt/brew) ou coloque o binário em runtime/cloudflared/",
    );
  }

  const destDir = path.join(dataDir, "cloudflared");
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, "cloudflared.exe");
  const tmp = `${dest}.part`;

  log("[tunnel] baixando cloudflared (Windows amd64)…");
  await new Promise((resolve, reject) => {
    const follow = (url, redirects = 0) => {
      if (redirects > 8) {
        reject(new Error("Muitos redirects ao baixar cloudflared"));
        return;
      }
      https
        .get(url, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            follow(res.headers.location, redirects + 1);
            return;
          }
          if (!res.statusCode || res.statusCode >= 400) {
            reject(new Error(`Download cloudflared HTTP ${res.statusCode}`));
            res.resume();
            return;
          }
          const out = createWriteStream(tmp);
          pipeline(res, out).then(resolve).catch(reject);
        })
        .on("error", reject);
    };
    follow(CLOUDFLARED_WIN_URL);
  });

  fs.renameSync(tmp, dest);
  log(`[tunnel] cloudflared salvo em ${dest}`);
  return dest;
}

function probeUrl(url, timeoutMs = 5000) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      resolve(false);
      return;
    }
    const lib = parsed.protocol === "https:" ? https : http;
    const req = lib.get(
      url,
      { timeout: timeoutMs, headers: { "user-agent": "GeekCentral/1.0" } },
      (res) => {
        res.resume();
        resolve(Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 500));
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

class TunnelManager {
  /**
   * @param {{
   *   runtimeDir: string,
   *   dataDir: string,
   *   apiPort: number,
   *   log: (msg: string) => void,
   *   onChange: (state: object) => void,
   * }} opts
   */
  constructor(opts) {
    this.runtimeDir = opts.runtimeDir;
    this.dataDir = opts.dataDir;
    this.apiPort = opts.apiPort || 8787;
    this.log = opts.log;
    this.onChange = opts.onChange;
    /** @type {import('node:child_process').ChildProcess | null} */
    this.proc = null;
    this.state = {
      mode: "off", // off | quick | named
      running: false,
      publicUrl: "",
      namedTunnel: "",
      portalOrigin: "https://loja-geek-portal.vercel.app",
      publicHealthy: false,
      lastCheck: "",
      error: "",
      binaryPath: "",
    };
  }

  emit() {
    if (this.onChange) this.onChange({ ...this.state });
  }

  applyConfig(cfg) {
    this.state.mode = cfg.tunnelMode === "quick" || cfg.tunnelMode === "named" ? cfg.tunnelMode : "off";
    this.state.namedTunnel = String(cfg.tunnelName || "");
    this.state.portalOrigin = String(cfg.portalOrigin || "https://loja-geek-portal.vercel.app");
    // named: URL fixa configurada; quick: última URL vista
    if (this.state.mode === "named") {
      this.state.publicUrl = String(cfg.publicApiUrl || "").replace(/\/$/, "");
    } else if (this.state.mode === "quick" && cfg.lastQuickTunnelUrl) {
      this.state.publicUrl = String(cfg.lastQuickTunnelUrl).replace(/\/$/, "");
    } else if (this.state.mode === "off") {
      this.state.publicUrl = "";
    }
    this.emit();
  }

  webhookUrl() {
    if (!this.state.publicUrl) return "";
    return `${this.state.publicUrl}/api/portal/webhooks/mercadopago`;
  }

  isAlive() {
    const p = this.proc;
    return Boolean(p && p.exitCode == null && !p.killed);
  }

  stop() {
    if (!this.proc) {
      this.state.running = false;
      this.emit();
      return;
    }
    const p = this.proc;
    this.proc = null;
    try {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(p.pid), "/f", "/t"], { windowsHide: true });
      } else {
        p.kill("SIGTERM");
      }
    } catch {
      /* ignore */
    }
    this.state.running = false;
    this.emit();
  }

  /**
   * @param {{ mode: string, tunnelName?: string, publicApiUrl?: string }} opts
   */
  async start(opts) {
    this.stop();
    const mode = opts.mode === "named" || opts.mode === "quick" ? opts.mode : "off";
    this.state.mode = mode;
    this.state.error = "";
    this.state.publicHealthy = false;

    if (mode === "off") {
      this.state.running = false;
      this.state.publicUrl = "";
      this.emit();
      return { ok: true };
    }

    let bin;
    try {
      bin = await ensureCloudflaredBinary(this.runtimeDir, this.dataDir, this.log);
    } catch (err) {
      this.state.error = err instanceof Error ? err.message : String(err);
      this.state.running = false;
      this.emit();
      return { ok: false, error: this.state.error };
    }
    this.state.binaryPath = bin;

    const local = `http://127.0.0.1:${this.apiPort}`;
    /** @type {string[]} */
    let args;
    if (mode === "named") {
      const name = String(opts.tunnelName || "").trim();
      if (!name) {
        this.state.error = "Informe o nome do túnel Cloudflare (ex.: loja-geek-api)";
        this.emit();
        return { ok: false, error: this.state.error };
      }
      this.state.namedTunnel = name;
      this.state.publicUrl = String(opts.publicApiUrl || this.state.publicUrl || "").replace(/\/$/, "");
      const namedConfig = path.join(path.dirname(this.dataDir), "cloudflared-config", "config.yml");
      if (fs.existsSync(namedConfig)) {
        args = ["tunnel", "--config", namedConfig, "run", name];
      } else {
        args = ["tunnel", "run", name];
      }
    } else {
      args = ["tunnel", "--url", local, "--no-autoupdate"];
    }

    this.log(`[tunnel] iniciando (${mode}): ${bin} ${args.join(" ")}`);
    const child = spawn(bin, args, {
      windowsHide: true,
      env: { ...process.env },
    });
    this.proc = child;
    this.state.running = true;
    this.emit();

    const onChunk = (buf) => {
      const text = String(buf);
      this.log(`[tunnel] ${text}`);
      const match = text.match(QUICK_URL_RE);
      if (match) {
        this.state.publicUrl = match[0].replace(/\/$/, "");
        this.emit();
      }
    };
    child.stdout?.on("data", onChunk);
    child.stderr?.on("data", onChunk);
    child.on("exit", (code) => {
      this.log(`[tunnel] saiu code=${code}`);
      if (this.proc === child) this.proc = null;
      this.state.running = false;
      if (code && code !== 0) {
        this.state.error = `cloudflared saiu com código ${code}`;
      }
      this.emit();
    });

    // Espera URL no modo quick (até ~25s)
    if (mode === "quick") {
      const deadline = Date.now() + 25_000;
      while (!this.state.publicUrl && Date.now() < deadline && this.proc) {
        await new Promise((r) => setTimeout(r, 500));
      }
      if (!this.state.publicUrl) {
        this.state.error = "Túnel subiu, mas a URL trycloudflare ainda não apareceu — veja o log";
      }
    }

    await this.checkPublicHealth();
    return { ok: true, publicUrl: this.state.publicUrl };
  }

  async checkPublicHealth() {
    this.state.lastCheck = new Date().toISOString();
    if (!this.state.publicUrl) {
      this.state.publicHealthy = false;
      this.emit();
      return false;
    }
    const health = `${this.state.publicUrl}/api/health`;
    const ok = await probeUrl(health, 8000);
    this.state.publicHealthy = ok;
    if (ok) this.log(`[tunnel] público OK ${health}`);
    else this.log(`[tunnel] público sem resposta ${health}`);
    this.emit();
    return ok;
  }
}

module.exports = {
  TunnelManager,
  resolveCloudflared,
  ensureCloudflaredBinary,
  probeUrl,
};
