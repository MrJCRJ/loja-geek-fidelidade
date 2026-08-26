const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

function filePath() {
  return path.join(app.getPath("userData"), "last-failure.json");
}

function writeLastFailure(kind, message) {
  try {
    fs.writeFileSync(
      filePath(),
      JSON.stringify(
        {
          kind: String(kind || "error").slice(0, 64),
          message: String(message || "").slice(0, 500),
          at: new Date().toISOString(),
        },
        null,
        2,
      ),
      "utf8",
    );
  } catch {
    /* ignore */
  }
}

function readLastFailure() {
  try {
    const raw = fs.readFileSync(filePath(), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearLastFailure() {
  try {
    fs.unlinkSync(filePath());
  } catch {
    /* ignore */
  }
}

module.exports = { writeLastFailure, readLastFailure, clearLastFailure };
