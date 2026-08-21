const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");

const DEFAULTS = {
  serverUrl: "http://192.168.3.90:8787",
  stationName: "PC-01",
  sharedSecret: "loja-geek-station-secret",
  staffPin: "2580",
  absentSecondsToLock: 60,
  stationToken: "",
};

function configCandidates() {
  const list = [];
  // Ao lado do executável (pendrive / portable)
  list.push(path.join(path.dirname(process.execPath), "config.json"));
  // Pasta do app empacotado
  if (process.resourcesPath) {
    list.push(path.join(process.resourcesPath, "config.json"));
  }
  // Dev / pasta do projeto
  list.push(path.join(app.getAppPath(), "config.json"));
  list.push(path.join(__dirname, "..", "config.json"));
  return list;
}

function loadConfig() {
  for (const file of configCandidates()) {
    try {
      if (fs.existsSync(file)) {
        const raw = JSON.parse(fs.readFileSync(file, "utf8"));
        return { ...DEFAULTS, ...raw, _configPath: file };
      }
    } catch {
      /* try next */
    }
  }
  return { ...DEFAULTS, _configPath: null };
}

function saveStationToken(token) {
  const cfg = loadConfig();
  const target =
    cfg._configPath ||
    path.join(path.dirname(process.execPath), "config.json") ||
    path.join(__dirname, "..", "config.json");
  const next = { ...cfg, stationToken: token };
  delete next._configPath;
  fs.writeFileSync(target, JSON.stringify(next, null, 2), "utf8");
  return target;
}

module.exports = { loadConfig, saveStationToken, DEFAULTS };
