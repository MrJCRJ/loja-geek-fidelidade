const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const http = require("node:http");

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

function loadConfig(dataDir) {
  const example = path.join(__dirname, "..", "config.example.json");
  const local = path.join(dataDir, "config.json");
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
  fs.writeFileSync(local, JSON.stringify(base, null, 2));
  return base;
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
        if (res.statusCode && res.statusCode < 500) resolve(true);
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
    this.status = {
      phase: "idle",
      api: false,
      face: false,
      lanIp: lanIPv4(),
      apiPort: 8787,
      facePort: 8100,
      adminPassword: "admin123",
      error: "",
      logs: [],
    };
  }

  log(line) {
    const msg = String(line).trim();
    if (!msg) return;
    this.status.logs = [...this.status.logs.slice(-80), msg];
    if (this.onChange) this.onChange({ ...this.status });
  }

  emit() {
    if (this.onChange) this.onChange({ ...this.status });
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
  }

  async start() {
    this.stop();
    this.status.phase = "starting";
    this.status.api = false;
    this.status.face = false;
    this.status.error = "";
    this.status.lanIp = lanIPv4();
    this.emit();

    const rt = runtimeRoot();
    const dataDir = dataRoot(this.app);
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(path.join(dataDir, "models"), { recursive: true });

    const cfg = loadConfig(dataDir);
    this.status.apiPort = Number(cfg.apiPort || 8787);
    this.status.facePort = Number(cfg.facePort || 8100);
    this.status.adminPassword = String(cfg.adminPassword || "admin123");

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
      face.stdout.on("data", (d) => this.log(`[face] ${d}`));
      face.stderr.on("data", (d) => this.log(`[face] ${d}`));
      face.on("exit", (code) => this.log(`[face] saiu code=${code}`));
    } else {
      this.log("[face] runtime Python/face ausente — API sobe sem facial");
    }

    // API
    const useNode = fs.existsSync(nodeExe) ? nodeExe : process.execPath;
    // Se não houver node.exe (dev linux), tenta `node` do PATH
    const apiCmd = fs.existsSync(nodeExe) ? nodeExe : "node";
    const apiEnv = {
      ...commonEnv,
      PORT: String(this.status.apiPort),
      HOST: "0.0.0.0",
      DATABASE_PATH: path.join(dataDir, "fidelidade.db"),
      FACE_SERVICE_URL: `http://127.0.0.1:${this.status.facePort}`,
      STATIC_DIR: staticDir,
      ADMIN_PASSWORD: this.status.adminPassword,
      STATION_SHARED_SECRET: String(cfg.stationSharedSecret || "loja-geek-station-secret"),
      JWT_SECRET: String(cfg.jwtSecret || "troque-este-segredo-em-producao"),
      FACE_MATCH_THRESHOLD: "0.45",
      POINTS_PER_REAL: "1",
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

    try {
      await waitHttp(`http://127.0.0.1:${this.status.facePort}/health`, 90_000).catch(() => null);
      this.status.face = true;
      this.emit();
    } catch {
      this.status.face = false;
    }

    await waitHttp(`http://127.0.0.1:${this.status.apiPort}/api/health`, 90_000);
    this.status.api = true;
    this.status.phase = "running";
    this.emit();
  }
}

module.exports = { ServiceManager, lanIPv4, dataRoot, runtimeRoot, isDev };
