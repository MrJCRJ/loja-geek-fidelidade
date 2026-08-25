import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getTimeBalance } from "./billing.js";
import { getCustomer } from "./customers.js";
import { adminGuard, stationFromHeader } from "./http-guards.js";
import { broadcastAdmins, sendCommandToStation, sendToStation } from "./hub.js";
import {
  endActiveSessionForStation,
  endSession,
  getSession,
  heartbeatSession,
  listSessions,
  sessionStatsToday,
  startSession,
} from "./sessions.js";
import { heartbeatStationById } from "./stations.js";

export async function registerSessionRoutes(app: FastifyInstance) {
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
}
