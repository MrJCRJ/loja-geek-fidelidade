import fs from "node:fs";
import fastifyStatic from "@fastify/static";
import { buildApp } from "./app.js";
import { config } from "./config.js";
import { assertProductionSecrets } from "./security.js";
import { markStaleStationsOffline } from "./stations.js";
import { startTelemetryProbe } from "./telemetry.js";
import { startBackupScheduler } from "./backup-scheduler.js";
import { autoStartTunnelIfEnabled, startTunnelHealthProbe } from "./tunnel-manager.js";
import { initSentry, captureException } from "./sentry.js";
import { ensurePushTable } from "./push.js";
import { startGeekLocalMdns } from "./mdns-local.js";
import { startLocalHttpsFront } from "./local-https.js";
import { isStaffUiHost, requestHost } from "./request-scope.js";

async function main() {
  await initSentry();
  assertProductionSecrets();
  const app = await buildApp({ logger: true });
  ensurePushTable();

  app.get("/", async (req, reply) => {
    if (isStaffUiHost(requestHost(req))) {
      return reply.redirect("/admin");
    }
    return { ok: true };
  });

  if (config.staticDir && fs.existsSync(config.staticDir)) {
    await app.register(fastifyStatic, {
      root: config.staticDir,
      prefix: "/",
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api") || req.url.startsWith("/ws")) {
        return reply.code(404).send({ error: "Not found" });
      }
      if (!isStaffUiHost(requestHost(req))) {
        return reply.code(404).send({ error: "Not found" });
      }
      return reply.sendFile("index.html");
    });
  }

  setInterval(() => markStaleStationsOffline(25_000), 10_000);
  startTelemetryProbe(60_000);
  startBackupScheduler(15 * 60_000);

  await app.listen({ port: config.port, host: config.host });
  app.log.info(`API em http://${config.host}:${config.port}`);
  try {
    await startLocalHttpsFront(app, config.databasePath);
  } catch (err) {
    app.log.warn({ err }, "HTTPS local geek.local não subiu");
  }
  try {
    startGeekLocalMdns();
    app.log.info("mDNS geek.local anunciado na LAN");
  } catch (err) {
    app.log.warn({ err }, "mDNS geek.local não subiu (celular pode usar o IP)");
  }
  startTunnelHealthProbe(60_000);
  autoStartTunnelIfEnabled().catch((err) => {
    app.log.warn({ err }, "Falha ao auto-iniciar túnel Cloudflare");
  });
}

main().catch((err) => {
  captureException(err);
  console.error(err);
  process.exit(1);
});
