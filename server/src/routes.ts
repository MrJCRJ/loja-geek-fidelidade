import type { FastifyInstance } from "fastify";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { config } from "./config.js";
import {
  createSqliteBackup,
  getReadiness,
  getUnitSettings,
  listBackupFiles,
  resolveBackupPath,
  setUnitSettings,
} from "./admin-ops.js";
import {
  getBackupSchedule,
  runScheduledBackupIfDue,
  setBackupSchedule,
} from "./backup-scheduler.js";
import {
  getPublicApiUrl,
  listPeerCentrals,
  setPeerCentrals,
  setPublicApiUrl,
  type PeerCentral,
} from "./centrals.js";
import { getSetting, setSetting } from "./customers.js";
import { getRecognitionRetentionDays, pruneRecognitionEvents, setRecognitionRetentionDays } from "./lgpd.js";
import { faceHealth } from "./face-client.js";
import { setStationOfflineHook } from "./hub.js";
import { getStationByToken } from "./stations.js";
import { adminGuard, stationFromHeader } from "./http-guards.js";
import { registerStationRoutes } from "./station-routes.js";
import { registerFaceRoutes } from "./face-routes.js";
import { registerSessionRoutes } from "./session-routes.js";
import { registerCustomerRoutes } from "./customer-routes.js";
import { getHourPriceReais, getSubscriberDiscountPct } from "./billing.js";
import { rateLimit, verifyAdminPassword } from "./security.js";
import { buildDiagnostics, listTelemetryEvents, logEvent } from "./telemetry.js";
import { buildBusinessMetrics } from "./metrics.js";
import {
  sessionSafetySettingsPayload,
  setLowBalanceWarnSeconds,
  setPresenceMinFaceRatio,
  setStaffUnlockMaxSeconds,
} from "./session-safety.js";

setStationOfflineHook((stationId, stationName) => {
  logEvent({
    level: "warn",
    source: "api",
    kind: "station.ws_offline",
    message: `Estação desconectou do WebSocket: ${stationName || stationId}`,
    stationId,
  });
});

function settingsPayload() {
  const unit = getUnitSettings();
  const backup = getBackupSchedule();
  return {
    faceMatchThreshold: Number(getSetting("face_match_threshold", String(config.faceMatchThreshold))),
    pointsPerReal: Number(getSetting("points_per_real", String(config.pointsPerReal))),
    hourPriceReais: getHourPriceReais(),
    subscriberHourDiscountPct: getSubscriberDiscountPct(),
    unitName: unit.unitName,
    unitId: unit.unitId,
    backupAutoEnabled: backup.enabled,
    backupIntervalHours: backup.intervalHours,
    backupKeep: backup.keep,
    recognitionEventsKeepDays: getRecognitionRetentionDays(),
    publicApiUrl: getPublicApiUrl(),
    peerCentrals: listPeerCentrals(),
    ...sessionSafetySettingsPayload(),
  };
}

