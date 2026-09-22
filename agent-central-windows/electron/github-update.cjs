/**
 * Atualização portable via GitHub Releases (ZIP completo).
 * Asset esperado: GeekCentral-win-x64.zip no release tag central-vX.Y.Z
 * Mantém a pasta data\ da instalação.
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn, execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

const REPO_OWNER = "MrJCRJ";
const REPO_NAME = "loja-geek-fidelidade";
const ASSET_NAME = "GeekCentral-win-x64.zip";

function getApp() {
  return require("electron").app;
}

function installDir() {
  return path.dirname(process.execPath);
}

function currentVersion() {
  try {
    return String(getApp().getVersion() || "0.0.0");
  } catch {
    try {
      return String(require("../package.json").version || "0.0.0");
    } catch {
      return "0.0.0";
    }
  }
}

function parseSemver(v) {
  const m = String(v || "")
    .replace(/^central-v/i, "")
    .replace(/^v/i, "")
    .trim()
    .match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function cmpSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

async function ghFetch(url, token, accept = "application/vnd.github+json") {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: accept,
      "User-Agent": "GeekCentral-Updater",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    redirect: "follow",
  });
  return res;
}

async function checkForUpdate(token) {
  if (!token || !String(token).trim()) {
    return { ok: false, error: "Configure o token GitHub (só leitura) em Atualizar" };
  }
  const res = await ghFetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`,
    token.trim(),
  );
  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: "Token inválido ou sem permissão (contents:read)" };
  }
  if (res.status === 404) {
    return { ok: false, error: "Nenhum release encontrado no GitHub" };
  }
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { ok: false, error: `GitHub HTTP ${res.status}: ${t.slice(0, 120)}` };
  }
  const release = await res.json();
  const tag = String(release.tag_name || "");
  const version = tag.replace(/^central-v/i, "").replace(/^v/i, "");
  const asset = (release.assets || []).find((a) => a.name === ASSET_NAME);
  if (!asset) {
    return {
      ok: false,
      error: `Release ${tag} sem asset ${ASSET_NAME}`,
      latestVersion: version,
      currentVersion: currentVersion(),
    };
  }
  const current = currentVersion();
  const newer = cmpSemver(current, version) < 0;
  return {
    ok: true,
    updateAvailable: newer,
    currentVersion: current,
    latestVersion: version,
    tag,
    assetId: asset.id,
    assetName: asset.name,
    assetUrl: asset.url,
    size: asset.size,
    notes: String(release.body || "").slice(0, 500),
  };
}

async function downloadToFile(token, assetUrl, destFile, onProgress) {
  const res = await fetch(assetUrl, {
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      Accept: "application/octet-stream",
      "User-Agent": "GeekCentral-Updater",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Download HTTP ${res.status}`);
  }
  const total = Number(res.headers.get("content-length") || 0);
  const reader = res.body?.getReader?.();
  if (!reader) {
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destFile, buf);
    if (onProgress) onProgress(1);
    return;
  }
  await fs.promises.mkdir(path.dirname(destFile), { recursive: true });
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
    received += value.length;
    if (onProgress && total > 0) onProgress(received / total);
  }
  fs.writeFileSync(destFile, Buffer.concat(chunks));
  if (onProgress) onProgress(1);
}

async function extractZip(zipPath, destDir) {
  await fs.promises.rm(destDir, { recursive: true, force: true });
  await fs.promises.mkdir(destDir, { recursive: true });
  const zipEsc = zipPath.replace(/'/g, "''");
  const destEsc = destDir.replace(/'/g, "''");
  await execFileAsync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Expand-Archive -LiteralPath '${zipEsc}' -DestinationPath '${destEsc}' -Force`,
    ],
    { windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
  );
}

function findPayloadRoot(extractDir) {
  if (fs.existsSync(path.join(extractDir, "GeekCentral.exe"))) return extractDir;
  const entries = fs.readdirSync(extractDir);
  for (const name of entries) {
    const p = path.join(extractDir, name);
    try {
      if (fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, "GeekCentral.exe"))) {
        return p;
      }
    } catch {
      /* ignore */
    }
  }
  throw new Error("ZIP inválido: GeekCentral.exe não encontrado");
}

/**
 * Agenda robocopy após sair (preserva data\).
 */
function scheduleApplyAndRelaunch(payloadDir, log = console) {
  const dst = installDir();
  const bat = path.join(os.tmpdir(), `geekcentral-apply-${Date.now()}.cmd`);
  const lines = [
    "@echo off",
    "setlocal",
    `set "SRC=${payloadDir}"`,
    `set "DST=${dst}"`,
    "timeout /t 5 /nobreak >nul",
    'robocopy "%SRC%" "%DST%" /E /XD data /R:3 /W:2 /NFL /NDL /NJH /NJS /nc /ns /np',
    'if exist "%DST%\\GeekCentral.exe" start "" "%DST%\\GeekCentral.exe"',
    'del "%~f0"',
  ];
  fs.writeFileSync(bat, lines.join("\r\n"), "utf8");
  log.info?.("[update] apply bat:", bat);
  const child = spawn("cmd.exe", ["/c", bat], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

async function downloadAndInstall(token, info, opts = {}) {
  const log = opts.log || console;
  const onProgress = opts.onProgress;
  if (!info?.assetUrl) throw new Error("Sem asset para baixar");

  const tmpRoot = path.join(os.tmpdir(), `geekcentral-upd-${Date.now()}`);
  await fs.promises.mkdir(tmpRoot, { recursive: true });
  const zipPath = path.join(tmpRoot, ASSET_NAME);
  const extractDir = path.join(tmpRoot, "extract");

  log.info?.("[update] baixando", info.latestVersion);
  await downloadToFile(token, info.assetUrl, zipPath, onProgress);
  log.info?.("[update] extraindo…");
  await extractZip(zipPath, extractDir);
  const payload = findPayloadRoot(extractDir);
  scheduleApplyAndRelaunch(payload, log);
  return { ok: true, willRelaunch: true, version: info.latestVersion };
}

module.exports = {
  REPO_OWNER,
  REPO_NAME,
  ASSET_NAME,
  currentVersion,
  checkForUpdate,
  downloadAndInstall,
  cmpSemver,
  installDir,
};
