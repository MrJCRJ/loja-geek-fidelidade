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
import { isLanPairAllowed } from "./store-network.js";
import {
  buildUsageSummary,
  ingestUsageSample,
  listStationHardware,
  updateStationEnergyCalibration,
  upsertStationHardware,
  usageSettingsPayload,
} from "./station-usage.js";

const occupantKindSchema = z.enum(["vip", "staff_timed", "staff_open", "guest_named"]);

const stationCommandBody = z.object({
  command: z.enum(["reload", "message", "lock_screen", "unlock_screen", "end_session"]),
  text: z.string().optional(),
  title: z.string().max(80).optional(),
  level: z.enum(["info", "warn", "urgent"]).optional(),
  durationSec: z.number().int().min(3).max(23 * 3600 + 59 * 60).optional(),
  occupantKind: occupantKindSchema.optional(),
  guestLabel: z.string().min(2).max(40).optional(),
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
      usage: usageSettingsPayload(),
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
      occupantKind: body.occupantKind,
      guestLabel: body.guestLabel || "",
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

  app.post("/api/stations/hardware", async (req, reply) => {
    const station = stationFromHeader(req);
    if (!station) return reply.code(401).send({ error: "Token de estação obrigatório" });
    const body = z
      .object({
        cpuName: z.string().max(120).optional().nullable(),
        cpuCores: z.number().int().min(1).max(256).optional().nullable(),
        cpuTdpW: z.number().min(5).max(500).optional().nullable(),
        gpus: z
          .array(
            z.object({
              vendor: z.enum(["nvidia", "amd", "intel", "other"]),
              model: z.string().max(120),
              vramMb: z.number().int().min(0).max(262144).optional().nullable(),
            }),
          )
          .max(4)
          .optional(),
        ramTotalMb: z.number().int().min(256).max(1048576).optional().nullable(),
        osBuild: z.string().max(80).optional().nullable(),
      })
      .parse(req.body || {});
    const saved = upsertStationHardware(station.id, body);
    return { ok: true, hardware: saved, usage: usageSettingsPayload() };
  });

  app.post("/api/stations/usage-sample", async (req, reply) => {
    const station = stationFromHeader(req);
    if (!station) return reply.code(401).send({ error: "Token de estação obrigatório" });
    const body = z
      .object({
        occupantKind: occupantKindSchema,
        occupantCustomerId: z.string().max(64).optional().nullable(),
        occupantLabel: z.string().max(40).optional().nullable(),
        appProcess: z.string().max(64).optional().nullable(),
        appTitle: z.string().max(200).optional().nullable(),
        cpuPct: z.number().min(0).max(100).optional().nullable(),
        gpuPct: z.number().min(0).max(100).optional().nullable(),
        ramPct: z.number().min(0).max(100).optional().nullable(),
        watts: z.number().min(0).max(2000).optional().nullable(),
        wattsSource: z.enum(["sensor", "estimate"]).optional().nullable(),
      })
      .parse(req.body || {});
    return ingestUsageSample(station.id, {
      occupantKind: body.occupantKind,
      occupantCustomerId: body.occupantCustomerId,
      occupantLabel: body.occupantLabel,
      appProcess: body.appProcess,
      appTitle: body.appTitle,
      cpuPct: body.cpuPct,
      gpuPct: body.gpuPct,
      ramPct: body.ramPct,
      watts: body.watts,
      wattsSource: body.wattsSource,
    });
  });

  app.get("/api/admin/usage", async (req, reply) => {
    if (!(await ownerGuard(req, reply))) return;
    const q = req.query as { hours?: string };
    const hours = q.hours ? Number(q.hours) : 24;
    return {
      ...buildUsageSummary({ hours: Number.isFinite(hours) ? hours : 24 }),
      hardware: listStationHardware(),
      settings: usageSettingsPayload(),
    };
  });

  app.patch("/api/admin/stations/:id/energy", async (req, reply) => {
    if (!(await ownerWriteGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = z
      .object({
        tdpCpuW: z.number().min(15).max(500).optional(),
        tdpGpuW: z.number().min(0).max(800).optional(),
        idleW: z.number().min(10).max(200).optional(),
      })
      .parse(req.body || {});
    const hardware = updateStationEnergyCalibration(id, body);
    if (!hardware) return reply.code(404).send({ error: "Estação sem hardware ainda" });
    return { ok: true, hardware };
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
