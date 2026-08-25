import fs from "node:fs";
import path from "node:path";
import fastifyStatic from "@fastify/static";
import { buildApp } from "./app.js";
import { config } from "./config.js";
import { assertProductionSecrets } from "./security.js";
import { markStaleStationsOffline } from "./stations.js";
import { startTelemetryProbe } from "./telemetry.js";
import { startBackupScheduler } from "./backup-scheduler.js";

async function main() {
  assertProductionSecrets();
  const app = await buildApp({ logger: true });

  if (config.staticDir && fs.existsSync(config.staticDir)) {
    await app.register(fastifyStatic, {
      root: config.staticDir,
      prefix: "/",
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api") || req.url.startsWith("/ws")) {
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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
