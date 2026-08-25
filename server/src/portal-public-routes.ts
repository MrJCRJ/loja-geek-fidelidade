import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  loginPortalCustomer,
  publicCustomerProfile,
  registerPortalCustomer,
  requestPortalPasswordReset,
  resetPasswordWithToken,
} from "./customer-auth.js";
import { buildPortalCatalog, buildPortalHealth } from "./portal-catalog.js";
import { signPortalToken } from "./portal-guards.js";
import { rateLimit } from "./security.js";

export async function registerPortalPublicRoutes(app: FastifyInstance) {
  app.get("/api/portal/catalog", async () => buildPortalCatalog());

  app.get("/api/portal/health", async () => buildPortalHealth());

  app.post("/api/portal/register", async (req, reply) => {
    const ip = req.ip || "unknown";
    if (!rateLimit(`reg:${ip}`, 10, 60_000)) {
      return reply.code(429).send({ error: "Muitas tentativas — aguarde um minuto" });
    }
    const body = z
      .object({
        name: z.string().min(2),
        email: z.string().email(),
        password: z.string().min(6),
        phone: z.string().optional(),
        consent: z.boolean(),
      })
      .parse(req.body);

    try {
      const customer = await registerPortalCustomer(body);
      const customerId = (customer as { id: string }).id;
      const token = signPortalToken(app, customerId);
      return { token, customer: publicCustomerProfile(customerId) };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.post("/api/portal/login", async (req, reply) => {
    const ip = req.ip || "unknown";
    if (!rateLimit(`login:${ip}`, 20, 60_000)) {
      return reply.code(429).send({ error: "Muitas tentativas — aguarde um minuto" });
    }
    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(1),
      })
      .parse(req.body);
    try {
      const customer = await loginPortalCustomer(body.email, body.password);
      const customerId = (customer as { id: string }).id;
      const token = signPortalToken(app, customerId);
      return { token, customer: publicCustomerProfile(customerId) };
    } catch (err) {
      return reply.code(401).send({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.post("/api/portal/password/forgot", async (req, reply) => {
    const ip = req.ip || "unknown";
    if (!rateLimit(`forgot:${ip}`, 8, 60_000)) {
      return reply.code(429).send({ error: "Muitas tentativas — aguarde um minuto" });
    }
    const body = z.object({ email: z.string().email() }).parse(req.body);
    return requestPortalPasswordReset(body.email);
  });

  app.post("/api/portal/password/reset", async (req, reply) => {
    const ip = req.ip || "unknown";
    if (!rateLimit(`reset:${ip}`, 10, 60_000)) {
      return reply.code(429).send({ error: "Muitas tentativas — aguarde um minuto" });
    }
    const body = z
      .object({
        token: z.string().min(16),
        password: z.string().min(6),
      })
      .parse(req.body);
    try {
      return await resetPasswordWithToken(body.token, body.password);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Erro" });
    }
  });
}
