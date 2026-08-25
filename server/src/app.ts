import cors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import { config } from "./config.js";
import { initDb } from "./db.js";
import { addClient, broadcastAdmins, setStationStatus } from "./hub.js";
import { registerRoutes } from "./routes.js";
import { getStationByToken } from "./stations.js";

export async function buildApp(options?: { logger?: boolean; databasePath?: string }): Promise<FastifyInstance> {
  initDb(options?.databasePath);

  const app = Fastify({ logger: options?.logger ?? false, trustProxy: true });

  const portalOrigins = config.portalOrigin
    ? config.portalOrigin.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (portalOrigins.length === 0) {
        // Em produção/strict, CORS aberto sem PORTAL_ORIGIN é perigoso
        if (config.strictSecrets) return cb(null, false);
        return cb(null, true);
      }
      if (portalOrigins.includes(origin) || portalOrigins.includes("*")) return cb(null, true);
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "Accept"],
  });
  await app.register(fastifyJwt, { secret: config.jwtSecret });
  await app.register(websocket);

  await registerRoutes(app);
  const { registerPortalRoutes } = await import("./portal-routes.js");
  await registerPortalRoutes(app);

  app.setErrorHandler((error, _req, reply) => {
    if (error?.name === "ZodError") {
      return reply.code(400).send({ error: "Dados inválidos", details: (error as { issues?: unknown }).issues });
    }
    const status = error.statusCode ?? 500;
    if (error.validation) {
      return reply.code(400).send({ error: "Dados inválidos", details: error.validation });
    }
    const message = error.message || "Erro interno";
    return reply.code(status).send({ error: message });
  });

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
      broadcastAdmins({
        type: "station_online",
        station: { id: station.id, name: station.name },
        at: new Date().toISOString(),
      });
      socket.send(
        JSON.stringify({
          type: "hello",
          role: "station",
          station: { id: station.id, name: station.name },
        }),
      );

      socket.on("message", (raw) => {
        try {
          const msg = JSON.parse(String(raw)) as Record<string, unknown>;
          if (msg.type === "station_status") {
            const payload = {
              type: "station_status",
              station: { id: station.id, name: station.name },
              phase: msg.phase,
              mode: msg.mode,
              customerName: msg.customerName,
              elapsed: msg.elapsed,
              present: msg.present,
              absentLeft: msg.absentLeft,
              at: msg.at || new Date().toISOString(),
            };
            setStationStatus(station.id, payload);
            broadcastAdmins(payload);
          }
        } catch {
          /* ignore */
        }
      });
      return;
    }

    socket.close();
  });

  return app;
}
