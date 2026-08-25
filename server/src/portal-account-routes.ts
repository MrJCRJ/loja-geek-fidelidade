import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { listTimeLedger } from "./billing.js";
import { publicCustomerProfile, updatePortalProfile } from "./customer-auth.js";
import { listWebOrders, syncOrderPaymentStatus } from "./payments.js";
import { portalCustomerGuard } from "./portal-guards.js";

export async function registerPortalAccountRoutes(app: FastifyInstance) {
  app.get("/api/portal/me", async (req, reply) => {
    const customerId = await portalCustomerGuard(req, reply);
    if (!customerId) return;
    return publicCustomerProfile(customerId);
  });

  app.get("/api/portal/me/time-ledger", async (req, reply) => {
    const customerId = await portalCustomerGuard(req, reply);
    if (!customerId) return;
    const rows = listTimeLedger(customerId, 40) as Array<{
      id: string;
      delta_seconds: number;
      amount_reais: number;
      reason: string;
      created_at: string;
    }>;
    return {
      ledger: rows.map((r) => ({
        id: r.id,
        deltaSeconds: r.delta_seconds,
        amountReais: r.amount_reais,
        reason: r.reason,
        createdAt: r.created_at,
      })),
    };
  });

  app.patch("/api/portal/me", async (req, reply) => {
    const customerId = await portalCustomerGuard(req, reply);
    if (!customerId) return;
    const body = z
      .object({
        name: z.string().min(2).optional(),
        phone: z.string().nullable().optional(),
        password: z.string().min(6).optional(),
        currentPassword: z.string().optional(),
      })
      .parse(req.body);
    try {
      const customer = await updatePortalProfile(customerId, body);
      return { ok: true, customer };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.get("/api/portal/orders", async (req, reply) => {
    const customerId = await portalCustomerGuard(req, reply);
    if (!customerId) return;
    const orders = listWebOrders(customerId, 40);
    return {
      orders: orders.map((o) => ({
        id: o.id,
        kind: o.kind,
        amountReais: o.amount_reais,
        hours: o.hours,
        months: o.months,
        status: o.status,
        provider: o.provider,
        demo: o.status === "demo_ok" || o.provider === "mercadopago_demo",
        createdAt: o.created_at,
        paidAt: o.paid_at,
      })),
    };
  });

  app.get("/api/portal/orders/:id", async (req, reply) => {
    const customerId = await portalCustomerGuard(req, reply);
    if (!customerId) return;
    const { id } = req.params as { id: string };
    try {
      const synced = await syncOrderPaymentStatus(id);
      const order = synced.order;
      if (!order || order.customer_id !== customerId) {
        return reply.code(404).send({ error: "Pedido não encontrado" });
      }
      return {
        order: {
          id: order.id,
          kind: order.kind,
          amountReais: order.amount_reais,
          hours: order.hours,
          months: order.months,
          status: order.status,
          provider: order.provider,
          demo: synced.demo ?? (order.status === "demo_ok" || order.provider === "mercadopago_demo"),
          createdAt: order.created_at,
          paidAt: order.paid_at,
        },
        customer: synced.customer,
        demo: synced.demo ?? false,
        credited: synced.credited ?? order.status === "paid",
      };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Erro" });
    }
  });
}