export async function registerRoutes(app: FastifyInstance) {
  await registerStationRoutes(app);
  await registerFaceRoutes(app);
  await registerSessionRoutes(app);
  await registerCustomerRoutes(app);

  app.get("/api/health", async () => {
    const face = await faceHealth();
    return {
      ok: true,
      faceService: face,
      time: new Date().toISOString(),
    };
  });

  app.post("/api/admin/login", async (req, reply) => {
    const ip = req.ip || "unknown";
    if (!rateLimit(`admin-login:${ip}`, 10, 60_000)) {
      return reply.code(429).send({ error: "Muitas tentativas — aguarde um minuto" });
    }
    const body = z.object({ password: z.string() }).parse(req.body);
    if (!verifyAdminPassword(body.password)) {
      return reply.code(401).send({ error: "Senha inválida" });
    }
    const token = app.jwt.sign({ role: "admin" }, { expiresIn: "12h" });
    return { token };
  });

  app.get("/api/admin/me", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    return { role: "admin" };
  });

  app.get("/api/settings", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    return settingsPayload();
  });

  app.put("/api/settings", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    const body = z
      .object({
        faceMatchThreshold: z.number().min(0.1).max(0.99).optional(),
        pointsPerReal: z.number().min(0.01).max(100).optional(),
        hourPriceReais: z.number().min(0.5).max(500).optional(),
        subscriberHourDiscountPct: z.number().min(0).max(90).optional(),
        unitName: z.string().min(1).max(80).optional(),
        unitId: z.string().min(1).max(64).optional(),
        backupAutoEnabled: z.boolean().optional(),
        backupIntervalHours: z.number().min(1).max(168).optional(),
        backupKeep: z.number().min(3).max(50).optional(),
        recognitionEventsKeepDays: z.number().min(7).max(730).optional(),
        publicApiUrl: z.string().max(300).optional(),
        peerCentrals: z
          .array(
            z.object({
              unitId: z.string().min(1).max(64),
              unitName: z.string().min(1).max(80),
              publicApiUrl: z.string().url().max(300),
            }),
          )
          .max(12)
          .optional(),
        lowBalanceWarnSeconds: z.number().min(60).max(3600).optional(),
        staffUnlockMaxSeconds: z.number().min(60).max(7200).optional(),
        presenceMinFaceRatio: z.number().min(0.06).max(0.4).optional(),
      })
      .parse(req.body);
    if (body.faceMatchThreshold !== undefined) {
      setSetting("face_match_threshold", String(body.faceMatchThreshold));
    }
    if (body.pointsPerReal !== undefined) {
      setSetting("points_per_real", String(body.pointsPerReal));
    }
    if (body.hourPriceReais !== undefined) {
      setSetting("hour_price_reais", String(body.hourPriceReais));
    }
    if (body.subscriberHourDiscountPct !== undefined) {
      setSetting("subscriber_hour_discount_pct", String(body.subscriberHourDiscountPct));
    }
    if (body.unitName !== undefined || body.unitId !== undefined) {
      setUnitSettings({ unitName: body.unitName, unitId: body.unitId });
    }
    if (
      body.backupAutoEnabled !== undefined ||
      body.backupIntervalHours !== undefined ||
      body.backupKeep !== undefined
    ) {
      setBackupSchedule({
        enabled: body.backupAutoEnabled,
        intervalHours: body.backupIntervalHours,
        keep: body.backupKeep,
      });
    }
    if (body.recognitionEventsKeepDays !== undefined) {
      setRecognitionRetentionDays(body.recognitionEventsKeepDays);
    }
    if (body.publicApiUrl !== undefined) {
      setPublicApiUrl(body.publicApiUrl);
    }
    if (body.peerCentrals !== undefined) {
      setPeerCentrals(body.peerCentrals as PeerCentral[]);
    }
    if (body.lowBalanceWarnSeconds !== undefined) {
      setLowBalanceWarnSeconds(body.lowBalanceWarnSeconds);
    }
    if (body.staffUnlockMaxSeconds !== undefined) {
      setStaffUnlockMaxSeconds(body.staffUnlockMaxSeconds);
    }
    if (body.presenceMinFaceRatio !== undefined) {
      setPresenceMinFaceRatio(body.presenceMinFaceRatio);
    }
    return settingsPayload();
  });

  app.get("/api/admin/readiness", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    const face = await faceHealth();
    return { ...getReadiness(), faceService: face };
  });

  app.get("/api/admin/diagnostics", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    return buildDiagnostics();
  });

  app.get("/api/admin/metrics", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    return buildBusinessMetrics();
  });

  app.get("/api/admin/telemetry", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    const q = req.query as { limit?: string; level?: string; source?: string; kind?: string };
    return {
      events: listTelemetryEvents({
        limit: q.limit ? Number(q.limit) : 100,
        level: q.level,
        source: q.source,
        kind: q.kind,
      }),
    };
  });

  app.post("/api/telemetry/events", async (req, reply) => {
    const body = z
      .object({
        level: z.enum(["debug", "info", "warn", "error"]).optional(),
        source: z.string().min(1).max(64),
        kind: z.string().min(1).max(96),
        message: z.string().min(1).max(500),
        meta: z.record(z.unknown()).optional(),
        token: z.string().optional(),
      })
      .parse(req.body);

    let stationId: string | null = null;
    const headerStation = stationFromHeader(req);
    if (headerStation) {
      stationId = headerStation.id as string;
    } else if (body.token) {
      const st = getStationByToken(body.token);
      if (!st) return reply.code(401).send({ error: "Token de estação inválido" });
      stationId = st.id as string;
    } else {
      try {
        await req.jwtVerify();
      } catch {
        return reply.code(401).send({ error: "Autenticação necessária" });
      }
    }

    const ip = req.ip || "unknown";
    if (!rateLimit(`tel:${ip}`, 120, 60_000)) {
      return reply.code(429).send({ error: "Muitos eventos — aguarde" });
    }

    const saved = logEvent({
      level: body.level,
      source: body.source,
      kind: body.kind,
      message: body.message,
      stationId,
      meta: body.meta,
    });
    return { ok: true, ...saved };
  });

  app.post("/api/admin/backup", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    try {
      const out = runScheduledBackupIfDue(true);
      return out.result || createSqliteBackup({ reason: "manual" });
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : "Falha no backup" });
    }
  });

  app.get("/api/admin/backups", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    return {
      schedule: getBackupSchedule(),
      backups: listBackupFiles().map(({ fileName, size, createdAt }) => ({ fileName, size, createdAt })),
    };
  });

  app.get("/api/admin/backups/:fileName", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    const { fileName } = req.params as { fileName: string };
    const full = resolveBackupPath(fileName);
    if (!full) return reply.code(404).send({ error: "Backup não encontrado" });
    const buf = fs.readFileSync(full);
    return reply
      .header("content-type", "application/octet-stream")
      .header("content-disposition", `attachment; filename="${path.basename(full)}"`)
      .send(buf);
  });

  app.post("/api/admin/lgpd/prune-recognition", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    const body = z
      .object({ keepDays: z.number().int().min(7).max(730).optional() })
      .parse(req.body ?? {});
    const result = pruneRecognitionEvents(body.keepDays);
    logEvent({
      level: "info",
      source: "api",
      kind: "lgpd.prune_recognition",
      message: `Prune recognition_events: ${result.deleted} removidos (keep ${result.keepDays}d)`,
      meta: result,
    });
    return result;
  });
}
