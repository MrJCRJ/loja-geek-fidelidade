import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { config } from "./config.js";
import {
  createSqliteBackup,
  exportCustomerLgpd,
  getReadiness,
  getUnitSettings,
  listBackupFiles,
  resolveBackupPath,
  setUnitSettings,
} from "./admin-ops.js";
import {
  addFaceEmbedding,
  addRecognitionEvent,
  adjustPoints,
  clearFaceEmbeddings,
  createCustomer,
  createReward,
  deleteCustomer,
  deleteReward,
  getCustomer,
  getSetting,
  listCustomers,
  listFaceEmbeddings,
  listLedger,
  listRecognitionEvents,
  listRewards,
  redeemReward,
  setSetting,
  updateCustomer,
  updateReward,
} from "./customers.js";
import { extractEmbedding, faceHealth, matchEmbedding, parseGalleryEmbeddings } from "./face-client.js";
import { facePreviewFromEmbed } from "./face-preview.js";
import {
  broadcastAdmins,
  getAllStationStatuses,
  listConnectedStations,
  sendCommandToAllStations,
  sendCommandToStation,
  sendToStation,
  setStationOfflineHook,
} from "./hub.js";
import {
  deleteStation,
  getStationByToken,
  heartbeatStation,
  heartbeatStationById,
  listStations,
  registerStation,
  renameStation,
} from "./stations.js";
import {
  adjustTime,
  getCustomerTimeSummary,
  getHourPriceReais,
  getSubscriberDiscountPct,
  getTimeBalance,
  sellTime,
  setSubscription,
} from "./billing.js";
import {
  endActiveSessionForStation,
  endSession,
  getSession,
  heartbeatSession,
  listSessions,
  sessionStatsToday,
  startSession,
} from "./sessions.js";
import { rateLimit, verifyAdminPassword } from "./security.js";
import {
  buildDiagnostics,
  listTelemetryEvents,
  logEvent,
} from "./telemetry.js";

setStationOfflineHook((stationId, stationName) => {
  logEvent({
    level: "warn",
    source: "api",
    kind: "station.ws_offline",
    message: `Estação desconectou do WebSocket: ${stationName || stationId}`,
    stationId,
  });
});

async function adminGuard(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
    return true;
  } catch {
    reply.code(401).send({ error: "Não autorizado" });
    return false;
  }
}

function stationFromHeader(req: FastifyRequest) {
  const token = String(req.headers["x-station-token"] || "");
  if (!token) return null;
  return getStationByToken(token) || null;
}

