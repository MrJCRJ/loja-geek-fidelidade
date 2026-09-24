/**
 * Atualização portable via ZIP servido pelo GeekCentral.
 * Mantém config.json da estação.
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn, execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const ASSET_NAME = "GeekLock-win-x64.zip";

let applying = false;

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

async function downloadToFile(url, token, destFile) {
  const res = await fetch(url, {
    headers: {
      "x-station-token": token,
      "User-Agent": "GeekLock-Updater",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Download HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.promises.mkdir(path.dirname(destFile), { recursive: true });
  fs.writeFileSync(destFile, buf);
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
  if (fs.existsSync(path.join(extractDir, "GeekLock.exe"))) return extractDir;
  const entries = fs.readdirSync(extractDir);
  for (const name of entries) {
    const p = path.join(extractDir, name);
    try {
      if (fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, "GeekLock.exe"))) {
        return p;
      }
    } catch {
      /* ignore */
    }
  }
  throw new Error("ZIP inválido: GeekLock.exe não encontrado");
}

function scheduleApplyAndRelaunch(payloadDir, log = console) {
  const dst = installDir();
  const bat = path.join(os.tmpdir(), `geeklock-apply-${Date.now()}.cmd`);
  const lines = [
    "@echo off",
    "setlocal",
    `set "SRC=${payloadDir}"`,
    `set "DST=${dst}"`,
    "timeout /t 5 /nobreak >nul",
    'robocopy "%SRC%" "%DST%" /E /XF config.json /XD data /R:3 /W:2 /NFL /NDL /NJH /NJS /nc /ns /np',
    'if exist "%DST%\\GeekLock.exe" start "" "%DST%\\GeekLock.exe"',
    'del "%~f0"',
  ];
  fs.writeFileSync(bat, lines.join("\r\n"), "utf8");
  log.info?.("[lock-update] apply bat:", bat);
  const child = spawn("cmd.exe", ["/c", bat], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

async function downloadAndInstall(serverUrl, stationToken, log = console) {
  if (applying) return { ok: true, already: true };
  if (!serverUrl || !stationToken) return { ok: false, error: "Sem Central/token" };
  applying = true;
  try {
    const tmpRoot = path.join(os.tmpdir(), `geeklock-upd-${Date.now()}`);
    await fs.promises.mkdir(tmpRoot, { recursive: true });
    const zipPath = path.join(tmpRoot, ASSET_NAME);
    const extractDir = path.join(tmpRoot, "extract");
    const url = `${String(serverUrl).replace(/\/$/, "")}/api/stations/lock-update/package`;
    log.info?.("[lock-update] baixando do Central");
    await downloadToFile(url, stationToken, zipPath);
    await extractZip(zipPath, extractDir);
    const payload = findPayloadRoot(extractDir);
    scheduleApplyAndRelaunch(payload, log);
    return { ok: true, willRelaunch: true };
  } catch (err) {
    applying = false;
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

module.exports = {
  ASSET_NAME,
  currentVersion,
  downloadAndInstall,
};
