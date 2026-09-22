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
import { getHourPacks, setHourPacks, type HourPack } from "./hour-packs.js";
import { getSetting, setSetting } from "./customers.js";
import { getRecognitionRetentionDays, pruneRecognitionEvents, setRecognitionRetentionDays } from "./lgpd.js";
import { faceHealth } from "./face-client.js";
import { setStationOfflineHook } from "./hub.js";
import { getStationByToken } from "./stations.js";
import { adminGuard, ownerGuard, getAuthRole, stationFromHeader } from "./http-guards.js";
import { registerStationRoutes } from "./station-routes.js";
import { registerFaceRoutes } from "./face-routes.js";
import { registerSessionRoutes } from "./session-routes.js";
import { registerCustomerRoutes } from "./customer-routes.js";
import { getHourPriceReais, getSubscriberDiscountPct } from "./billing.js";
import { rateLimit, verifyAdminPassword, verifyClerkPassword } from "./security.js";
import { buildDiagnostics, listTelemetryEvents, logEvent } from "./telemetry.js";
import { buildBusinessMetrics } from "./metrics.js";
import { applyTunnel, getTunnelStatusFull } from "./tunnel-manager.js";
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
    hourPacks: getHourPacks(),
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
    let role: "admin" | "clerk" | null = null;
    if (verifyAdminPassword(body.password)) role = "admin";
    else if (verifyClerkPassword(body.password)) role = "clerk";
    if (!role) {
      return reply.code(401).send({ error: "Senha inválida" });
    }
    const token = app.jwt.sign({ role }, { expiresIn: "12h" });
    return { token, role };
  });

  app.get("/api/admin/me", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    return { role: getAuthRole(req) || "admin" };
  });

  app.get("/api/settings", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    return settingsPayload();
  });

  app.put("/api/settings", async (req, reply) => {
    if (!(await ownerGuard(req, reply))) return;
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
        hourPacks: z
          .array(
            z.object({
              amountReais: z.number().min(1).max(5000),
              label: z.string().min(1).max(40),
            }),
          )
          .min(1)
          .max(12)
          .optional(),
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
    if (body.hourPacks !== undefined) {
      setHourPacks(body.hourPacks as HourPack[]);
    }
    return settingsPayload();
  });

  app.get("/api/admin/readiness", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    const face = await faceHealth();
    const tunnel = await getTunnelStatusFull();
    const publicUrl =
      tunnel.mode === "named"
        ? tunnel.publicApiUrl
        : tunnel.mode === "quick"
          ? tunnel.lastQuickTunnelUrl
          : "";
    const readiness = getReadiness();
    const tunnelOk =
      tunnel.running &&
      Boolean(publicUrl) &&
      (tunnel.publicHealthy || tunnel.mode === "named");
    readiness.checklist = readiness.checklist.map((c) =>
      c.id === "tunnel" ? { ...c, ok: tunnelOk, label: "Túnel Cloudflare ativo" } : c,
    );
    readiness.tunnelHint = tunnel.running
      ? publicUrl
        ? `Túnel ativo: ${publicUrl}`
        : "Túnel rodando — aguardando URL pública"
      : "Ligue o túnel em Config → Portal / Cloudflare (auto-start disponível).";
    return {
      ...readiness,
      faceService: face,
      tunnel: {
        running: tunnel.running,
        mode: tunnel.mode,
        autoStart: tunnel.autoStart,
        publicUrl,
        publicHealthy: tunnel.publicHealthy,
        binaryFound: tunnel.binaryFound,
      },
    };
  });

  app.get("/api/admin/tunnel", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    return getTunnelStatusFull();
  });

  app.post("/api/admin/tunnel", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    const body = z
      .object({
        mode: z.enum(["off", "quick", "named"]).optional(),
        tunnelName: z.string().optional(),
        publicApiUrl: z.string().optional(),
        autoStart: z.boolean().optional(),
        action: z.enum(["start", "stop", "apply", "check"]).optional(),
      })
      .parse(req.body);
    if (body.action === "check") {
      const st = await getTunnelStatusFull();
      return { ok: true, status: st };
    }
    const { action, ...rest } = body;
    void action;
    return applyTunnel(rest);
  });

  app.get("/api/admin/diagnostics", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    return buildDiagnostics();
  });

  app.get("/api/admin/metrics", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    return buildBusinessMetrics();
  });

  app.get("/api/admin/audit", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    const events = listTelemetryEvents({ limit: 80 }).filter((e) =>
      /time\.sale|staff_unlock|subscription|command\./.test(e.kind),
    );
    return { events: events.slice(0, 30) };
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
