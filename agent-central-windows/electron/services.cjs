const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const http = require("node:http");
const { TunnelManager } = require("./tunnel.cjs");
const { startBeacon } = require("../../shared/lan-discovery.cjs");

const DEFAULT_ADMIN = "admin123";
const DEFAULT_STATION = "loja-geek-station-secret";
const DEFAULT_JWT = "troque-este-segredo-em-producao";
const DEFAULT_PORTAL = "https://loja-geek-portal.vercel.app";

function isDev() {
  return Boolean(process.env.GEEKCENTRAL_DEV) || Boolean(process.env.VITE_DEV_SERVER_URL);
}

function runtimeRoot() {
  if (isDev()) {
    return path.join(__dirname, "..", "runtime");
  }
  return path.join(process.resourcesPath, "runtime");
}

/** Pasta gravável ao lado do .exe (portable) ou userData em dev. */
function dataRoot(app) {
  if (isDev()) {
    return path.join(__dirname, "..", "data-dev");
  }
  // win-unpacked: GeekCentral.exe fica em .../GeekCentral/GeekCentral.exe
  return path.join(path.dirname(process.execPath), "data");
}

function configPath(dataDir) {
  return path.join(dataDir, "config.json");
}

function loadConfig(dataDir) {
  const example = path.join(__dirname, "..", "config.example.json");
  const local = configPath(dataDir);
  const packagedExample = path.join(runtimeRoot(), "config.example.json");
  let base = {};
  for (const p of [packagedExample, example]) {
    if (fs.existsSync(p)) {
      base = JSON.parse(fs.readFileSync(p, "utf8"));
      break;
    }
  }
  if (fs.existsSync(local)) {
    return { ...base, ...JSON.parse(fs.readFileSync(local, "utf8")) };
  }
  fs.mkdirSync(dataDir, { recursive: true });
  const initial = {
    ...base,
    setupComplete: false,
  };
  fs.writeFileSync(local, JSON.stringify(initial, null, 2));
  return initial;
}

function saveConfig(dataDir, cfg) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(configPath(dataDir), JSON.stringify(cfg, null, 2));
}

function secretsAreDefault(cfg) {
  const admin = String(cfg.adminPassword || DEFAULT_ADMIN);
  const station = String(cfg.stationSharedSecret || DEFAULT_STATION);
  const jwt = String(cfg.jwtSecret || DEFAULT_JWT);
  return admin === DEFAULT_ADMIN || station === DEFAULT_STATION || jwt === DEFAULT_JWT;
}

function needsSetup(cfg) {
  // Já tem segredos reais (instalação antiga) → não força wizard
  if (!secretsAreDefault(cfg)) return false;
  return cfg.setupComplete !== true;
}

function randomSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function lanIPv4() {
  const nets = os.networkInterfaces();
  const preferred = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family !== "IPv4" || net.internal) continue;
      // ignora bridges docker comuns
      if (net.address.startsWith("172.1") || net.address.startsWith("172.2")) continue;
      preferred.push(net.address);
    }
  }
  return preferred[0] || "127.0.0.1";
}

function waitHttp(url, timeoutMs = 60_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) resolve(true);
        else if (Date.now() - start > timeoutMs) reject(new Error(`Timeout: ${url}`));
        else setTimeout(tick, 700);
      });
      req.on("error", () => {
        if (Date.now() - start > timeoutMs) reject(new Error(`Timeout: ${url}`));
        else setTimeout(tick, 700);
      });
    };
    tick();
  });
}

