import fs from "node:fs";
import path from "node:path";
import cors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { config } from "./config.js";
import { initDb } from "./db.js";
import { addClient } from "./hub.js";
import { registerRoutes } from "./routes.js";
import { getStationByToken, markStaleStationsOffline } from "./stations.js";

async function main() {
  initDb();

  const app = Fastify({ logger: true, trustProxy: true });
  await app.register(cors, { origin: true });
  await app.register(fastifyJwt, { secret: config.jwtSecret });
  await app.register(websocket);

  await registerRoutes(app);

  app.get("/ws", { websocket: true }, (socket, req) => {
    const url = new URL(req.url || "", "http://localhost");
    const role = url.searchParams.get("role");
    const token = url.searchParams.get("token") || "";

    if (role === "admin") {
      try {
        app.jwt.verify(token);
        addClient({ socket, role: "admin" });
        socket.send(JSON.stringify({ type: "hello", role: "admin" }));
      } catch {
        socket.close();
      }
      return;
    }

    if (role === "station") {
      const station = getStationByToken(token);
      if (!station) {
        socket.close();
        return;
      }
      addClient({
        socket,
        role: "station",
        stationId: station.id,
        stationName: station.name,
      });
      socket.send(
        JSON.stringify({
          type: "hello",
          role: "station",
          station: { id: station.id, name: station.name },
        }),
      );
      return;
    }

    socket.close();
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
      return reply.sendFile("index.html");
    });
  }

  setInterval(() => markStaleStationsOffline(25_000), 10_000);

  await app.listen({ port: config.port, host: config.host });
  app.log.info(`API em http://${config.host}:${config.port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
