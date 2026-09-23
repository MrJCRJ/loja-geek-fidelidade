import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "./config.js";
import { adminGuard, ownerWriteGuard, staffWriteGuard, stationFromHeader, actorLabel } from "./http-guards.js";
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
import {
  consumePairCode,
  ensurePairCode,
  isLocalRequest,
  rotatePairCode,
} from "./pair-code.js";

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
    if (!(await ownerWriteGuard(req, reply))) return;
    const body = z.object({ name: z.string().min(2) }).parse(req.body);
    return registerStation(body.name);
  });

  app.patch("/api/stations/:id", async (req, reply) => {
    if (!(await ownerWriteGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = z.object({ name: z.string().min(2) }).parse(req.body);
    const updated = renameStation(id, body.name);
    if (!updated) return reply.code(404).send({ error: "Não encontrado" });
    return updated;
  });

  app.delete("/api/stations/:id", async (req, reply) => {
    if (!(await ownerWriteGuard(req, reply))) return;
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
      portalPublicUrl: config.portalPublicUrl,
    };
  });

  app.post("/api/stations/:id/command", async (req, reply) => {
    if (!(await staffWriteGuard(req, reply))) return;
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
      message: `${actorLabel(req)}: comando ${body.command} → estação ${id}`,
      stationId: id,
      meta: { text: body.text, title: body.title, level: body.level, actor: actorLabel(req) },
    });
    return { ok: true };
  });

  app.post("/api/stations/command-all", async (req, reply) => {
    if (!(await staffWriteGuard(req, reply))) return;
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
      message: `${actorLabel(req)}: comando ${body.command} → todas as estações`,
      meta: { text: body.text, title: body.title, level: body.level, actor: actorLabel(req) },
    });
    return { ok: true };
  });

  app.post("/api/stations/staff-unlock", async (req, reply) => {
    const station = stationFromHeader(req);
    if (!station) return reply.code(401).send({ error: "Token de estação obrigatório" });
    const body = z.object({ reason: z.string().max(80).optional() }).parse(req.body || {});
    logEvent({
      level: "warn",
      source: "geeklock",
      kind: "station.staff_unlock",
      message: `PIN Admin na estação ${station.name}`,
      stationId: station.id,
      meta: { reason: body.reason || "pin" },
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

  /** Pareamento por código curto (6 dígitos) — sem digitar sharedSecret. */
  app.post("/api/stations/pair", async (req, reply) => {
    const body = z
      .object({
        name: z.string().min(2),
        pairCode: z.string().min(4).max(12),
      })
      .parse(req.body);
    const result = consumePairCode(body.pairCode, req.ip || "unknown");
    if (!result.ok) {
      return reply.code(result.status).send({ error: result.error });
    }
    const station = registerStation(body.name);
    logEvent({
      level: "info",
      source: "admin",
      kind: "station.pair",
      message: `Estação pareada via código: ${station.name}`,
      stationId: station.id,
    });
    // Novo código pronto para a próxima estação
    ensurePairCode();
    return station;
  });

  /** Só localhost — GeekCentral na mesma máquina mostra o código. */
  app.get("/api/local/pair-code", async (req, reply) => {
    if (!isLocalRequest(req.ip, req.headers.host)) {
      return reply.code(403).send({ error: "Só no PC do GeekCentral" });
    }
    return ensurePairCode();
  });

  app.post("/api/local/pair-code/rotate", async (req, reply) => {
    if (!isLocalRequest(req.ip, req.headers.host)) {
      return reply.code(403).send({ error: "Só no PC do GeekCentral" });
    }
    return rotatePairCode();
  });
}