class ServiceManager {
  /** @param {import('electron').App} app */
  constructor(app) {
    this.app = app;
    this.procs = [];
    this.startedAt = null;
    /** @type {ReturnType<typeof setInterval> | null} */
    this.watchdogTimer = null;
    this._restarting = false;
    this._restartAttempts = 0;
    this.beacon = null;
    this.status = {
      phase: "idle",
      api: false,
      face: false,
      lanIp: lanIPv4(),
      apiPort: 8787,
      facePort: 8100,
      adminPassword: "",
      needsSetup: true,
      setupComplete: false,
      unitName: "Unidade 1",
      uiCompact: false,
      openAtLogin: true,
      bootDelayMs: 15_000,
      firewallOk: false,
      firewallError: "",
      tunnelMode: "off",
      tunnelRunning: false,
      tunnelPublicUrl: "",
      tunnelNamed: "",
      tunnelPublicHealthy: false,
      tunnelError: "",
      portalOrigin: DEFAULT_PORTAL,
      webhookUrl: "",
      startedAt: null,
      uptimeMs: 0,
      faceError: "",
      lastFaceCheck: "",
      error: "",
      logs: [],
    };
    this.tunnel = new TunnelManager({
      runtimeDir: runtimeRoot(),
      dataDir: this.dataDir(),
      apiPort: 8787,
      log: (m) => this.log(m),
      onChange: (t) => {
        this.status.tunnelMode = t.mode;
        this.status.tunnelRunning = t.running;
        this.status.tunnelPublicUrl = t.publicUrl || "";
        this.status.tunnelNamed = t.namedTunnel || "";
        this.status.tunnelPublicHealthy = Boolean(t.publicHealthy);
        this.status.tunnelError = t.error || "";
        this.status.portalOrigin = t.portalOrigin || DEFAULT_PORTAL;
        this.status.webhookUrl = t.publicUrl
          ? `${t.publicUrl}/api/portal/webhooks/mercadopago`
          : "";
        this.emit();
      },
    });
  }

  dataDir() {
    return dataRoot(this.app);
  }

  log(line) {
    const msg = String(line).trim();
    if (!msg) return;
    this.status.logs = [...this.status.logs.slice(-80), msg];
    if (this.onChange) this.onChange({ ...this.status });
  }

  emit() {
    if (this.startedAt) {
      this.status.startedAt = this.startedAt;
      this.status.uptimeMs = Date.now() - this.startedAt;
    }
    if (this.onChange) this.onChange({ ...this.status });
  }

  peekSetup() {
    const dataDir = this.dataDir();
    fs.mkdirSync(dataDir, { recursive: true });
    const cfg = loadConfig(dataDir);
    this.status.needsSetup = needsSetup(cfg);
    this.status.setupComplete = Boolean(cfg.setupComplete) && !secretsAreDefault(cfg);
    this.status.apiPort = Number(cfg.apiPort || 8787);
    this.status.facePort = Number(cfg.facePort || 8100);
    this.status.unitName = String(cfg.unitName || "Unidade 1");
    this.status.adminPassword = this.status.setupComplete ? String(cfg.adminPassword || "") : "";
    this.status.lanIp = lanIPv4();
    this.status.openAtLogin = cfg.openAtLogin !== false;
    this.status.bootDelayMs = Number(cfg.bootDelayMs ?? 15_000);
    this.status.uiCompact = Boolean(cfg.uiCompact);
    this.status.firewallOk = Boolean(cfg.firewallRuleDone);
    this.status.firewallError = String(cfg.firewallError || "");
    this.status.portalOrigin = String(cfg.portalOrigin || DEFAULT_PORTAL);
    this.status.tunnelMode = cfg.tunnelMode === "quick" || cfg.tunnelMode === "named" ? cfg.tunnelMode : "off";
    this.status.tunnelNamed = String(cfg.tunnelName || "");
    this.tunnel.apiPort = this.status.apiPort;
    this.tunnel.dataDir = dataDir;
    this.tunnel.runtimeDir = runtimeRoot();
    this.tunnel.applyConfig(cfg);
    this.status.tunnelPublicUrl = this.tunnel.state.publicUrl;
    this.status.tunnelRunning = this.tunnel.state.running;
    this.status.tunnelPublicHealthy = this.tunnel.state.publicHealthy;
    this.status.tunnelError = this.tunnel.state.error;
    this.status.webhookUrl = this.tunnel.webhookUrl();
    this.status.phase = this.status.needsSetup ? "setup" : this.status.phase;
    this.emit();
    return {
      ...this.status,
      suggestedJwt: randomSecret(),
      suggestedStation: randomSecret(),
      firewallRuleDone: Boolean(cfg.firewallRuleDone),
    };
  }

  getOpenAtLogin() {
    const cfg = loadConfig(this.dataDir());
    return cfg.openAtLogin !== false;
  }