export async function registerRoutes(app: FastifyInstance) {
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
    const unit = getUnitSettings();
    return {
      faceMatchThreshold: Number(getSetting("face_match_threshold", String(config.faceMatchThreshold))),
      pointsPerReal: Number(getSetting("points_per_real", String(config.pointsPerReal))),
      hourPriceReais: getHourPriceReais(),
      subscriberHourDiscountPct: getSubscriberDiscountPct(),
      unitName: unit.unitName,
      unitId: unit.unitId,
    };
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
    const unit = getUnitSettings();
    return {
      faceMatchThreshold: Number(getSetting("face_match_threshold", String(config.faceMatchThreshold))),
      pointsPerReal: Number(getSetting("points_per_real", String(config.pointsPerReal))),
      hourPriceReais: getHourPriceReais(),
      subscriberHourDiscountPct: getSubscriberDiscountPct(),
      unitName: unit.unitName,
      unitId: unit.unitId,
    };
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
      return createSqliteBackup();
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : "Falha no backup" });
    }
  });

  app.get("/api/admin/backups", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    return { backups: listBackupFiles().map(({ fileName, size, createdAt }) => ({ fileName, size, createdAt })) };
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

  app.get("/api/customers/:id/export", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    const data = exportCustomerLgpd(id);
    if (!data) return reply.code(404).send({ error: "Cliente não encontrado" });
    return data;
  });

  app.get("/api/customers", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    return listCustomers();
  });

  app.post("/api/customers", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    const body = z
      .object({
        name: z.string().min(2),
        phone: z.string().optional(),
        level: z.enum(["bronze", "prata", "ouro"]).optional(),
        notes: z.string().optional(),
        consent: z.boolean(),
      })
      .parse(req.body);
    if (!body.consent) {
      return reply.code(400).send({ error: "Consentimento LGPD é obrigatório para VIP facial" });
    }
    return createCustomer(body);
  });

  app.get("/api/customers/:id", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    const customer = getCustomer(id);
    if (!customer) return reply.code(404).send({ error: "Não encontrado" });
    return customer;
  });

  app.patch("/api/customers/:id", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = z
      .object({
        name: z.string().min(2).optional(),
        phone: z.string().optional(),
        level: z.enum(["bronze", "prata", "ouro"]).optional(),
        notes: z.string().optional(),
        consent: z.boolean().optional(),
      })
      .parse(req.body);
    const updated = updateCustomer(id, body);
    if (!updated) return reply.code(404).send({ error: "Não encontrado" });
    return updated;
  });

  app.post("/api/customers/:id/password-reset", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    try {
      const { adminIssuePasswordReset } = await import("./customer-auth.js");
      return adminIssuePasswordReset(id);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.delete("/api/customers/:id", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    if (!deleteCustomer(id)) return reply.code(404).send({ error: "Não encontrado" });
    return { ok: true };
  });

  app.post("/api/face/preview", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    const body = z.object({ imageBase64: z.string().min(32) }).parse(req.body);
    const embedded = await extractEmbedding(body.imageBase64);
    return facePreviewFromEmbed(embedded);
  });

  app.post("/api/customers/:id/enroll", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    const customer = getCustomer(id) as { consent_at?: string } | undefined;
    if (!customer) return reply.code(404).send({ error: "Não encontrado" });
    if (!customer.consent_at) {
      return reply.code(400).send({ error: "Cliente sem consentimento LGPD" });
    }
    const body = z.object({ imageBase64: z.string().min(32) }).parse(req.body);
    const embedded = await extractEmbedding(body.imageBase64);
    const preview = facePreviewFromEmbed(embedded);
    if (!preview.ok) {
      return reply.code(400).send({
        error: preview.error,
        code: preview.code,
        tip: preview.tip,
        quality: preview.quality,
      });
    }
    const embId = addFaceEmbedding(id, embedded.embedding!);
    return {
      ok: true,
      embeddingId: embId,
      faces: embedded.faces ?? 1,
      quality: embedded.quality,
      rotation_used: embedded.rotation_used,
      blur: embedded.blur,
    };
  });

  app.delete("/api/customers/:id/enroll", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    const customer = getCustomer(id);
    if (!customer) return reply.code(404).send({ error: "Não encontrado" });
    const removed = clearFaceEmbeddings(id);
    return {
      ok: true,
      removed,
      customer: getCustomer(id),
      tip: "Amostras faciais apagadas — pode cadastrar de novo",
    };
  });

  app.post("/api/customers/:id/points", async (req, reply) => {
    const station = stationFromHeader(req);
    const isStation = Boolean(station);
    if (!isStation && !(await adminGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = z
      .object({
        amountReais: z.number().positive().optional(),
        delta: z.number().int().optional(),
        reason: z.string().optional(),
      })
      .parse(req.body);

    let delta = body.delta;
    const pointsPerReal = Number(getSetting("points_per_real", String(config.pointsPerReal)));
    if (delta === undefined) {
      if (!body.amountReais) {
        return reply.code(400).send({ error: "Informe amountReais ou delta" });
      }
      delta = Math.round(body.amountReais * pointsPerReal);
    }
    try {
      const result = adjustPoints({
        customerId: id,
        delta,
        reason: body.reason || (delta >= 0 ? "Crédito fidelidade" : "Ajuste manual"),
        stationId: station?.id,
      });
      const customer = getCustomer(id);
      broadcastAdmins({ type: "points_updated", customer });
      if (station) {
        sendToStation(station.id, { type: "points_updated", customer });
      }
      return { ...result, customer };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.get("/api/customers/:id/time", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    const summary = getCustomerTimeSummary(id);
    if (!summary) return reply.code(404).send({ error: "Cliente não encontrado" });
    return summary;
  });

  app.post("/api/customers/:id/time/sale", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = z
      .object({
        hours: z.number().positive().optional(),
        amountReais: z.number().positive().optional(),
      })
      .parse(req.body);
    try {
      const result = sellTime({ customerId: id, hours: body.hours, amountReais: body.amountReais });
      broadcastAdmins({ type: "time_updated", customer: result.customer });
      return { ok: true, ...result };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.post("/api/customers/:id/time/adjust", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = z
      .object({
        deltaSeconds: z.number().int(),
        note: z.string().optional(),
      })
      .parse(req.body);
    try {
      const result = adjustTime({ customerId: id, deltaSeconds: body.deltaSeconds, note: body.note });
      broadcastAdmins({ type: "time_updated", customer: result.customer });
      return { ok: true, ...result };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.post("/api/customers/:id/subscription", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = z
      .object({
        status: z.enum(["none", "active", "paused"]),
        months: z.number().int().min(1).max(36).optional(),
        priceReais: z.number().min(0).optional(),
        notes: z.string().optional(),
      })
      .parse(req.body);
    try {
      const result = setSubscription({
        customerId: id,
        status: body.status,
        months: body.months,
        priceReais: body.priceReais,
        notes: body.notes,
      });
      broadcastAdmins({ type: "subscription_updated", customer: result.customer });
      return { ok: true, ...result };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.get("/api/customers/:id/ledger", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    return listLedger(id);
  });

  app.get("/api/ledger", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    return listLedger(undefined, 100);
  });

  app.get("/api/rewards", async (req) => {
    const auth = req.headers.authorization;
    const station = stationFromHeader(req);
    if (!station && !auth) {
      return listRewards(true);
    }
    if (station) return listRewards(true);
    try {
      await req.jwtVerify();
      return listRewards(false);
    } catch {
      return listRewards(true);
    }
  });

  app.post("/api/rewards", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    const body = z
      .object({
        title: z.string().min(2),
        description: z.string().optional(),
        costPoints: z.number().int().positive(),
      })
      .parse(req.body);
    return createReward(body);
  });

  app.patch("/api/rewards/:id", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = z
      .object({
        title: z.string().min(2).optional(),
        description: z.string().optional(),
        costPoints: z.number().int().positive().optional(),
        active: z.boolean().optional(),
      })
      .parse(req.body);
    const updated = updateReward(id, body);
    if (!updated) return reply.code(404).send({ error: "Não encontrado" });
    return updated;
  });

  app.delete("/api/rewards/:id", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    if (!deleteReward(id)) return reply.code(404).send({ error: "Não encontrado" });
    return { ok: true };
  });

  app.post("/api/customers/:id/redeem", async (req, reply) => {
    const station = stationFromHeader(req);
    if (!station && !(await adminGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = z.object({ rewardId: z.string() }).parse(req.body);
    try {
      const result = redeemReward(id, body.rewardId, station?.id);
      const customer = getCustomer(id);
      broadcastAdmins({ type: "reward_redeemed", customer, reward: result.reward });
      if (station) sendToStation(station.id, { type: "reward_redeemed", customer, reward: result.reward });
      return { ...result, customer };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

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
    const ip = req.ip;
    const station = heartbeatStation(body.token, ip);
    if (!station) return reply.code(401).send({ error: "Token de estação inválido" });
    broadcastAdmins({ type: "station_heartbeat", station });
    return { ok: true, station: { id: station.id, name: station.name } };
  });

  app.post("/api/stations/:id/command", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = z
      .object({
        command: z.enum(["reload", "message", "lock_screen", "unlock_screen", "end_session"]),
        text: z.string().optional(),
        title: z.string().max(80).optional(),
        level: z.enum(["info", "warn", "urgent"]).optional(),
        durationSec: z.number().int().min(3).max(600).optional(),
      })
      .parse(req.body);
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
    const body = z
      .object({
        command: z.enum(["reload", "message", "lock_screen", "unlock_screen", "end_session"]),
        text: z.string().optional(),
        title: z.string().max(80).optional(),
        level: z.enum(["info", "warn", "urgent"]).optional(),
        durationSec: z.number().int().min(3).max(600).optional(),
      })
      .parse(req.body);
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

  app.get("/api/events/recognition", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    return listRecognitionEvents(50);
  });

  app.post("/api/presence", async (req, reply) => {
    const station = stationFromHeader(req);
    if (!station) return reply.code(401).send({ error: "Token de estação obrigatório" });
    heartbeatStationById(station.id, req.ip);

    const body = z
      .object({
        imageBase64: z.string().min(32),
        customerId: z.string().min(1).optional(),
      })
      .parse(req.body);
    const embedded = await extractEmbedding(body.imageBase64);
    if (!embedded.ok || !embedded.embedding) {
      if (embedded.code === "service_down") {
        return reply.code(503).send({
          present: false,
          reason: "service_down",
          code: "service_down",
          tip: "Serviço facial reiniciando — aguarde alguns segundos",
        });
      }
      const code = embedded.code || "no_face";
      const reason =
        code === "face_too_small" || code === "face_blurry" || code === "low_quality"
          ? "low_quality"
          : "no_face";
      return { present: false, reason, code };
    }

    // Sem customerId: só "há rosto" (compat). Com customerId: VIP da sessão ainda reconhecido.
    if (!body.customerId) {
      return { present: true, reason: "face", code: "ok" };
    }

    const galleryRaw = listFaceEmbeddings();
    const gallery = parseGalleryEmbeddings(galleryRaw);
    if (gallery.length === 0) {
      return { present: false, reason: "no_gallery", code: "no_gallery" };
    }

    const threshold = Number(getSetting("face_match_threshold", String(config.faceMatchThreshold)));
    const matched = await matchEmbedding(embedded.embedding, gallery, threshold);
    if (!matched.ok) {
      if (matched.code === "service_down") {
        return reply.code(503).send({
          present: false,
          reason: "service_down",
          code: "service_down",
          tip: "Serviço facial reiniciando — aguarde alguns segundos",
          error: matched.error,
        });
      }
      return reply.code(502).send({ error: matched.error || "Falha no match de presença" });
    }

    if (matched.match && matched.match.customer_id !== body.customerId) {
      return {
        present: false,
        reason: "other_vip",
        code: "other_vip",
        bestScore: matched.match.score,
        bestCustomerId: matched.match.customer_id,
      };
    }

    if (!matched.match) {
      return {
        present: false,
        reason: matched.reason === "ambiguous" ? "ambiguous" : "unknown",
        code: matched.reason === "ambiguous" ? "ambiguous" : "unknown",
        bestScore: matched.best_score ?? 0,
        bestCustomerId: matched.best_customer_id ?? null,
      };
    }

    return {
      present: true,
      reason: "face",
      code: "ok",
      score: matched.match.score,
    };
  });

  app.post("/api/recognize", async (req, reply) => {
    const station = stationFromHeader(req);
    if (!station) return reply.code(401).send({ error: "Token de estação obrigatório" });
    const ip = req.ip || "unknown";
    if (!rateLimit(`recognize:${station.id}:${ip}`, 120, 60_000)) {
      return reply.code(429).send({ error: "Muitas tentativas de reconhecimento" });
    }
    heartbeatStationById(station.id, req.ip);

    const body = z.object({ imageBase64: z.string().min(32) }).parse(req.body);
    const embedded = await extractEmbedding(body.imageBase64);
    if (!embedded.ok || !embedded.embedding) {
      if (embedded.code === "service_down") {
        logEvent({
          level: "error",
          source: "api",
          kind: "face.service_down",
          message: "Recognize: face-service indisponível",
          stationId: station.id as string,
        });
        return reply.code(503).send({
          matched: false,
          reason: "service_down",
          code: "service_down",
          tip: "Serviço facial reiniciando — aguarde alguns segundos",
          error: embedded.error,
        });
      }
      const code = embedded.code || "no_face";
      const reason =
        code === "face_too_small" || code === "face_blurry" || code === "low_quality"
          ? "low_quality"
          : "no_face";
      const tip =
        code === "face_too_small"
          ? "Aproxime o rosto da câmera"
          : code === "face_blurry"
            ? "Imagem borrada — melhore a luz e segure firme"
            : "Posicione o rosto no centro do oval";
      return { matched: false, reason, tip, code, error: embedded.error };
    }

    const galleryRaw = listFaceEmbeddings();
    if (galleryRaw.length === 0) {
      return {
        matched: false,
        reason: "no_gallery",
        tip: "Nenhum VIP com enroll facial. Cadastre amostras no GeekCentral.",
      };
    }

    const gallery = parseGalleryEmbeddings(galleryRaw);
    if (gallery.length === 0) {
      return {
        matched: false,
        reason: "no_gallery",
        tip: "Nenhum VIP com enroll facial válido. Cadastre amostras no GeekCentral.",
      };
    }

    const threshold = Number(getSetting("face_match_threshold", String(config.faceMatchThreshold)));
    const matched = await matchEmbedding(embedded.embedding, gallery, threshold);
    if (!matched.ok) {
      if (matched.code === "service_down") {
        return reply.code(503).send({
          matched: false,
          reason: "service_down",
          code: "service_down",
          tip: "Serviço facial reiniciando — aguarde alguns segundos",
          error: matched.error,
        });
      }
      return reply.code(502).send({ error: matched.error || "Falha no match" });
    }

    if (!matched.match) {
      const bestScore = matched.best_score ?? 0;
      addRecognitionEvent({
        customerId: matched.best_customer_id || null,
        stationId: station.id,
        score: bestScore,
        status: "unknown",
      });
      const tip =
        matched.reason === "ambiguous"
          ? "Match ambíguo — refaça o enroll com mais ângulos"
          : bestScore > 0
            ? `Score baixo: ${(bestScore * 100).toFixed(0)}% — aproxime o rosto ou ajuste o limiar`
            : "Não reconhecido — faça enroll no GeekCentral";
      return {
        matched: false,
        reason: matched.reason === "ambiguous" ? "ambiguous" : "unknown",
        bestScore,
        bestCustomerId: matched.best_customer_id ?? null,
        tip,
      };
    }

    const customer = getCustomer(matched.match.customer_id);
    addRecognitionEvent({
      customerId: matched.match.customer_id,
      stationId: station.id,
      score: matched.match.score,
      status: "matched",
    });

    const payload = {
      type: "vip_detected",
      station: { id: station.id, name: station.name },
      customer,
      score: matched.match.score,
      at: new Date().toISOString(),
    };
    broadcastAdmins(payload);
    sendToStation(station.id, payload);

    return {
      matched: true,
      score: matched.match.score,
      customer,
      tip: `VIP reconhecido (${(matched.match.score * 100).toFixed(0)}%)`,
      timeBalanceSeconds: getTimeBalance(matched.match.customer_id),
    };
  });

  app.post("/api/sessions/start", async (req, reply) => {
    const station = stationFromHeader(req);
    if (!station) return reply.code(401).send({ error: "Token de estação obrigatório" });
    heartbeatStationById(station.id, req.ip);
    const body = z.object({ customerId: z.string().min(1) }).parse(req.body);
    const customer = getCustomer(body.customerId);
    if (!customer) return reply.code(404).send({ error: "Cliente não encontrado" });
    if (!(customer as { consent_at?: string }).consent_at) {
      return reply.code(400).send({
        error: "Cliente sem consentimento LGPD",
        code: "no_consent",
      });
    }
    try {
      const session = startSession(body.customerId, station.id);
      const payload = {
        type: "session_started",
        session,
        station: { id: station.id, name: station.name },
        customer,
        at: new Date().toISOString(),
      };
      broadcastAdmins(payload);
      sendToStation(station.id, payload);
      return {
        ok: true,
        session,
        customer,
        timeBalanceSeconds: getTimeBalance(body.customerId),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro";
      const isCredit = /cr[eé]dito|caixa/i.test(message);
      return reply.code(400).send({
        error: message,
        code: isCredit ? "no_credit" : "session_error",
        timeBalanceSeconds: getTimeBalance(body.customerId),
      });
    }
  });

  app.post("/api/sessions/heartbeat", async (req, reply) => {
    const station = stationFromHeader(req);
    if (!station) return reply.code(401).send({ error: "Token de estação obrigatório" });
    heartbeatStationById(station.id, req.ip);
    const body = z.object({ sessionId: z.string().min(1) }).parse(req.body);
    try {
      const session = heartbeatSession(body.sessionId, station.id) as {
        time_depleted?: boolean;
        customer_id: string;
        id: string;
      };
      if (session.time_depleted) {
        const ended = endSession(session.id, "no_credit");
        sendCommandToStation(station.id, "end_session", { reason: "no_credit" });
        broadcastAdmins({
          type: "session_ended",
          session: ended,
          station: { id: station.id, name: station.name },
          reason: "no_credit",
          at: new Date().toISOString(),
        });
        return { ok: true, session: ended, timeDepleted: true };
      }
      return { ok: true, session };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.post("/api/sessions/end", async (req, reply) => {
    const station = stationFromHeader(req);
    if (!station && !(await adminGuard(req, reply))) return;
    const body = z
      .object({
        sessionId: z.string().optional(),
        reason: z.string().optional(),
      })
      .parse(req.body);

    try {
      let session;
      if (body.sessionId) {
        const current = getSession(body.sessionId);
        if (!current) return reply.code(404).send({ error: "Sessão não encontrada" });
        if (station && current.station_id !== station.id) {
          return reply.code(403).send({ error: "Sessão de outra estação" });
        }
        session = endSession(body.sessionId, body.reason || "end");
      } else if (station) {
        session = endActiveSessionForStation(station.id);
        if (!session) return { ok: true, session: null };
      } else {
        return reply.code(400).send({ error: "Informe sessionId" });
      }

      const payload = {
        type: "session_ended",
        session,
        station: station ? { id: station.id, name: station.name } : null,
        reason: body.reason || "end",
        at: new Date().toISOString(),
      };
      broadcastAdmins(payload);
      if (station) sendToStation(station.id, payload);
      return { ok: true, session };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.get("/api/sessions", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    return {
      sessions: listSessions(100),
      stats: sessionStatsToday(),
    };
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
    const station = registerStation(body.name);
    return station;
  });
}
