import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "./config.js";
import { adminGuard } from "./http-guards.js";
import {
  broadcastAdmins,
  getAllStationStatuses,
  listConnectedStations,
  sendCommandToAllStations,
  sendCommandToStation,
} from "./hub.js";
import {
  deleteStation,
  heartbeatStation,
  listStations,
  registerStation,
  renameStation,
} from "./stations.js";
import { sessionSafetySettingsPayload } from "./session-safety.js";
import { logEvent } from "./telemetry.js";

const stationCommandBody = z.object({
  command: z.enum(["reload", "message", "lock_screen", "unlock_screen", "end_session"]),
  text: z.string().optional(),
  title: z.string().max(80).optional(),
  level: z.enum(["info", "warn", "urgent"]).optional(),
  durationSec: z.number().int().min(3).max(600).optional(),
});

export async function registerStationRoutes(app: FastifyInstance) {
  app.get("/api/stations", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    return {
      stations: listStations(),
      connected: listConnectedStations(),
      live: getAllStationStatuses(),
    };
  });

  app.post("/api/stations", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    const body = z.object({ name: z.string().min(2) }).parse(req.body);
    return registerStation(body.name);
  });

  app.patch("/api/stations/:id", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = z.object({ name: z.string().min(2) }).parse(req.body);
    const updated = renameStation(id, body.name);
    if (!updated) return reply.code(404).send({ error: "Não encontrado" });
    return updated;
  });

  app.delete("/api/stations/:id", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    if (!deleteStation(id)) return reply.code(404).send({ error: "Não encontrado" });
    return { ok: true };
  });

  app.post("/api/stations/heartbeat", async (req, reply) => {
    const body = z.object({ token: z.string() }).parse(req.body);
    const station = heartbeatStation(body.token, req.ip);
    if (!station) return reply.code(401).send({ error: "Token de estação inválido" });
    broadcastAdmins({ type: "station_heartbeat", station });
    return {
      ok: true,
      station: { id: station.id, name: station.name },
      sessionSafety: sessionSafetySettingsPayload(),
    };
  });

  app.post("/api/stations/:id/command", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = stationCommandBody.parse(req.body);
    sendCommandToStation(id, body.command, {
      text: body.text || "",
      title: body.title || "",
      level: body.level || "info",
      durationSec: body.durationSec ?? 12,
    });
    logEvent({
      level: "info",
      source: "admin",
      kind: `command.${body.command}`,
      message: `Comando ${body.command} → estação ${id}`,
      stationId: id,
      meta: { text: body.text, title: body.title, level: body.level },
    });
    return { ok: true };
  });

  app.post("/api/stations/command-all", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    const body = stationCommandBody.parse(req.body);
    sendCommandToAllStations(body.command, {
      text: body.text || "",
      title: body.title || "",
      level: body.level || "info",
      durationSec: body.durationSec ?? 12,
    });
    logEvent({
      level: "info",
      source: "admin",
      kind: `command_all.${body.command}`,
      message: `Comando ${body.command} → todas as estações`,
      meta: { text: body.text, title: body.title, level: body.level },
    });
    return { ok: true };
  });

  // Bootstrap rápido de estação com segredo compartilhado (primeira config)
  app.post("/api/stations/claim", async (req, reply) => {
    const body = z
      .object({
        name: z.string().min(2),
        sharedSecret: z.string(),
      })
      .parse(req.body);
    if (body.sharedSecret !== config.stationSharedSecret) {
      return reply.code(401).send({ error: "Segredo inválido" });
    }
    return registerStation(body.name);
  });
}
