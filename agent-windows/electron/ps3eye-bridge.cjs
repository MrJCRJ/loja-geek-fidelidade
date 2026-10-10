/**
 * Ponte local da PlayStation Eye (SLEH-00448, USB VID_1415 PID_2000).
 * O Windows não trata essa câmera como UVC. O driver DirectShow
 * "PS3 Eye Universal" entrega o vídeo; o Chromium do GeekLock não lê DirectShow.
 * Esta ponte publica o último JPEG em 127.0.0.1 para o renderer montar um MediaStream.
 */
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");

const PORT = 4777;
const HOST = "127.0.0.1";

let server = null;
let ffmpeg = null;
let latest = null;
let frameCount = 0;
let lastError = "";
let deviceName = "";

function ffmpegBin() {
  let bin = require("ffmpeg-static");
  if (typeof bin === "string" && bin.includes("app.asar")) {
    bin = bin.replace("app.asar", "app.asar.unpacked");
  }
  if (!bin || !fs.existsSync(bin)) {
    throw new Error("ffmpeg não encontrado (pacote ffmpeg-static)");
  }
  return bin;
}

function listDshowVideos(bin) {
  return new Promise((resolve) => {
    const child = spawn(bin, ["-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"], {
      windowsHide: true,
    });
    let text = "";
    const take = (chunk) => {
      text += chunk.toString("utf8");
    };
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    child.on("error", () => resolve([]));
    child.on("close", () => {
      const names = [];
      const re = /"([^"]+)"\s+\(video\)/g;
      let m;
      while ((m = re.exec(text))) names.push(m[1]);
      resolve(names);
    });
  });
}

function pickDevice(names) {
  return (
    names.find((n) => /ps3\s*eye|playstation\s*eye/i.test(n)) ||
    names.find((n) => /eye universal/i.test(n)) ||
    null
  );
}

function consumeMjpeg(chunk, onFrame) {
  consumeMjpeg.buf = consumeMjpeg.buf ? Buffer.concat([consumeMjpeg.buf, chunk]) : Buffer.from(chunk);
  let buf = consumeMjpeg.buf;
  while (buf.length > 4) {
    const start = buf.indexOf(Buffer.from([0xff, 0xd8]));
    if (start < 0) {
      buf = Buffer.alloc(0);
      break;
    }
    if (start > 0) buf = buf.subarray(start);
    const end = buf.indexOf(Buffer.from([0xff, 0xd9]), 2);
    if (end < 0) break;
    onFrame(Buffer.from(buf.subarray(0, end + 2)));
    buf = buf.subarray(end + 2);
  }
  consumeMjpeg.buf = buf.length > 8_000_000 ? Buffer.alloc(0) : buf;
}

function startFfmpeg(bin, name) {
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "dshow",
    "-rtbufsize",
    "64M",
    "-video_size",
    "640x480",
    "-framerate",
    "30",
    "-i",
    `video=${name}`,
    "-an",
    "-vf",
    "fps=15",
    "-q:v",
    "6",
    "-f",
    "mjpeg",
    "pipe:1",
  ];
  const child = spawn(bin, args, { windowsHide: true });
  child.stdout.on("data", (chunk) => {
    consumeMjpeg(chunk, (jpeg) => {
      latest = jpeg;
      frameCount += 1;
      lastError = "";
    });
  });
  let errBuf = "";
  child.stderr.on("data", (chunk) => {
    errBuf = (errBuf + chunk.toString("utf8")).slice(-2000);
    if (errBuf.trim()) lastError = errBuf.trim();
  });
  child.on("error", (err) => {
    lastError = err.message;
  });
  child.on("close", (code) => {
    if (ffmpeg === child) ffmpeg = null;
    if (code && code !== 0 && !lastError) lastError = `ffmpeg encerrou (${code})`;
  });
  return child;
}

function ensureServer() {
  if (server) return;
  server = http.createServer((req, res) => {
    const url = req.url || "/";
    if (url.startsWith("/health")) {
      const body = JSON.stringify({
        ok: frameCount > 0,
        device: deviceName,
        frames: frameCount,
        error: frameCount > 0 ? "" : lastError,
      });
      res.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "no-store",
        "access-control-allow-origin": "*",
      });
      res.end(body);
      return;
    }
    if (url.startsWith("/snapshot.jpg")) {
      if (!latest) {
        res.writeHead(503, { "access-control-allow-origin": "*", "cache-control": "no-store" });
        res.end();
        return;
      }
      res.writeHead(200, {
        "content-type": "image/jpeg",
        "cache-control": "no-store",
        "access-control-allow-origin": "*",
      });
      res.end(latest);
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(PORT, HOST);
}

async function startPs3EyeBridge(log) {
  if (process.platform !== "win32") return { ok: false, reason: "só Windows" };
  if (ffmpeg) return { ok: true, already: true, device: deviceName };
  let bin;
  try {
    bin = ffmpegBin();
  } catch (err) {
    lastError = err.message;
    log?.warn?.("ps3eye:", err.message);
    return { ok: false, reason: err.message };
  }
  const names = await listDshowVideos(bin);
  const name = pickDevice(names);
  if (!name) {
    lastError = "DirectShow sem PlayStation Eye";
    log?.log?.("ps3eye: nenhum dispositivo DirectShow da Eye (", names.join(", ") || "vazio", ")");
    return { ok: false, reason: lastError, devices: names };
  }
  deviceName = name;
  consumeMjpeg.buf = null;
  ensureServer();
  ffmpeg = startFfmpeg(bin, name);
  log?.log?.(`ps3eye: ponte em http://${HOST}:${PORT} (${name})`);
  return { ok: true, device: name, port: PORT };
}

function stopPs3EyeBridge() {
  if (ffmpeg) {
    try {
      ffmpeg.kill();
    } catch {
      /* ignore */
    }
    ffmpeg = null;
  }
  if (server) {
    try {
      server.close();
    } catch {
      /* ignore */
    }
    server = null;
  }
}

module.exports = {
  PORT,
  HOST,
  startPs3EyeBridge,
  stopPs3EyeBridge,
};

if (require.main === module) {
  startPs3EyeBridge(console).then((info) => {
    console.log(JSON.stringify(info));
    if (!info.ok) process.exit(1);
  });
}
