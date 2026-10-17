import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getTimeBalance } from "./billing.js";
import { stationFromHeader } from "./http-guards.js";
import { broadcastAdmins, sendToStation } from "./hub.js";
import { loginLockCustomer, registerLockCustomer } from "./lock-account.js";
import { requestOpenHour } from "./open-hour.js";
import { rateLimit } from "./security.js";
import { startSession } from "./sessions.js";
import { heartbeatStationById } from "./stations.js";

function customerName(customer: unknown) {
  return String((customer as { name?: string } | null)?.name || "");
}

async function openOrStayLocked(
  customerId: string,
  station: { id: string; name: string },
  customer: unknown,
) {
  try {
    const session = startSession(customerId, station.id);
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
      status: 200 as const,
      body: {
        ok: true,
        session,
        customer,
        timeBalanceSeconds: getTimeBalance(customerId),
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro";
    const inUse = /outro PC/i.test(message);
    const isCredit = /cr[eé]dito|caixa/i.test(message);
    return {
      status: (inUse ? 409 : 400) as 409 | 400,
      body: {
        ok: false,
        error: message,
        code: inUse ? "already_in_use" : isCredit ? "no_credit" : "session_error",
        customer,
        customerName: customerName(customer),
        timeBalanceSeconds: getTimeBalance(customerId),
      },
    };
  }
}

export async function registerLockRoutes(app: FastifyInstance) {
  app.post("/api/lock/register", async (req, reply) => {
    const station = stationFromHeader(req);
    if (!station) return reply.code(401).send({ error: "Token de estação obrigatório" });
    const ip = req.ip || "unknown";
    if (!rateLimit(`lock-reg:${station.id}:${ip}`, 8, 60_000)) {
      return reply.code(429).send({ error: "Muitas tentativas — aguarde um minuto" });
    }
    heartbeatStationById(station.id, req.ip);
    const body = z
      .object({
        name: z.string().min(2).max(80),
        username: z.string().min(3).max(24),
        password: z.string().min(6).max(80),
        imageBase64: z.string().min(32).optional(),
      })
      .parse(req.body);
    try {
      const customer = await registerLockCustomer(body);
      const customerId = (customer as { id: string }).id;
      const opened = await openOrStayLocked(customerId, station, customer);
      return reply.code(opened.status).send(opened.body);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.post("/api/lock/open-request", async (req, reply) => {
    const station = stationFromHeader(req);
    if (!station) return reply.code(401).send({ error: "Token de estação obrigatório" });
    const ip = req.ip || "unknown";
    if (!rateLimit(`lock-open:${station.id}:${ip}`, 8, 60_000)) {
      return reply.code(429).send({ error: "Muitas tentativas — aguarde um minuto" });
    }
    heartbeatStationById(station.id, req.ip);
    const body = z
      .object({
        username: z.string().min(1).max(24),
        password: z.string().min(1).max(80),
      })
      .parse(req.body);
    try {
      const result = await requestOpenHour({
        stationId: station.id,
        stationName: station.name,
        username: body.username,
        password: body.password,
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro";
      const code = /outro PC/i.test(message) ? 409 : 401;
      return reply.code(code).send({
        error: message,
        code: /outro PC/i.test(message) ? "already_in_use" : "auth",
      });
    }
  });

  app.post("/api/lock/login", async (req, reply) => {
    const station = stationFromHeader(req);
    if (!station) return reply.code(401).send({ error: "Token de estação obrigatório" });
    const ip = req.ip || "unknown";
    if (!rateLimit(`lock-login:${station.id}:${ip}`, 20, 60_000)) {
      return reply.code(429).send({ error: "Muitas tentativas — aguarde um minuto" });
    }
    heartbeatStationById(station.id, req.ip);
    const body = z
      .object({
        username: z.string().min(1).max(24),
        password: z.string().min(1).max(80),
      })
      .parse(req.body);
    try {
      const customer = await loginLockCustomer(body.username, body.password);
      const customerId = (customer as { id: string }).id;
      const opened = await openOrStayLocked(customerId, station, customer);
      return reply.code(opened.status).send(opened.body);
    } catch (err) {
      return reply.code(401).send({ error: err instanceof Error ? err.message : "Erro" });
    }
  });
}
