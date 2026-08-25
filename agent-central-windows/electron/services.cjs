const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const http = require("node:http");

const DEFAULT_ADMIN = "admin123";
const DEFAULT_STATION = "loja-geek-station-secret";
const DEFAULT_JWT = "troque-este-segredo-em-producao";

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
      startedAt: null,
      uptimeMs: 0,
      faceError: "",
      lastFaceCheck: "",
      error: "",
      logs: [],
    };
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
    this.status.phase = this.status.needsSetup ? "setup" : this.status.phase;
    this.emit();
    return { ...this.status, suggestedJwt: randomSecret(), suggestedStation: randomSecret() };
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

  stop() {
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

  async start() {
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
      this.log("[setup] Configure a senha e os segredos antes de subir os serviços");
      this.emit();
      return;
    }

    this.status.phase = "starting";
    this.status.api = false;
    this.status.face = false;
    this.status.faceError = "";
    this.status.error = "";
    this.status.needsSetup = false;
    this.status.setupComplete = true;
    this.status.lanIp = lanIPv4();
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
        FACE_MODE: "opencv",
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
    this.startedAt = Date.now();
    this.status.startedAt = this.startedAt;
    this.status.uptimeMs = 0;
    this.emit();
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
