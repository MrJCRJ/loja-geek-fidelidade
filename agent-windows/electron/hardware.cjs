/**
 * Inventário e amostra de carga no Windows (NVIDIA via nvidia-smi; AMD via WMI/fallback).
 * No Linux devolve stubs leves para dev.
 */
const { execFile } = require("node:child_process");
const os = require("node:os");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

function vendorFromName(name) {
  const n = String(name || "").toLowerCase();
  if (n.includes("nvidia") || n.includes("geforce") || n.includes("quadro") || n.includes("rtx") || n.includes("gtx")) {
    return "nvidia";
  }
  if (n.includes("amd") || n.includes("radeon") || n.includes("ati ")) return "amd";
  if (n.includes("intel") || n.includes("uhd") || n.includes("iris")) return "intel";
  return "other";
}

async function runPs(script, timeoutMs = 8000) {
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 },
    );
    return String(stdout || "").trim();
  } catch {
    return "";
  }
}

function collectDiskHealth(rootPath) {
  try {
    const fs = require("node:fs");
    if (typeof fs.statfsSync !== "function") return { diskFreePct: null, diskTotalGb: null };
    const s = fs.statfsSync(rootPath);
    const block = Number(s.bsize) || 0;
    const total = Number(s.blocks) * block;
    const free = Number(s.bavail != null ? s.bavail : s.bfree) * block;
    if (!total) return { diskFreePct: null, diskTotalGb: null };
    return {
      diskFreePct: Math.round((free / total) * 1000) / 10,
      diskTotalGb: Math.round((total / (1024 * 1024 * 1024)) * 10) / 10,
    };
  } catch {
    return { diskFreePct: null, diskTotalGb: null };
  }
}

function collectHealthFields() {
  const root = process.platform === "win32" ? "C:\\" : "/";
  const disk = collectDiskHealth(root);
  const ramTotal = os.totalmem();
  const ramFree = os.freemem();
  return {
    ...disk,
    uptimeSec: Math.round(os.uptime()),
    ramUsedPct: ramTotal ? Math.round(((ramTotal - ramFree) / ramTotal) * 1000) / 10 : null,
  };
}

async function collectHardwareWindows() {
  const cpuName = os.cpus()[0]?.model || null;
  const cpuCores = os.cpus().length;
  const ramTotalMb = Math.round(os.totalmem() / (1024 * 1024));
  const osBuild = `${os.type()} ${os.release()}`;
  const health = collectHealthFields();

  const gpuJson = await runPs(
    `$ErrorActionPreference='SilentlyContinue'; Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM | ConvertTo-Json -Compress`,
  );
  /** @type {Array<{vendor:string,model:string,vramMb:number|null}>} */
  let gpus = [];
  if (gpuJson) {
    try {
      const parsed = JSON.parse(gpuJson);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      gpus = list
        .filter((g) => g && g.Name)
        .map((g) => ({
          vendor: vendorFromName(g.Name),
          model: String(g.Name).slice(0, 120),
          vramMb:
            typeof g.AdapterRAM === "number" && g.AdapterRAM > 0
              ? Math.round(g.AdapterRAM / (1024 * 1024))
              : null,
        }));
    } catch {
      gpus = [];
    }
  }

  return {
    cpuName,
    cpuCores,
    cpuTdpW: null,
    gpus,
    ramTotalMb,
    osBuild,
    diskFreePct: health.diskFreePct,
    diskTotalGb: health.diskTotalGb,
    uptimeSec: health.uptimeSec,
    ramUsedPct: health.ramUsedPct,
  };
}

async function nvidiaSample() {
  try {
    const { stdout } = await execFileAsync(
      "nvidia-smi",
      ["--query-gpu=utilization.gpu,power.draw", "--format=csv,noheader,nounits"],
      { timeout: 4000, windowsHide: true },
    );
    const line = String(stdout || "").trim().split(/\r?\n/)[0] || "";
    const parts = line.split(",").map((s) => s.trim());
    const gpuPct = parts[0] != null && parts[0] !== "" ? Number(parts[0]) : null;
    const watts = parts[1] != null && parts[1] !== "" ? Number(parts[1]) : null;
    return {
      gpuPct: Number.isFinite(gpuPct) ? gpuPct : null,
      watts: Number.isFinite(watts) ? watts : null,
      source: watts != null ? "sensor" : null,
    };
  } catch {
    return { gpuPct: null, watts: null, source: null };
  }
}