  getBootDelayMs() {
    const cfg = loadConfig(this.dataDir());
    return Number(cfg.bootDelayMs ?? 15_000);
  }

  setOpenAtLogin(enabled) {
    const dataDir = this.dataDir();
    const cfg = loadConfig(dataDir);
    cfg.openAtLogin = Boolean(enabled);
    saveConfig(dataDir, cfg);
    this.status.openAtLogin = cfg.openAtLogin;
    this.emit();
  }

  getUiCompact() {
    const cfg = loadConfig(this.dataDir());
    return Boolean(cfg.uiCompact);
  }

  setUiCompact(enabled) {
    const dataDir = this.dataDir();
    const cfg = loadConfig(dataDir);
    cfg.uiCompact = Boolean(enabled);
    saveConfig(dataDir, cfg);
    this.status.uiCompact = cfg.uiCompact;
    this.emit();
    return cfg.uiCompact;
  }

  /** Define compacto só na 1ª vez (chave ausente), ex. tela baixa. */
  ensureUiCompactDefault(preferCompact) {
    const dataDir = this.dataDir();
    const cfg = loadConfig(dataDir);
    if (Object.prototype.hasOwnProperty.call(cfg, "uiCompact")) {
      this.status.uiCompact = Boolean(cfg.uiCompact);
      return this.status.uiCompact;
    }
    cfg.uiCompact = Boolean(preferCompact);
    saveConfig(dataDir, cfg);
    this.status.uiCompact = cfg.uiCompact;
    this.emit();
    return cfg.uiCompact;
  }

  markFirewallAttempt(result) {
    const dataDir = this.dataDir();
    const cfg = loadConfig(dataDir);
    cfg.firewallRuleDone = Boolean(result?.ok);
    cfg.firewallError = result?.ok ? "" : String(result?.error || "");
    saveConfig(dataDir, cfg);
    this.status.firewallOk = Boolean(result?.ok);
    this.status.firewallError = cfg.firewallError;
    if (result?.ok) this.log("[firewall] regra TCP liberada (rede privada)");
    else this.log(`[firewall] ${cfg.firewallError || "falhou"}`);
    this.emit();
  }

  /**
   * @param {{
   *   tunnelMode: "off" | "quick" | "named",
   *   tunnelName?: string,
   *   publicApiUrl?: string,
   *   portalOrigin?: string,
   * }} input
   */
  saveTunnelConfig(input) {
    const dataDir = this.dataDir();
    const cfg = loadConfig(dataDir);
    const mode = input.tunnelMode === "quick" || input.tunnelMode === "named" ? input.tunnelMode : "off";
    cfg.tunnelMode = mode;
    if (input.tunnelName != null) cfg.tunnelName = String(input.tunnelName).trim();
    if (input.publicApiUrl != null) cfg.publicApiUrl = String(input.publicApiUrl).trim().replace(/\/$/, "");
    if (input.portalOrigin != null) {
      cfg.portalOrigin = String(input.portalOrigin).trim().replace(/\/$/, "") || DEFAULT_PORTAL;
    }
    saveConfig(dataDir, cfg);
    this.status.portalOrigin = cfg.portalOrigin || DEFAULT_PORTAL;
    this.status.tunnelMode = mode;
    this.status.tunnelNamed = String(cfg.tunnelName || "");
    this.tunnel.applyConfig(cfg);
    this.emit();
    return { ...cfg };
  }

  async applyTunnelFromConfig() {
    const cfg = loadConfig(this.dataDir());
    this.tunnel.apiPort = this.status.apiPort;
    this.tunnel.dataDir = this.dataDir();
    this.tunnel.runtimeDir = runtimeRoot();
    this.tunnel.applyConfig(cfg);
    if (!this.status.api || cfg.tunnelMode === "off" || !cfg.tunnelMode) {
      this.tunnel.stop();
      return { ok: true };
    }
    const res = await this.tunnel.start({
      mode: cfg.tunnelMode,
      tunnelName: cfg.tunnelName,
      publicApiUrl: cfg.publicApiUrl,
    });
    if (res.ok && cfg.tunnelMode === "quick" && this.tunnel.state.publicUrl) {
      cfg.lastQuickTunnelUrl = this.tunnel.state.publicUrl;
      saveConfig(this.dataDir(), cfg);
    }
    this.status.webhookUrl = this.tunnel.webhookUrl();
    this.emit();
    return res;
  }

