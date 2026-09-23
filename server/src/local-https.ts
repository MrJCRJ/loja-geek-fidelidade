import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import { spawnSync } from "node:child_process";
import type { FastifyInstance } from "fastify";
import { SHOP_HOST } from "./request-scope.js";

const PFX_PASS = "geeklocal";

function lanIps(): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family !== "IPv4" || net.internal) continue;
      if (net.address.startsWith("172.1") || net.address.startsWith("172.2")) continue;
      out.push(net.address);
    }
  }
  return out;
}

function dataDirFromDb(databasePath: string): string {
  return path.dirname(databasePath);
}

function ensurePfx(dataDir: string, names: string[]): Buffer | null {
  const dir = path.join(dataDir, "certs");
  const pfxPath = path.join(dir, "geek.local.pfx");
  const metaPath = path.join(dir, "geek.local.names.json");
  fs.mkdirSync(dir, { recursive: true });
  const wanted = [...names].sort().join(",");
  if (fs.existsSync(pfxPath) && fs.existsSync(metaPath)) {
    try {
      const prev = String(JSON.parse(fs.readFileSync(metaPath, "utf8")).names || "");
      if (prev === wanted) return fs.readFileSync(pfxPath);
    } catch {
      /* regen */
    }
  }

  if (process.platform !== "win32") return fs.existsSync(pfxPath) ? fs.readFileSync(pfxPath) : null;

  const dnsList = names.map((n) => `'${n.replace(/'/g, "")}'`).join(",");
  const script = `
$ErrorActionPreference = 'Stop'
$dns = @(${dnsList})
$cert = New-SelfSignedCertificate -DnsName $dns -FriendlyName 'GeekLocal' -NotAfter (Get-Date).AddYears(10) -KeyAlgorithm RSA -KeyLength 2048 -CertStoreLocation 'Cert:\\CurrentUser\\My' -KeyExportPolicy Exportable
$pwd = ConvertTo-SecureString '${PFX_PASS}' -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath '${pfxPath.replace(/'/g, "''")}' -Password $pwd | Out-Null
`;
  const ps = spawnSync("powershell.exe", ["-NoProfile", "-Command", script], {
    windowsHide: true,
    encoding: "utf8",
  });
  if (ps.status !== 0 || !fs.existsSync(pfxPath)) {
    return fs.existsSync(pfxPath) ? fs.readFileSync(pfxPath) : null;
  }
  fs.writeFileSync(metaPath, JSON.stringify({ names: wanted }));
  return fs.readFileSync(pfxPath);
}

function attachToFastify(app: FastifyInstance, server: http.Server | https.Server) {
  server.on("request", (req, res) => {
    app.server.emit("request", req, res);
  });
  server.on("upgrade", (req, socket, head) => {
    app.server.emit("upgrade", req, socket, head);
  });
}

function listen(server: http.Server | https.Server, port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const onErr = () => resolve(false);
    server.once("error", onErr);
    try {
      server.listen(port, host, () => {
        server.off("error", onErr);
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}

/** HTTPS na 443 (e HTTP 80 → https) para https://geek.local no celular. */
export async function startLocalHttpsFront(app: FastifyInstance, databasePath: string): Promise<void> {
  const dataDir = dataDirFromDb(databasePath);
  const ips = lanIps();
  const names = [SHOP_HOST, "localhost", ...ips];
  const pfx = ensurePfx(dataDir, names);
  if (!pfx) {
    app.log.warn("HTTPS local: não gerou certificado (celular pode usar http://IP:8787)");
    return;
  }

  const httpsServer = https.createServer({ pfx, passphrase: PFX_PASS });
  attachToFastify(app, httpsServer);
  const httpsOk = (await listen(httpsServer, 443, "0.0.0.0")) || (await listen(httpsServer, 8443, "0.0.0.0"));
  if (!httpsOk) {
    app.log.warn("HTTPS local: não bind 443/8443 — rode o GeekCentral como admin uma vez");
    try {
      httpsServer.close();
    } catch {
      /* ignore */
    }
    return;
  }
  const addr = httpsServer.address();
  const port = typeof addr === "object" && addr ? addr.port : 443;
  app.log.info(`GeekAdmin HTTPS em :${port} → https://${SHOP_HOST}/`);

  const redirect = http.createServer((req, res) => {
    const url = String(req.url || "/");
    // GeekLock antigo fala HTTP na 80 — não redirecionar /api (quebra e fica "offline")
    if (url.startsWith("/api") || url.startsWith("/ws")) {
      app.server.emit("request", req, res);
      return;
    }
    const raw = String(req.headers.host || SHOP_HOST).split(":")[0] || SHOP_HOST;
    const suffix = port === 443 ? "" : `:${port}`;
    res.writeHead(301, { Location: `https://${raw}${suffix}${url}` });
    res.end();
  });
  redirect.on("upgrade", (req, socket, head) => {
    const url = String(req.url || "/");
    if (url.startsWith("/ws") || url.startsWith("/api")) {
      app.server.emit("upgrade", req, socket, head);
    } else {
      socket.destroy();
    }
  });
  if (await listen(redirect, 80, "0.0.0.0")) {
    app.log.info(`HTTP :80 redireciona para https://${SHOP_HOST}/`);
  } else {
    try {
      redirect.close();
    } catch {
      /* ignore */
    }
  }
}