async function amdGpuUtilWindows() {
  // Contador de desempenho GPU Engine (nem sempre disponível); falha → null
  const out = await runPs(
    `$ErrorActionPreference='SilentlyContinue'; $c = Get-Counter '\\GPU Engine(*)\\Utilization Percentage' -ErrorAction SilentlyContinue; if (-not $c) { '' } else { ($c.CounterSamples | Where-Object { $_.InstanceName -match 'engtype_3D' } | Measure-Object -Property CookedValue -Average).Average }`,
    6000,
  );
  const n = Number(out);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : null;
}

async function foregroundWindows() {
  const out = await runPs(
    `$ErrorActionPreference='SilentlyContinue'; Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class FG {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
}
'@; $h=[FG]::GetForegroundWindow(); if ($h -eq [IntPtr]::Zero) { '{"process":null,"title":null}'; exit }; $sb=New-Object System.Text.StringBuilder 256; [void][FG]::GetWindowText($h,$sb,256); $procId=0; [void][FG]::GetWindowThreadProcessId($h,[ref]$procId); $p=Get-Process -Id $procId -ErrorAction SilentlyContinue; $obj=[pscustomobject]@{process=($(if($p){$p.ProcessName+'.exe'}else{$null})); title=$sb.ToString()}; $obj | ConvertTo-Json -Compress`,
    5000,
  );
  if (!out) return { process: null, title: null };
  try {
    const j = JSON.parse(out);
    return {
      process: j.process ? String(j.process).slice(0, 64) : null,
      title: j.title ? String(j.title).slice(0, 200) : null,
    };
  } catch {
    return { process: null, title: null };
  }
}

function cpuPctApprox() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const c of cpus) {
    idle += c.times.idle;
    total += c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq;
  }
  return { idle, total };
}

let lastCpu = cpuPctApprox();

function sampleCpuPct() {
  const now = cpuPctApprox();
  const idleDelta = now.idle - lastCpu.idle;
  const totalDelta = now.total - lastCpu.total;
  lastCpu = now;
  if (totalDelta <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((1 - idleDelta / totalDelta) * 1000) / 10));
}

function sampleRamPct() {
  const total = os.totalmem();
  const free = os.freemem();
  if (!total) return null;
  return Math.round(((total - free) / total) * 1000) / 10;
}

/**
 * @param {{ primaryGpuVendor?: string|null }} opts
 */
async function collectLoadSample(opts = {}) {
  const cpuPct = sampleCpuPct();
  const ramPct = sampleRamPct();
  let gpuPct = null;
  let watts = null;
  let wattsSource = null;

  const vendor = opts.primaryGpuVendor || null;
  if (process.platform === "win32") {
    if (vendor === "nvidia" || vendor == null) {
      const nv = await nvidiaSample();
      if (nv.gpuPct != null || nv.watts != null) {
        gpuPct = nv.gpuPct;
        watts = nv.watts;
        wattsSource = nv.watts != null ? "sensor" : null;
      }
    }
    if (gpuPct == null && (vendor === "amd" || vendor == null)) {
      gpuPct = await amdGpuUtilWindows();
    }
  }

  const fg = process.platform === "win32" ? await foregroundWindows() : { process: null, title: null };

  return {
    cpuPct,
    gpuPct,
    ramPct,
    watts,
    wattsSource,
    appProcess: fg.process,
    appTitle: fg.title,
  };
}

async function collectHardware() {
  if (process.platform === "win32") return collectHardwareWindows();
  const health = collectHealthFields();
  return {
    cpuName: os.cpus()[0]?.model || null,
    cpuCores: os.cpus().length,
    cpuTdpW: null,
    gpus: [],
    ramTotalMb: Math.round(os.totalmem() / (1024 * 1024)),
    osBuild: `${os.type()} ${os.release()}`,
    diskFreePct: health.diskFreePct,
    diskTotalGb: health.diskTotalGb,
    uptimeSec: health.uptimeSec,
    ramUsedPct: health.ramUsedPct,
  };
}

module.exports = { collectHardware, collectLoadSample, collectHealthFields, vendorFromName };
