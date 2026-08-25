import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "./config.js";
import { publicCustomerProfile } from "./customer-auth.js";
import {
  checkoutHours,
  checkoutSubscription,
  handleMercadoPagoWebhook,
  mercadopagoEnabled,
} from "./payments.js";
import { portalCustomerGuard } from "./portal-guards.js";

export async function registerPortalCheckoutRoutes(app: FastifyInstance) {
  app.post("/api/portal/checkout/hours", async (req, reply) => {
    const customerId = await portalCustomerGuard(req, reply);
    if (!customerId) return;
    if (config.portalCheckoutMode === "off") {
      return reply.code(403).send({
        error: "Checkout desativado — compre na loja ou WhatsApp",
        code: "checkout_disabled",
      });
    }
    if (config.portalCheckoutMode === "demo" && !mercadopagoEnabled()) {
      return reply.code(503).send({
        error: "Demonstração exige MP_ACCESS_TOKEN (TEST-...) na loja",
        code: "demo_mp_missing",
      });
    }
    const body = z
      .object({
        hours: z.number().positive().optional(),
        amountReais: z.number().positive().optional(),
      })
      .parse(req.body);
    const profile = publicCustomerProfile(customerId);
    try {
      const result = await checkoutHours(customerId, body, profile?.email || "");
      return { ok: true, ...result };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.post("/api/portal/checkout/subscription", async (req, reply) => {
    const customerId = await portalCustomerGuard(req, reply);
    if (!customerId) return;
    if (config.portalCheckoutMode === "off") {
      return reply.code(403).send({
        error: "Checkout desativado — compre na loja ou WhatsApp",
        code: "checkout_disabled",
      });
    }
    if (config.portalCheckoutMode === "demo" && !mercadopagoEnabled()) {
      return reply.code(503).send({
        error: "Demonstração exige MP_ACCESS_TOKEN (TEST-...) na loja",
        code: "demo_mp_missing",
      });
    }
    const body = z
      .object({
        months: z.number().int().min(1).max(36).optional(),
        priceReais: z.number().min(0).optional(),
      })
      .parse(req.body);
    const profile = publicCustomerProfile(customerId);
    try {
      const result = await checkoutSubscription(
        customerId,
        {
          months: body.months,
          priceReais: body.priceReais ?? config.subscriptionMonthlyPrice,
        },
        profile?.email || "",
      );
      return { ok: true, ...result };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.post("/api/portal/webhooks/mercadopago", async (req, reply) => {
    try {
      if (config.mpWebhookSecret) {
        const provided =
          String(req.headers["x-webhook-secret"] || "") ||
          String(req.headers["x-signature"] || "");
        if (!provided || (provided !== config.mpWebhookSecret && !provided.includes(config.mpWebhookSecret))) {
          return reply.code(401).send({ error: "Webhook não autorizado" });
        }
      }
      const result = await handleMercadoPagoWebhook(req.body);
      return result;
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : "Erro webhook" });
    }
  });
}
