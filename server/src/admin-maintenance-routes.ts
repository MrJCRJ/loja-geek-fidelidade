import type { FastifyInstance } from "fastify";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { createSqliteBackup, listBackupFiles, resolveBackupPath } from "./admin-ops.js";
import { getBackupSchedule, runScheduledBackupIfDue } from "./backup-scheduler.js";
import { adminGuard, ownerWriteGuard, stationFromHeader } from "./http-guards.js";
import { pruneRecognitionEvents } from "./lgpd.js";
import { buildBusinessMetrics } from "./metrics.js";
import { rateLimit } from "./security.js";
import { getStationByToken } from "./stations.js";
import { buildDiagnostics, listTelemetryEvents, logEvent } from "./telemetry.js";

export async function registerAdminMaintenanceRoutes(app: FastifyInstance) {
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
    if (!(await ownerWriteGuard(req, reply))) return;
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
    if (!(await ownerWriteGuard(req, reply))) return;
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
