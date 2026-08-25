const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

function psEscape(str) {
  return String(str).replace(/'/g, "''");
}

/**
 * Cria atalho .lnk no Windows (Área de trabalho e/ou Menu Iniciar).
 * @param {{ target: string, name: string, args?: string, cwd?: string, desktop?: boolean, startMenu?: boolean }} opts
 */
function createWindowsShortcuts(opts) {
  if (process.platform !== "win32") {
    return Promise.resolve({ ok: false, error: "Só Windows" });
  }
  const target = opts.target;
  const name = opts.name || "GeekCentral";
  const args = opts.args || "";
  const cwd = opts.cwd || path.dirname(target);
  const jobs = [];

  if (opts.desktop !== false) {
    jobs.push(path.join(os.homedir(), "Desktop", `${name}.lnk`));
    // OneDrive Desktop
    const od = path.join(os.homedir(), "OneDrive", "Desktop", `${name}.lnk`);
    if (fs.existsSync(path.dirname(od))) jobs.push(od);
  }
  if (opts.startMenu !== false) {
    const sm = path.join(
      process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
      "Microsoft",
      "Windows",
      "Start Menu",
      "Programs",
      `${name}.lnk`,
    );
    jobs.push(sm);
  }

  const script = jobs
    .map((lnk) => {
      return `
$s = New-Object -ComObject WScript.Shell
$sc = $s.CreateShortcut('${psEscape(lnk)}')
$sc.TargetPath = '${psEscape(target)}'
$sc.Arguments = '${psEscape(args)}'
$sc.WorkingDirectory = '${psEscape(cwd)}'
$sc.Description = '${psEscape(name)}'
$sc.Save()
`;
    })
    .join("\n");

  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true },
      (err, _stdout, stderr) => {
        if (err) {
          resolve({ ok: false, error: String(stderr || err.message) });
          return;
        }
        resolve({ ok: true, paths: jobs });
      },
    );
  });
}

function removeWindowsShortcuts(name = "GeekCentral") {
  if (process.platform !== "win32") return { ok: true, removed: [] };
  const candidates = [
    path.join(os.homedir(), "Desktop", `${name}.lnk`),
    path.join(os.homedir(), "OneDrive", "Desktop", `${name}.lnk`),
    path.join(
      process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
      "Microsoft",
      "Windows",
      "Start Menu",
      "Programs",
      `${name}.lnk`,
    ),
  ];
  const removed = [];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
        removed.push(p);
      }
    } catch {
      /* ignore */
    }
  }
  return { ok: true, removed };
}

module.exports = { createWindowsShortcuts, removeWindowsShortcuts };