  async setTunnel(input) {
    this.saveTunnelConfig(input);
    if (!this.status.api && input.tunnelMode !== "off") {
      return { ok: false, error: "Suba a API antes de ligar o túnel", status: { ...this.status } };
    }
    const res = await this.applyTunnelFromConfig();
    return { ...res, status: { ...this.status } };
  }

  stopWatchdog() {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  startWatchdog() {
    this.stopWatchdog();
    this.watchdogTimer = setInterval(() => {
      this.checkHealthAndRecover().catch(() => undefined);
    }, 20_000);
  }

  async probeHealth(port, pathSuffix) {
    return new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${port}${pathSuffix}`, { timeout: 4000 }, (res) => {
        res.resume();
        resolve(Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 400));
      });
      req.on("error", () => resolve(false));
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  async checkHealthAndRecover() {
    if (this._restarting) return;
    if (this.status.phase === "setup" || this.status.needsSetup) return;
    if (this.status.phase === "starting") return;

    const apiOk = await this.probeHealth(this.status.apiPort, "/api/health");
    const faceOk = await this.probeHealth(this.status.facePort, "/health");
    this.status.api = apiOk;
    this.status.face = faceOk;
    this.status.lastFaceCheck = new Date().toISOString();
    if (!faceOk && !this.status.faceError) this.status.faceError = "Face sem resposta";
    if (faceOk) this.status.faceError = "";
    this.emit();

    if (apiOk) {
      this._restartAttempts = 0;
      if (this.status.phase !== "running") {
        this.status.phase = "running";
        this.status.error = "";
        this.emit();
      }
      // Túnel: se deveria estar ligado e morreu, tenta de novo; senão só health público
      const cfg = loadConfig(this.dataDir());
      if (cfg.tunnelMode === "quick" || cfg.tunnelMode === "named") {
        if (!this.tunnel.state.running) {
          this.applyTunnelFromConfig().catch(() => undefined);
        } else {
          this.tunnel.checkPublicHealth().catch(() => undefined);
        }
      }
      return;
    }

    // API caiu — reinicia com backoff
    this._restartAttempts += 1;
    const delay = Math.min(60_000, 5_000 * this._restartAttempts);
    this.log(`[watchdog] API off — reinício #${this._restartAttempts} em ${Math.round(delay / 1000)}s`);
    this.status.phase = "error";
    this.status.error = "API parou — reiniciando automaticamente…";
    this.emit();
    this._restarting = true;
    setTimeout(() => {
      this.start({ skipBootDelay: true })
        .catch((err) => {
          this.status.phase = "error";
          this.status.error = err instanceof Error ? err.message : String(err);
          this.emit();
        })
        .finally(() => {
          this._restarting = false;
        });
    }, delay);
  }

  /**
   * @param {{ adminPassword: string, jwtSecret?: string, stationSharedSecret?: string, unitName?: string }} input
   */
  completeSetup(input) {
    const adminPassword = String(input.adminPassword || "").trim();
    if (adminPassword.length < 8) {
      throw new Error("Senha admin deve ter pelo menos 8 caracteres");
    }
    if (adminPassword === DEFAULT_ADMIN) {
      throw new Error("Não use a senha padrão admin123");
    }
    const dataDir = this.dataDir();
    const prev = loadConfig(dataDir);
    const cfg = {
      ...prev,
      adminPassword,
      jwtSecret: String(input.jwtSecret || randomSecret()).trim() || randomSecret(),
      stationSharedSecret: String(input.stationSharedSecret || randomSecret()).trim() || randomSecret(),
      unitName: String(input.unitName || prev.unitName || "Unidade 1").trim() || "Unidade 1",
      apiPort: Number(prev.apiPort || 8787),
      facePort: Number(prev.facePort || 8100),
      setupComplete: true,
    };
    if (cfg.jwtSecret === DEFAULT_JWT || cfg.stationSharedSecret === DEFAULT_STATION) {
      throw new Error("Gere novos segredos — defaults não são permitidos");
    }
    saveConfig(dataDir, cfg);
    this.status.needsSetup = false;
    this.status.setupComplete = true;
    this.status.adminPassword = cfg.adminPassword;
    this.status.unitName = cfg.unitName;
    this.emit();
    return { ok: true };
  }

  stopBeacon() {
    if (this.beacon) {
      try {
        this.beacon.stop();
      } catch {
        /* ignore */
      }
      this.beacon = null;
    }
  }

  startBeacon() {
    this.stopBeacon();
    this.beacon = startBeacon(() => ({
      lanIp: this.status.lanIp || lanIPv4(),
      apiPort: this.status.apiPort || 8787,
      unitName: this.status.unitName || "Unidade",
      version: 1,
    }));
    this.log("[discovery] anunciando GeekCentral na LAN (UDP 48787)");
  }

  stop() {
    this.stopWatchdog();
    this.stopBeacon();
    this.tunnel.stop();
    for (const p of this.procs) {
      try {
        if (process.platform === "win32") {
          spawn("taskkill", ["/pid", String(p.pid), "/f", "/t"]);
        } else {
          p.kill("SIGTERM");
        }
      } catch {
        /* ignore */
      }
    }
    this.procs = [];
    this.startedAt = null;
    this.status.startedAt = null;
    this.status.uptimeMs = 0;
  }

  /**
   * @param {{ fromBoot?: boolean, skipBootDelay?: boolean }} [opts]
   */
  async start(opts = {}) {
    this.stopWatchdog();
    this.stop();
    const dataDir = this.dataDir();
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(path.join(dataDir, "models"), { recursive: true });
    fs.mkdirSync(path.join(dataDir, "backups"), { recursive: true });

    const cfg = loadConfig(dataDir);
    if (needsSetup(cfg)) {
      this.status.phase = "setup";
      this.status.needsSetup = true;
      this.status.setupComplete = false;
      this.status.api = false;
      this.status.face = false;
      this.status.error = "";
      this.status.adminPassword = "";
      this.status.unitName = String(cfg.unitName || "Unidade 1");
      this.status.openAtLogin = cfg.openAtLogin !== false;
      this.log("[setup] Configure a senha e os segredos antes de subir os serviços");
      this.emit();
      return;
    }

    const bootDelay = opts.skipBootDelay ? 0 : Number(cfg.bootDelayMs ?? 15_000);
    if (opts.fromBoot && bootDelay > 0) {
      this.status.phase = "starting";
      this.status.error = "";
      this.log(`[boot] aguardando ${Math.round(bootDelay / 1000)}s (rede/disco)…`);
      this.emit();
      await new Promise((r) => setTimeout(r, bootDelay));
    }

    this.status.phase = "starting";
    this.status.api = false;
    this.status.face = false;
    this.status.faceError = "";
    this.status.error = "";
    this.status.needsSetup = false;
    this.status.setupComplete = true;
    this.status.lanIp = lanIPv4();
    this.status.openAtLogin = cfg.openAtLogin !== false;
    this.status.bootDelayMs = Number(cfg.bootDelayMs ?? 15_000);
    this.emit();

    const rt = runtimeRoot();
    this.status.apiPort = Number(cfg.apiPort || 8787);
    this.status.facePort = Number(cfg.facePort || 8100);
    this.status.adminPassword = String(cfg.adminPassword || "");
    this.status.unitName = String(cfg.unitName || "Unidade 1");

    const nodeDir = path.join(rt, "node");
    const nodeExe = path.join(nodeDir, process.platform === "win32" ? "node.exe" : "bin/node");
    const serverEntry = path.join(nodeDir, "server", "dist", "index.js");
    const staticDir = path.join(nodeDir, "public");
    const pyDir = path.join(rt, "python");
    const pyExe = path.join(pyDir, process.platform === "win32" ? "python.exe" : "bin/python3");
    const faceDir = path.join(rt, "face");
    const sitePackages = path.join(faceDir, "site-packages");

    if (!fs.existsSync(serverEntry)) {
      throw new Error(
        `Runtime incompleto (falta server). Rode scripts/prepare-central-runtime.sh e pack-pendrive-central.sh. Esperado: ${serverEntry}`,
      );
    }

    const commonEnv = {
      ...process.env,
      PYTHONUTF8: "1",
      PYTHONIOENCODING: "utf-8",
    };

    let faceSpawned = false;
    // Face service
    if (fs.existsSync(pyExe) && fs.existsSync(path.join(faceDir, "main.py"))) {
      const faceEnv = {
        ...commonEnv,
        MODEL_ROOT: path.join(dataDir, "models"),
        PYTHONPATH: [sitePackages, faceDir].join(process.platform === "win32" ? ";" : ":"),
      };
      const face = spawn(
        pyExe,
        ["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", String(this.status.facePort)],
        { cwd: faceDir, env: faceEnv, windowsHide: true },
      );
      this.procs.push(face);
      faceSpawned = true;
      face.stdout.on("data", (d) => this.log(`[face] ${d}`));
      face.stderr.on("data", (d) => this.log(`[face] ${d}`));
      face.on("exit", (code) => {
        this.log(`[face] saiu code=${code}`);
        this.status.face = false;
        this.status.faceError = `Face saiu com código ${code}`;
        this.emit();
      });
    } else {
      this.log("[face] runtime Python/face ausente — API sobe sem facial");
      this.status.faceError = "Runtime Python/face ausente";
    }

    // API
    const apiCmd = fs.existsSync(nodeExe) ? nodeExe : "node";
    const apiEnv = {
      ...commonEnv,
      PORT: String(this.status.apiPort),
      HOST: "0.0.0.0",
      DATABASE_PATH: path.join(dataDir, "fidelidade.db"),
      FACE_SERVICE_URL: `http://127.0.0.1:${this.status.facePort}`,
      STATIC_DIR: staticDir,
      ADMIN_PASSWORD: this.status.adminPassword,
      STATION_SHARED_SECRET: String(cfg.stationSharedSecret),
      JWT_SECRET: String(cfg.jwtSecret),
      FACE_MATCH_THRESHOLD: "0.45",
      POINTS_PER_REAL: "1",
      STRICT_SECRETS: "1",
      UNIT_NAME: String(cfg.unitName || "Unidade 1"),
      UNIT_ID: String(cfg.unitId || "unit-1"),
      PORTAL_ORIGIN: String(cfg.portalOrigin || DEFAULT_PORTAL),
    };
    const api = spawn(apiCmd, [serverEntry], {
      cwd: path.join(nodeDir, "server"),
      env: apiEnv,
      windowsHide: true,
    });
    this.procs.push(api);
    api.stdout.on("data", (d) => this.log(`[api] ${d}`));
    api.stderr.on("data", (d) => this.log(`[api] ${d}`));
    api.on("exit", (code) => {
      this.log(`[api] saiu code=${code}`);
      this.status.api = false;
      this.emit();
    });

    if (faceSpawned) {
      try {
        await waitHttp(`http://127.0.0.1:${this.status.facePort}/health`, 90_000);
        this.status.face = true;
        this.status.faceError = "";
        this.status.lastFaceCheck = new Date().toISOString();
        this.log("[face] health ok");
      } catch (err) {
        this.status.face = false;
        this.status.faceError = err instanceof Error ? err.message : String(err);
        this.status.lastFaceCheck = new Date().toISOString();
        this.log(`[face] health falhou: ${this.status.faceError}`);
      }
      this.emit();
    } else {
      this.status.face = false;
      this.emit();
    }

    await waitHttp(`http://127.0.0.1:${this.status.apiPort}/api/health`, 90_000);
    this.status.api = true;
    this.status.phase = "running";
    this.status.error = "";
    this.startedAt = Date.now();
    this.status.startedAt = this.startedAt;
    this.status.uptimeMs = 0;
    this._restartAttempts = 0;
    this.status.portalOrigin = String(cfg.portalOrigin || DEFAULT_PORTAL);
    this.emit();
    this.startWatchdog();
    this.startBeacon();

    try {
      await this.applyTunnelFromConfig();
    } catch (err) {
      this.log(`[tunnel] ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

module.exports = {
  ServiceManager,
  lanIPv4,
  dataRoot,
  runtimeRoot,
  isDev,
  needsSetup,
  secretsAreDefault,
  randomSecret,
};
