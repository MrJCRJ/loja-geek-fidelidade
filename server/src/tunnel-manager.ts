import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { config } from "./config.js";
import { getSetting, setSetting } from "./customers.js";
import { setPublicApiUrl } from "./centrals.js";

const QUICK_URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

function cloudflaredHome() {
  const home =
    process.env.HOME ||
    process.env.USERPROFILE ||
    (process.env.HOMEDRIVE && process.env.HOMEPATH
      ? path.join(process.env.HOMEDRIVE, process.env.HOMEPATH)
      : "") ||
    "";
  return path.join(home, ".cloudflared");
}

function originCertPath(): string {
  return path.join(cloudflaredHome(), "cert.pem");
}

export function hasCloudflaredLogin(): boolean {
  return fs.existsSync(originCertPath());
}

function namedConfigPath(): string {
  return path.join(cloudflaredHome(), "config.yml");
}

export function hasNamedTunnelConfig(): boolean {
  return fs.existsSync(namedConfigPath());
}

export type NamedTunnelPreflight = {
  ok: boolean;
  originCert: boolean;
  configFile: boolean;
  error?: string;
  hint?: string;
};

export function preflightNamedTunnel(tunnelName: string, publicApiUrl: string): NamedTunnelPreflight {
  const originCert = hasCloudflaredLogin();
  const configFile = hasNamedTunnelConfig();
  const name = tunnelName.trim();
  const url = publicApiUrl.trim().replace(/\/$/, "");

  if (!name) {
    return {
      ok: false,
      originCert,
      configFile,
      error: "Informe o nome do túnel Cloudflare (ex.: loja-geek-api).",
    };
  }
  if (!url || !/^https:\/\//i.test(url)) {
    return {
      ok: false,
      originCert,
      configFile,
      error: "Informe a URL HTTPS fixa do seu domínio (ex.: https://api.sualominio.com).",
    };
  }
  if (QUICK_URL_RE.test(url) || url.includes("trycloudflare.com")) {
    return {
      ok: false,
      originCert,
      configFile,
      error:
        "No modo nomeado use o domínio da loja (ex.: https://api.sualoja.com), não URL trycloudflare.com.",
      hint: "trycloudflare é só para o modo Quick. Volte para Quick se ainda não configurou DNS + login Cloudflare.",
    };
  }
  if (!originCert) {
    return {
      ok: false,
      originCert,
      configFile,
      error: "Falta login Cloudflare (cert.pem). Rode no terminal: cloudflared tunnel login",
      hint: "Depois: cloudflared tunnel create loja-geek-api, DNS, e ~/.cloudflared/config.yml — veja scripts/cloudflare-named-setup.sh",
    };
  }
  if (!configFile) {
    return {
      ok: false,
      originCert,
      configFile,
      error: "Falta ~/.cloudflared/config.yml com ingress para :8787.",
      hint: "Rode: bash scripts/cloudflare-named-setup.sh ou siga docs/portal-api-tunnel.md",
    };
  }
  return { ok: true, originCert, configFile };
}

export type TunnelMode = "off" | "quick" | "named";

export type TunnelConfig = {
  mode: TunnelMode;
  tunnelName: string;
  publicApiUrl: string;
  autoStart: boolean;
  lastQuickTunnelUrl: string;
};

export type TunnelStatus = TunnelConfig & {
  running: boolean;
  publicHealthy: boolean;
  binaryFound: boolean;
  binaryPath: string;
  error: string;
  lastCheck: string | null;
  webhookUrl: string;
  logTail: string[];
  portalLink: string;
  originCertOk: boolean;
  namedConfigOk: boolean;
  namedHint?: string;
};

let proc: ChildProcess | null = null;
const logLines: string[] = [];
const LOG_MAX = 80;

function dataDir() {
  return path.dirname(config.databasePath);
}

function tunnelLogPath() {
  return path.join(dataDir(), "tunnel.log");
}

