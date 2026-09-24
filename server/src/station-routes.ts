import type { FastifyInstance } from "fastify";
import fs from "node:fs";
import { z } from "zod";
import { config } from "./config.js";
import { adminGuard, ownerGuard, ownerWriteGuard, staffWriteGuard, stationFromHeader, actorLabel } from "./http-guards.js";
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
import {
  ensureLockPackageCached,
  lockPackagePath,
  lockUpdateHintForStation,
  lockUpdateStatus,
} from "./lock-update.js";
import {
  attachStaffUnlockTimer,
  clearStaffUnlockWindow,
  getStaffUnlockMaxSeconds,
  sessionSafetySettingsPayload,
  startStaffUnlockWindow,
} from "./session-safety.js";
import { logEvent } from "./telemetry.js";
import {
  consumePairCode,
  ensurePairCode,
  isLocalRequest,
  rotatePairCode,
} from "./pair-code.js";
import { isLanPairAllowed } from "./store-network.js";

const stationCommandBody = z.object({
  command: z.enum(["reload", "message", "lock_screen", "unlock_screen", "end_session"]),
  text: z.string().optional(),
  title: z.string().max(80).optional(),
  level: z.enum(["info", "warn", "urgent"]).optional(),
  durationSec: z.number().int().min(3).max(23 * 3600 + 59 * 60).optional(),
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
    const body = z.object({ token: z.string(), lockVersion: z.string().max(32).optional() }).parse(req.body);
    const station = heartbeatStation(body.token, req.ip, body.lockVersion);
    if (!station) return reply.code(401).send({ error: "Token de estação inválido" });
    broadcastAdmins({ type: "station_heartbeat", station });
    return {
      ok: true,
      station: { id: station.id, name: station.name },
      sessionSafety: sessionSafetySettingsPayload(station.id),
      portalPublicUrl: config.portalPublicUrl,
      lockUpdate: lockUpdateHintForStation(body.lockVersion || station.lock_version),
    };
  });

  app.post("/api/stations/:id/command", async (req, reply) => {
    if (!(await staffWriteGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = stationCommandBody.parse(req.body);
    const durationSec =
      body.command === "unlock_screen"
        ? startStaffUnlockWindow(id, body.durationSec ?? getStaffUnlockMaxSeconds())
        : body.durationSec ?? 12;
    if (body.command === "lock_screen" || body.command === "end_session") {
      clearStaffUnlockWindow(id);
    }
    sendCommandToStation(id, body.command, {
      text: body.text || "",
      title: body.title || "",
      level: body.level || "info",
      durationSec,
    });
    if (body.command === "unlock_screen") {
      attachStaffUnlockTimer(
        id,
        setTimeout(() => {
          clearStaffUnlockWindow(id);
          sendCommandToStation(id, "lock_screen", { text: "", title: "", level: "info", durationSec: 12 });
        }, durationSec * 1000),
      );
    }
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
    if (body.command === "unlock_screen") {
      for (const s of listConnectedStations()) {
        const durationSec = startStaffUnlockWindow(s.stationId, body.durationSec ?? getStaffUnlockMaxSeconds());
        sendCommandToStation(s.stationId, body.command, {
          text: body.text || "",
          title: body.title || "",
          level: body.level || "info",
          durationSec,
        });
        attachStaffUnlockTimer(
          s.stationId,
          setTimeout(() => {
            clearStaffUnlockWindow(s.stationId);
            sendCommandToStation(s.stationId, "lock_screen", { text: "", title: "", level: "info", durationSec: 12 });
          }, durationSec * 1000),
        );
      }
    } else {
      sendCommandToAllStations(body.command, {
        text: body.text || "",
        title: body.title || "",
        level: body.level || "info",
        durationSec: body.durationSec ?? 12,
      });
    }
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

  /** Na LAN: só nome. Sem código, sem senha. */
  app.post("/api/stations/pair-lan", async (req, reply) => {
    if (!isLanPairAllowed(req)) {
      return reply.code(403).send({ error: "Pareamento só na rede da loja", code: "off_store_wifi" });
    }
    const body = z.object({ name: z.string().min(2) }).parse(req.body);
    const station = registerStation(body.name);
    logEvent({
      level: "info",
      source: "admin",
      kind: "station.pair_lan",
      message: `Estação pareada na LAN: ${station.name}`,
      stationId: station.id,
    });
    return station;
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

  app.get("/api/admin/lock-update", async (req, reply) => {
    if (!(await ownerGuard(req, reply))) return;
    return lockUpdateStatus();
  });

  app.post("/api/admin/lock-update/apply", async (req, reply) => {
    if (!(await ownerWriteGuard(req, reply))) return;
    const body = z.object({ stationIds: z.array(z.string()).optional() }).parse(req.body || {});
    const cached = await ensureLockPackageCached();
    if (!cached.ok) return reply.code(400).send(cached);
    const status = await lockUpdateStatus();
    const wanted = new Set(body.stationIds || []);
    const targets = status.stations.filter((s) => {
      if (wanted.size && !wanted.has(s.id)) return false;
      return s.online && (s.status === "outdated" || s.status === "unknown");
    });
    for (const s of targets) {
      sendCommandToStation(s.id, "apply_update", { latestVersion: cached.latestVersion || "" });
    }
    logEvent({
      level: "warn",
      source: "admin",
      kind: "lock.update",
      message: `${actorLabel(req)} pediu atualização do GeekLock (${targets.length} online)`,
      meta: { actor: actorLabel(req), stationIds: targets.map((s) => s.id) },
    });
    return {
      ok: true,
      applying: true,
      latestVersion: cached.latestVersion,
      sent: targets.map((s) => s.name),
      waitingOffline: status.offlineOutdated,
    };
  });

  app.get("/api/stations/lock-update/package", async (req, reply) => {
    const station = stationFromHeader(req);
    if (!station) return reply.code(401).send({ error: "Token de estação obrigatório" });
    const zip = lockPackagePath();
    if (!fs.existsSync(zip)) return reply.code(404).send({ error: "Pacote ainda não baixado no Central" });
    const stat = fs.statSync(zip);
    return reply
      .header("content-type", "application/zip")
      .header("content-length", String(stat.size))
      .header("content-disposition", 'attachment; filename="GeekLock-win-x64.zip"')
      .send(fs.createReadStream(zip));
  });
}
