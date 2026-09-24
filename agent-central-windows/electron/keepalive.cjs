/**
 * Relança o .exe e o cloudflared se caírem — a tarefa Windows
 * GeekCentral-ManterLigado cobre o caso do Electron já morto.
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const TASK_NAME = "GeekCentral-ManterLigado";

const SCRIPT_BODY = [
  "# Relanca GeekCentral e o tunel se tiverem caido (tarefa Windows GeekCentral-ManterLigado).",
  "$ErrorActionPreference = \"Continue\"",
  "$root = Split-Path -Parent $PSScriptRoot",
  "$exe = Join-Path $root \"GeekCentral.exe\"",
  "$log = Join-Path $PSScriptRoot \"manter-ligado.log\"",
  "$cooldown = Join-Path $PSScriptRoot \"manter-ligado-tunnel.cooldown\"",
  "$cfBin = Join-Path $PSScriptRoot \"cloudflared\\cloudflared.exe\"",
  "$cfCfg = Join-Path $root \"cloudflared-config\\config.yml\"",
  "$cfErr = Join-Path $PSScriptRoot \"cloudflared-tunnel.err.log\"",
  "",
  "function Write-KeepAliveLog([string]$msg) {",
  "  $line = \"{0} {1}\" -f (Get-Date -Format \"yyyy-MM-dd HH:mm:ss\"), $msg",
  "  try { Add-Content -Path $log -Value $line -Encoding UTF8 } catch {}",
  "}",
  "",
  "if (-not (Test-Path -LiteralPath $exe)) {",
  "  Write-KeepAliveLog \"ERRO: exe nao encontrado: $exe\"",
  "  exit 1",
  "}",
  "",
  "$running = Get-Process -Name \"GeekCentral\" -ErrorAction SilentlyContinue",
  "if (-not $running) {",
  "  Write-KeepAliveLog \"GeekCentral ausente - relancando\"",
  "  try {",
  "    Start-Process -FilePath $exe -WorkingDirectory $root",
  "    Write-KeepAliveLog \"GeekCentral relancado\"",
  "  } catch {",
  "    Write-KeepAliveLog (\"ERRO ao relancar: {0}\" -f $_.Exception.Message)",
  "    exit 1",
  "  }",
  "  exit 0",
  "}",
  "",
  "if (-not (Test-Path -LiteralPath $cfBin) -or -not (Test-Path -LiteralPath $cfCfg)) { exit 0 }",
  "",
  "$cf = Get-Process -Name \"cloudflared\" -ErrorAction SilentlyContinue",
  "if (-not $cf) {",
  "  Write-KeepAliveLog \"cloudflared ausente - religando tunel\"",
  "  try {",
  "    Start-Process -FilePath $cfBin -ArgumentList @(\"tunnel\",\"--config\",$cfCfg,\"run\",\"loja-geek-api\") -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardError $cfErr",
  "    Write-KeepAliveLog \"cloudflared relancado\"",
  "  } catch {",
  "    Write-KeepAliveLog (\"ERRO cloudflared: {0}\" -f $_.Exception.Message)",
  "  }",
  "  exit 0",
  "}",
  "",
  "$publicOk = $false",
  "try {",
  "  $r = Invoke-WebRequest -Uri \"https://api.geekloja.com.br/api/health\" -TimeoutSec 8 -UseBasicParsing",
  "  if ($r.StatusCode -eq 200 -and $r.Content -match '\"ok\"\\s*:\\s*true') { $publicOk = $true }",
  "} catch {}",
  "if ($publicOk) { exit 0 }",
  "",
  "if (Test-Path -LiteralPath $cooldown) {",
  "  $age = (Get-Date) - (Get-Item -LiteralPath $cooldown).LastWriteTime",
  "  if ($age.TotalSeconds -lt 90) { exit 0 }",
  "}",
  "try { Set-Content -Path $cooldown -Value (Get-Date -Format o) -Encoding ASCII } catch {}",
  "Write-KeepAliveLog \"tunel publico down - reiniciando cloudflared\"",
  "try {",
  "  Get-Process -Name \"cloudflared\" -ErrorAction SilentlyContinue | Stop-Process -Force",
  "  Start-Sleep -Seconds 2",
  "  Start-Process -FilePath $cfBin -ArgumentList @(\"tunnel\",\"--config\",$cfCfg,\"run\",\"loja-geek-api\") -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardError $cfErr",
  "  Write-KeepAliveLog \"cloudflared reiniciado\"",
  "} catch {",
  "  Write-KeepAliveLog (\"ERRO ao reiniciar tunel: {0}\" -f $_.Exception.Message)",
  "}",
].join("\r\n");

function scriptPath(dataDir) {
  return path.join(dataDir, "manter-ligado.ps1");
}

async function registerTask(exePath, scriptFile) {
  const args = [
    "/Create",
    "/F",
    "/TN",
    TASK_NAME,
    "/SC",
    "MINUTE",
    "/MO",
    "2",
    "/RL",
    "LIMITED",
    "/TR",
    `powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "${scriptFile}"`,
  ];
  await execFileAsync("schtasks.exe", args, { windowsHide: true });
}

async function ensureKeepAlive({ dataDir, exePath, log = () => {} }) {
  if (process.platform !== "win32") return { ok: true, skipped: true };
  const dest = scriptPath(dataDir);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dest, `${SCRIPT_BODY}\r\n`, "utf8");
  try {
    await registerTask(exePath, dest);
    return { ok: true, script: dest };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`[keepalive] ${message}`);
    return { ok: false, error: message, script: dest };
  }
}

module.exports = { ensureKeepAlive, TASK_NAME };