function appendLog(line: string) {
  const text = line.trim();
  if (!text) return;
  logLines.push(text);
  if (logLines.length > LOG_MAX) logLines.shift();
  try {
    fs.appendFileSync(tunnelLogPath(), `${text}\n`);
  } catch {
    /* ignore */
  }
}

function resolveCloudflared(): string | null {
  const root = path.resolve(path.dirname(config.databasePath), "..");
  const winHome = process.env.LOCALAPPDATA || process.env.ProgramFiles || "";
  const candidates = [
    path.join(root, "data", "cloudflared", "cloudflared.exe"),
    path.join(root, "data", "cloudflared", "cloudflared"),
    path.join(root, "runtime", "cloudflared", "cloudflared.exe"),
    path.join(root, "runtime", "cloudflared", "cloudflared"),
    winHome ? path.join(winHome, "cloudflared", "cloudflared.exe") : "",
    "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe",
    "C:\\Program Files\\cloudflared\\cloudflared.exe",
    "/usr/local/bin/cloudflared",
    "/usr/bin/cloudflared",
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  // PATH (Windows `where` / Unix `which` via spawn sync is heavy — try common name)
  try {
    const cmd = process.platform === "win32" ? "where cloudflared" : "command -v cloudflared";
    const out = execSync(cmd, { encoding: "utf8" }).trim().split(/\r?\n/)[0];
    if (out && fs.existsSync(out)) return out;
  } catch {
    /* ignore */
  }
  return null;
}

export function getTunnelConfig(): TunnelConfig {
  const modeRaw = getSetting("tunnel_mode", "off");
  const mode: TunnelMode =
    modeRaw === "quick" || modeRaw === "named" ? modeRaw : "off";
  return {
    mode,
    tunnelName: getSetting("tunnel_name", process.env.CLOUDFLARED_TUNNEL_NAME || ""),
    publicApiUrl: getSetting("tunnel_public_api_url", ""),
    autoStart: getSetting("tunnel_auto_start", "0") === "1",
    lastQuickTunnelUrl: getSetting("tunnel_last_quick_url", ""),
  };
}

export function saveTunnelConfig(input: Partial<TunnelConfig>) {
  if (input.mode !== undefined) {
    const mode = input.mode === "quick" || input.mode === "named" ? input.mode : "off";
    setSetting("tunnel_mode", mode);
  }
  if (input.tunnelName !== undefined) setSetting("tunnel_name", input.tunnelName.trim());
  if (input.publicApiUrl !== undefined) {
    setSetting("tunnel_public_api_url", input.publicApiUrl.trim().replace(/\/$/, ""));
  }
  if (input.autoStart !== undefined) setSetting("tunnel_auto_start", input.autoStart ? "1" : "0");
  if (input.lastQuickTunnelUrl !== undefined) {
    setSetting("tunnel_last_quick_url", input.lastQuickTunnelUrl.trim().replace(/\/$/, ""));
  }
}

function publicUrlFromConfig(cfg: TunnelConfig): string {
  if (cfg.mode === "named") return cfg.publicApiUrl.replace(/\/$/, "");
  if (cfg.mode === "quick") return cfg.lastQuickTunnelUrl.replace(/\/$/, "");
  return "";
}

function portalLinkFor(publicUrl: string): string {
  if (!publicUrl) return "";
  const portal = config.portalPublicUrl.replace(/\/$/, "");
  return `${portal}/?api=${encodeURIComponent(publicUrl)}`;
}

export function getTunnelStatus(): TunnelStatus {
  const cfg = getTunnelConfig();
  const binaryPath = resolveCloudflared() || "";
  const publicUrl = publicUrlFromConfig(cfg);
  const preflight =
    cfg.mode === "named" ? preflightNamedTunnel(cfg.tunnelName, cfg.publicApiUrl) : null;
  return {
    ...cfg,
    running: Boolean(proc && !proc.killed),
    publicHealthy: false,
    binaryFound: Boolean(binaryPath),
    binaryPath,
    error: preflight && !preflight.ok ? preflight.error || "" : "",
    lastCheck: null,
    webhookUrl: publicUrl ? `${publicUrl}/api/portal/webhooks/mercadopago` : "",
    logTail: [...logLines],
    portalLink: portalLinkFor(publicUrl),
    originCertOk: hasCloudflaredLogin(),
    namedConfigOk: hasNamedTunnelConfig(),
    namedHint: preflight?.hint,
  };
}

function probeUrl(url: string, timeoutMs = 8000): Promise<boolean> {
  return new Promise((resolve) => {
    let parsed: URL;
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

export async function checkTunnelPublicHealth(): Promise<boolean> {
  const cfg = getTunnelConfig();
  const url = publicUrlFromConfig(cfg);
  if (!url) return false;
  return probeUrl(`${url}/api/health`);
}

export function stopTunnel() {
  if (!proc) return;
  const p = proc;
  proc = null;
  try {
    p.kill("SIGTERM");
  } catch {
    /* ignore */
  }
  appendLog("[tunnel] parado pelo admin");
}

async function waitQuickUrl(deadlineMs: number): Promise<string> {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline && proc) {
    const cfg = getTunnelConfig();
    if (cfg.lastQuickTunnelUrl) return cfg.lastQuickTunnelUrl;
    await new Promise((r) => setTimeout(r, 400));
  }
  return getTunnelConfig().lastQuickTunnelUrl;
}

export async function startTunnel(opts?: {
  mode?: TunnelMode;
  tunnelName?: string;
  publicApiUrl?: string;
}): Promise<{ ok: boolean; error?: string; publicUrl?: string; publicHealthy?: boolean }> {
  stopTunnel();

  const cfg = getTunnelConfig();
  const mode = opts?.mode ?? cfg.mode;
  if (mode === "off") {
    saveTunnelConfig({ mode: "off" });
    return { ok: true, publicUrl: "" };
  }

  const bin = resolveCloudflared();
  if (!bin) {
    const msg =
      "cloudflared não encontrado. Instale: sudo apt install cloudflared (ou bash scripts/portal-tunnel.sh manual).";
    appendLog(`[tunnel] ERRO: ${msg}`);
    return { ok: false, error: msg };
  }

  const tunnelName = (opts?.tunnelName ?? cfg.tunnelName).trim();
  const publicApiUrl = (opts?.publicApiUrl ?? cfg.publicApiUrl).trim().replace(/\/$/, "");

  saveTunnelConfig({
    mode,
    tunnelName,
    publicApiUrl: mode === "named" ? publicApiUrl : cfg.publicApiUrl,
  });

  const local = `http://127.0.0.1:${config.port}`;
  const args =
    mode === "named"
      ? ["tunnel", "run", tunnelName]
      : ["tunnel", "--url", local, "--no-autoupdate"];

  if (mode === "named" && !tunnelName) {
    return { ok: false, error: "Informe o nome do túnel Cloudflare (ex.: loja-geek-api)" };
  }

  if (mode === "named") {
    const pre = preflightNamedTunnel(tunnelName, publicApiUrl);
    if (!pre.ok) {
      appendLog(`[tunnel] ERRO (nomeado): ${pre.error}`);
      if (pre.hint) appendLog(`[tunnel] ${pre.hint}`);
      return { ok: false, error: [pre.error, pre.hint].filter(Boolean).join(" — ") };
    }
  }

  appendLog(`[tunnel] iniciando (${mode}): ${bin} ${args.join(" ")}`);

  const child = spawn(bin, args, {
    env: { ...process.env },
    detached: false,
  });
  proc = child;

  const onChunk = (buf: Buffer) => {
    const text = String(buf);
    for (const line of text.split(/\r?\n/)) {
      if (line.trim()) appendLog(`[cloudflared] ${line.trim()}`);
    }
    const match = text.match(QUICK_URL_RE);
    if (match) {
      const url = match[0].replace(/\/$/, "");
      saveTunnelConfig({ lastQuickTunnelUrl: url });
      setPublicApiUrl(url);
      appendLog(`[tunnel] URL pública: ${url}`);
    }
  };

  child.stdout?.on("data", onChunk);
  child.stderr?.on("data", onChunk);
  child.on("exit", (code) => {
    appendLog(`[tunnel] cloudflared saiu (code=${code ?? "?"})`);
    if (proc === child) proc = null;
  });

  if (mode === "named") {
    await new Promise((r) => setTimeout(r, 2500));
    if (!proc || proc.killed) {
      const msg =
        "cloudflared encerrou — confira login (cert.pem), config.yml e se o túnel loja-geek-api existe.";
      return { ok: false, error: msg, publicUrl: publicApiUrl, publicHealthy: false };
    }
  }

  if (mode === "quick") {
    await waitQuickUrl(25_000);
  }

  const publicUrl = publicUrlFromConfig(getTunnelConfig());
  const publicHealthy = publicUrl ? await probeUrl(`${publicUrl}/api/health`) : false;
  if (publicUrl) setPublicApiUrl(publicUrl);
  if (mode === "quick" && !publicUrl) {
    return {
      ok: true,
      publicUrl: "",
      publicHealthy: false,
      error: "Túnel subiu, mas a URL trycloudflare ainda não apareceu — veja o log",
    };
  }

  return { ok: true, publicUrl, publicHealthy };
}

export async function applyTunnel(input: {
  mode?: TunnelMode;
  tunnelName?: string;
  publicApiUrl?: string;
  autoStart?: boolean;
  action?: "start" | "stop" | "apply";
}) {
  if (input.autoStart !== undefined) saveTunnelConfig({ autoStart: input.autoStart });
  if (input.tunnelName !== undefined) saveTunnelConfig({ tunnelName: input.tunnelName });
  if (input.publicApiUrl !== undefined) saveTunnelConfig({ publicApiUrl: input.publicApiUrl });

  const action = input.action || "apply";
  const mode = input.mode ?? getTunnelConfig().mode;

  if (action === "stop" || mode === "off") {
    stopTunnel();
    saveTunnelConfig({ mode: "off" });
    return { ok: true, status: buildFullStatus(false) };
  }

  saveTunnelConfig({ mode });
  const started = await startTunnel({
    mode,
    tunnelName: input.tunnelName,
    publicApiUrl: input.publicApiUrl,
  });
  return {
    ok: started.ok,
    error: started.error,
    status: buildFullStatus(started.publicHealthy ?? false, started.error),
  };
}

function buildFullStatus(publicHealthy: boolean, error?: string): TunnelStatus {
  const st = getTunnelStatus();
  st.publicHealthy = publicHealthy;
  st.error = error || "";
  st.lastCheck = new Date().toISOString();
  st.webhookUrl = publicUrlFromConfig(getTunnelConfig())
    ? `${publicUrlFromConfig(getTunnelConfig())}/api/portal/webhooks/mercadopago`
    : "";
  return st;
}

export async function getTunnelStatusFull(): Promise<TunnelStatus> {
  const st = getTunnelStatus();
  const url = publicUrlFromConfig(getTunnelConfig());
  if (url && st.running) {
    st.publicHealthy = await probeUrl(`${url}/api/health`);
    st.lastCheck = new Date().toISOString();
  }
  return st;
}

export async function autoStartTunnelIfEnabled() {
  const cfg = getTunnelConfig();
  if (!cfg.autoStart || cfg.mode === "off") return;
  appendLog("[tunnel] auto-start (configurado no GeekCentral)");
  await startTunnel({ mode: cfg.mode, tunnelName: cfg.tunnelName, publicApiUrl: cfg.publicApiUrl });
}

let healthTimer: ReturnType<typeof setInterval> | null = null;

export function startTunnelHealthProbe(intervalMs = 60_000) {
  if (healthTimer) return;
  healthTimer = setInterval(() => {
    if (!proc) return;
    checkTunnelPublicHealth().catch(() => undefined);
  }, intervalMs);
}
