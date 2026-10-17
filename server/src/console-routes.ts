import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  addConsoleTime,
  endConsoleSession,
  listConsoles,
  reduceConsoleTime,
  startConsoleSession,
} from "./consoles.js";
import { createCustomer, getCustomer, listCustomers, updateCustomer } from "./customers.js";
import { actorLabel, staffWriteGuard, adminGuard } from "./http-guards.js";

function resolveDeskCustomer(input: { customerId?: string; customerName?: string }) {
  if (input.customerId) {
    const existing = getCustomer(input.customerId) as { id: string; consent_at?: string | null } | undefined;
    if (!existing) throw new Error("Cliente não encontrado");
    if (!existing.consent_at) updateCustomer(existing.id, { consent: true });
    return getCustomer(existing.id)! as { id: string; name: string };
  }
  const name = String(input.customerName || "").trim();
  if (name.length < 2) throw new Error("Informe o nome do cliente (mín. 2 caracteres)");
  const hit = (listCustomers() as Array<{ id: string; name: string; consent_at?: string | null }>).find(
    (c) => c.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (hit) {
    if (!hit.consent_at) updateCustomer(hit.id, { consent: true });
    return getCustomer(hit.id)! as { id: string; name: string };
  }
  return createCustomer({
    name,
    consent: true,
    notes: "Criado no balcão (console)",
  }) as { id: string; name: string };
}

export async function registerConsoleRoutes(app: FastifyInstance) {
  app.get("/api/consoles", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    return { consoles: listConsoles() };
  });

  app.post("/api/consoles/:id/start", async (req, reply) => {
    if (!(await staffWriteGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = z
      .object({
        mode: z.enum(["sale", "open", "balance"]),
        customerId: z.string().min(1).optional(),
        customerName: z.string().min(2).max(80).optional(),
        amountReais: z.number().positive().optional(),
        hours: z.number().positive().optional(),
        seconds: z.number().int().positive().optional(),
      })
      .parse(req.body || {});
    try {
      const customer = resolveDeskCustomer(body);
      return startConsoleSession({
        consoleId: id,
        customerId: customer.id,
        mode: body.mode,
        hours: body.hours,
        seconds: body.seconds,
        amountReais: body.amountReais,
        actor: actorLabel(req),
      });
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.post("/api/consoles/:id/add", async (req, reply) => {
    if (!(await staffWriteGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = z
      .object({
        amountReais: z.number().positive().optional(),
        hours: z.number().positive().optional(),
        seconds: z.number().int().positive().optional(),
        fromBalance: z.boolean().optional(),
      })
      .parse(req.body || {});
    try {
      return addConsoleTime({
        consoleId: id,
        hours: body.hours,
        seconds: body.seconds,
        amountReais: body.amountReais,
        fromBalance: body.fromBalance,
        actor: actorLabel(req),
      });
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.post("/api/consoles/:id/reduce", async (req, reply) => {
    if (!(await staffWriteGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = z.object({ seconds: z.number().int().positive() }).parse(req.body || {});
    try {
      return reduceConsoleTime({ consoleId: id, seconds: body.seconds, actor: actorLabel(req) });
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.post("/api/consoles/:id/end", async (req, reply) => {
    if (!(await staffWriteGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    try {
      return endConsoleSession({ consoleId: id, actor: actorLabel(req) });
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Erro" });
    }
  });
}
