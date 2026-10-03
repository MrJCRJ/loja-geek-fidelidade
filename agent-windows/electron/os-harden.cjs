/**
 * Hardening Windows no lock: atalhos, TaskMgr, USB storage (pendrive).
 * Webcam/HID não são tocados. USB storage volta no unlock.
 * Preferência: tarefa agendada GeekLockHarden (SYSTEM, criada pelo instalador).
 * Fallback: registro direto se o processo tiver permissão.
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { globalShortcut } = require("electron");

const execFileAsync = promisify(execFile);

const STATE_FILE = "C:\\GeekLock\\harden-state.txt";
const TASK_NAME = "GeekLockHarden";

/** @type {string[]} */
const LOCK_SHORTCUTS = [
  "Alt+F4",
  "Alt+Tab",
  "Alt+Escape",
  "Control+Escape",
  "Control+Shift+Escape",
  "Control+M",
  "CommandOrControl+M",
  "Meta+D",
  "Super+D",
  "Super+E",
  "Super+R",
  "Super+Tab",
];

/** @type {Set<string>} */
const registeredLockShortcuts = new Set();

function isWin() {
  return process.platform === "win32";
}

function writeState(locked) {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, locked ? "locked" : "unlocked", "utf8");
  } catch {
    /* ignore */
  }
}

async function runHardenTask() {
  if (!isWin()) return false;
  try {
    await execFileAsync("schtasks", ["/Run", "/TN", TASK_NAME], {
      windowsHide: true,
      timeout: 8000,
    });
    return true;
  } catch {
    return false;
  }
}

async function applyRegistryFallback(locked) {
  if (!isWin()) return;
  const deny = locked ? "1" : "0";
  const diskKey =
    "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\RemovableStorageDevices\\{53f5630d-b6bf-11d0-94f2-00a0c91efb8b}";
  const taskMgrKey = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System";
  try {
    if (locked) {
      await execFileAsync("reg", ["add", diskKey, "/v", "Deny_Read", "/t", "REG_DWORD", "/d", deny, "/f"], {
        windowsHide: true,
        timeout: 5000,
      });
      await execFileAsync("reg", ["add", diskKey, "/v", "Deny_Write", "/t", "REG_DWORD", "/d", deny, "/f"], {
        windowsHide: true,
        timeout: 5000,
      });
      await execFileAsync("reg", ["add", diskKey, "/v", "Deny_Execute", "/t", "REG_DWORD", "/d", deny, "/f"], {
        windowsHide: true,
        timeout: 5000,
      });
      await execFileAsync(
        "reg",
        ["add", taskMgrKey, "/v", "DisableTaskMgr", "/t", "REG_DWORD", "/d", "1", "/f"],
        { windowsHide: true, timeout: 5000 },
      );
    } else {
      await execFileAsync("reg", ["delete", diskKey, "/f"], { windowsHide: true, timeout: 5000 }).catch(
        () => undefined,
      );
      await execFileAsync("reg", ["delete", taskMgrKey, "/v", "DisableTaskMgr", "/f"], {
        windowsHide: true,
        timeout: 5000,
      }).catch(() => undefined);
    }
  } catch {
    /* sem admin — tarefa SYSTEM cobre */
  }
}

function registerLockShortcuts(onFire) {
  if (!isWin()) return;
  unregisterLockShortcuts();
  for (const accel of LOCK_SHORTCUTS) {
    try {
      if (globalShortcut.isRegistered(accel)) continue;
      const ok = globalShortcut.register(accel, onFire);
      if (ok) registeredLockShortcuts.add(accel);
    } catch {
      /* Win/Alt+Tab costumam falhar — ok */
    }
  }
}

function unregisterLockShortcuts() {
  for (const accel of registeredLockShortcuts) {
    try {
      globalShortcut.unregister(accel);
    } catch {
      /* ignore */
    }
  }
  registeredLockShortcuts.clear();
}

/**
 * @param {boolean} locked
 * @param {{ onShortcut?: () => void }} [opts]
 */
async function applyOsHarden(locked, opts = {}) {
  writeState(locked);
  if (locked) {
    registerLockShortcuts(opts.onShortcut || (() => undefined));
  } else {
    unregisterLockShortcuts();
  }
  const ran = await runHardenTask();
  if (!ran) await applyRegistryFallback(locked);
}

module.exports = {
  applyOsHarden,
  unregisterLockShortcuts,
  STATE_FILE,
  TASK_NAME,
};
