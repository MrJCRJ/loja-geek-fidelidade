import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "./config.js";
import { portalCustomerGuard } from "./portal-guards.js";
import {
  deletePushSubscription,
  pushEnabled,
  upsertPushSubscription,
} from "./push.js";

export async function registerPortalPushRoutes(app: FastifyInstance) {
  app.get("/api/portal/push/vapid-public-key", async (_req, reply) => {
    if (!pushEnabled()) {
      return reply.code(503).send({ error: "Push desativado", code: "push_disabled" });
    }
    return { publicKey: config.vapidPublicKey, enabled: true };
  });

  app.post("/api/portal/push/subscribe", async (req, reply) => {
    const customerId = await portalCustomerGuard(req, reply);
    if (!customerId) return;
    if (!pushEnabled()) {
      return reply.code(503).send({ error: "Push desativado", code: "push_disabled" });
    }
    const body = z
      .object({
        endpoint: z.string().url(),
        keys: z.object({
          p256dh: z.string().min(1),
          auth: z.string().min(1),
        }),
      })
      .parse(req.body);
    const id = upsertPushSubscription(customerId, body, req.headers["user-agent"]);
    return { ok: true, id };
  });

  app.delete("/api/portal/push/subscribe", async (req, reply) => {
    const customerId = await portalCustomerGuard(req, reply);
    if (!customerId) return;
    const body = z.object({ endpoint: z.string().url() }).parse(req.body);
    deletePushSubscription(customerId, body.endpoint);
    return { ok: true };
  });
}
