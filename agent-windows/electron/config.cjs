const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");

const DEFAULTS = {
  serverUrl: "",
  stationName: "",
  sharedSecret: "",
  staffPin: "2580",
  absentSecondsToLock: 60,
  stationToken: "",
  setupComplete: false,
  openAtLogin: true,
};

function configCandidates() {
  const list = [];
  list.push(path.join(path.dirname(process.execPath), "config.json"));
  if (process.resourcesPath) {
    list.push(path.join(process.resourcesPath, "config.json"));
  }
  list.push(path.join(app.getAppPath(), "config.json"));
  list.push(path.join(__dirname, "..", "config.json"));
  return list;
}

function writableConfigPath(cfg) {
  return (
    cfg._configPath ||
    path.join(path.dirname(process.execPath), "config.json") ||
    path.join(__dirname, "..", "config.json")
  );
}

function loadConfig() {
  for (const file of configCandidates()) {
    try {
      if (fs.existsSync(file)) {
        const raw = JSON.parse(fs.readFileSync(file, "utf8"));
        const merged = { ...DEFAULTS, ...raw, _configPath: file };
        // configs antigos com IP fixo e token já contam como setup feito
        if (merged.setupComplete !== true) {
          if (merged.stationToken && merged.serverUrl) merged.setupComplete = true;
        }
        return merged;
      }
    } catch {
      /* try next */
    }
  }
  return { ...DEFAULTS, _configPath: null };
}

function saveConfig(partial) {
  const cfg = loadConfig();
  const target = writableConfigPath(cfg);
  const next = { ...cfg, ...partial };
  delete next._configPath;
  fs.writeFileSync(target, JSON.stringify(next, null, 2), "utf8");
  return { ...next, _configPath: target };
}

function saveStationToken(token) {
  return saveConfig({ stationToken: token });
}

module.exports = { loadConfig, saveStationToken, saveConfig, DEFAULTS };
