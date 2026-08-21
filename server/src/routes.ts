import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { config } from "./config.js";
import {
  addFaceEmbedding,
  addRecognitionEvent,
  adjustPoints,
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
import { extractEmbedding, faceHealth, matchEmbedding } from "./face-client.js";
import {
  broadcastAdmins,
  listConnectedStations,
  sendCommandToAllStations,
  sendCommandToStation,
  sendToStation,
} from "./hub.js";
import {
  deleteStation,
  getStationByToken,
  heartbeatStation,
  listStations,
  registerStation,
  renameStation,
} from "./stations.js";
import {
  endActiveSessionForStation,
  endSession,
  getSession,
  heartbeatSession,
  listSessions,
  sessionStatsToday,
  startSession,
} from "./sessions.js";

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
    const body = z.object({ password: z.string() }).parse(req.body);
    if (body.password !== config.adminPassword) {
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
    return {
      faceMatchThreshold: Number(getSetting("face_match_threshold", String(config.faceMatchThreshold))),
      pointsPerReal: Number(getSetting("points_per_real", String(config.pointsPerReal))),
    };
  });

  app.put("/api/settings", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    const body = z
      .object({
        faceMatchThreshold: z.number().min(0.1).max(0.99).optional(),
        pointsPerReal: z.number().min(0.01).max(100).optional(),
      })
      .parse(req.body);
    if (body.faceMatchThreshold !== undefined) {
      setSetting("face_match_threshold", String(body.faceMatchThreshold));
    }
    if (body.pointsPerReal !== undefined) {
      setSetting("points_per_real", String(body.pointsPerReal));
    }
    return {
      faceMatchThreshold: Number(getSetting("face_match_threshold", String(config.faceMatchThreshold))),
      pointsPerReal: Number(getSetting("points_per_real", String(config.pointsPerReal))),
    };
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

  app.delete("/api/customers/:id", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    if (!deleteCustomer(id)) return reply.code(404).send({ error: "Não encontrado" });
    return { ok: true };
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
    if (!embedded.ok || !embedded.embedding) {
      return reply.code(400).send({ error: embedded.error || "Nenhum rosto detectado" });
    }
    const embId = addFaceEmbedding(id, embedded.embedding);
    return { ok: true, embeddingId: embId, faces: embedded.faces ?? 1 };
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
        command: z.enum(["reload", "message", "lock_screen", "unlock_screen"]),
        text: z.string().optional(),
      })
      .parse(req.body);
    sendCommandToStation(id, body.command, { text: body.text || "" });
    return { ok: true };
  });

  app.post("/api/stations/command-all", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    const body = z
      .object({
        command: z.enum(["reload", "message", "lock_screen", "unlock_screen"]),
        text: z.string().optional(),
      })
      .parse(req.body);
    sendCommandToAllStations(body.command, { text: body.text || "" });
    return { ok: true };
  });

  app.get("/api/events/recognition", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    return listRecognitionEvents(50);
  });

  app.post("/api/recognize", async (req, reply) => {
    const station = stationFromHeader(req);
    if (!station) return reply.code(401).send({ error: "Token de estação obrigatório" });
    heartbeatStation(station.token, req.ip);

    const body = z.object({ imageBase64: z.string().min(32) }).parse(req.body);
    const embedded = await extractEmbedding(body.imageBase64);
    if (!embedded.ok || !embedded.embedding) {
      return { matched: false, reason: embedded.error || "no_face" };
    }

    const galleryRaw = listFaceEmbeddings();
    const gallery = galleryRaw.map((g) => ({
      id: g.id,
      customer_id: g.customer_id,
      embedding: JSON.parse(g.embedding) as number[],
    }));

    const threshold = Number(getSetting("face_match_threshold", String(config.faceMatchThreshold)));
    const matched = await matchEmbedding(embedded.embedding, gallery, threshold);
    if (!matched.ok) {
      return reply.code(502).send({ error: matched.error || "Falha no match" });
    }

    if (!matched.match) {
      addRecognitionEvent({
        customerId: null,
        stationId: station.id,
        score: 0,
        status: "unknown",
      });
      return { matched: false, reason: "unknown" };
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
    };
  });

  app.post("/api/sessions/start", async (req, reply) => {
    const station = stationFromHeader(req);
    if (!station) return reply.code(401).send({ error: "Token de estação obrigatório" });
    heartbeatStation(station.token, req.ip);
    const body = z.object({ customerId: z.string().min(1) }).parse(req.body);
    const customer = getCustomer(body.customerId);
    if (!customer) return reply.code(404).send({ error: "Cliente não encontrado" });
    if (!(customer as { consent_at?: string }).consent_at) {
      return reply.code(400).send({ error: "Cliente sem consentimento LGPD" });
    }
    const session = startSession(body.customerId, station.id);
    const payload = {
      type: "session_started",
      session,
      station: { id: station.id, name: station.name },
      at: new Date().toISOString(),
    };
    broadcastAdmins(payload);
    sendToStation(station.id, payload);
    return { ok: true, session };
  });

  app.post("/api/sessions/heartbeat", async (req, reply) => {
    const station = stationFromHeader(req);
    if (!station) return reply.code(401).send({ error: "Token de estação obrigatório" });
    heartbeatStation(station.token, req.ip);
    const body = z.object({ sessionId: z.string().min(1) }).parse(req.body);
    try {
      const session = heartbeatSession(body.sessionId, station.id);
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
