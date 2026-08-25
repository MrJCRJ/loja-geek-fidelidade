import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { config } from "./config.js";
import {
  canEnrollMore,
  loginPortalCustomer,
  MAX_FACE_SAMPLES,
  publicCustomerProfile,
  registerPortalCustomer,
  requestPortalPasswordReset,
  resetPasswordWithToken,
  updatePortalProfile,
} from "./customer-auth.js";
import { addFaceEmbedding, clearFaceEmbeddings, getCustomer } from "./customers.js";
import { extractEmbedding } from "./face-client.js";
import { facePreviewFromEmbed, faceQualityTip } from "./face-preview.js";
import { getHourPriceReais, getSubscriberDiscountPct, listTimeLedger } from "./billing.js";
import { getUnitSettings } from "./admin-ops.js";
import { rateLimit } from "./security.js";
import {
  checkoutHours,
  checkoutSubscription,
  handleMercadoPagoWebhook,
  listWebOrders,
  mercadopagoEnabled,
  syncOrderPaymentStatus,
} from "./payments.js";

type JwtPayload = { role?: string; sub?: string; customerId?: string };

async function customerGuard(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
    const payload = req.user as JwtPayload;
    if (payload.role !== "customer" || !payload.customerId) {
      reply.code(401).send({ error: "Token de cliente inválido" });
      return null;
    }
    const customer = getCustomer(payload.customerId);
    if (!customer) {
      reply.code(401).send({ error: "Cliente não encontrado" });
      return null;
    }
    return payload.customerId;
  } catch {
    reply.code(401).send({ error: "Não autorizado" });
    return null;
  }
}

export async function registerPortalRoutes(app: FastifyInstance) {
  app.get("/api/portal/catalog", async () => {
    const mode = config.portalCheckoutMode;
    const mp = mercadopagoEnabled();
    const unit = getUnitSettings();
    return {
      baseHourPrice: getHourPriceReais(),
      subscriberDiscountPct: getSubscriberDiscountPct(),
      subscriptionMonthlyPrice: config.subscriptionMonthlyPrice,
      hourPacks: [
        { amountReais: 10, label: "1 hora" },
        { amountReais: 20, label: "2 horas" },
        { amountReais: 50, label: "5 horas" },
      ],
      maxFaceSamples: MAX_FACE_SAMPLES,
      checkoutEnabled: mode !== "off",
      checkoutMode: mode,
      demo: mode === "demo",
      payments: {
        mode: mp ? "mercadopago" : "stub",
        pixEnabled: mp && mode !== "off",
      },
      whatsappLan: "5575988603747",
      whatsappShop: "5575991869502",
      unit,
      units: [
        {
          id: "loja-geeks",
          name: "Loja GEEKS",
          kind: "shop",
          note: "Celular, games e colecionáveis",
          whatsapp: "5575991869502",
        },
        {
          id: "game-box",
          name: "Game Box",
          kind: "shop",
          note: "Games e acessórios",
          whatsapp: "5575991869502",
        },
        {
          id: "lan-geeks",
          name: "Lan House Geeks",
          kind: "lan",
          note: "PCs · GeekLock · serviços digitais",
          whatsapp: "5575988603747",
          unitId: unit.unitId,
          unitName: unit.unitName,
        },
      ],
      shopCatalog: [
        {
          id: "ps5",
          title: "Jogos / consoles",
          blurb: "Peça disponibilidade de games e acessórios",
          whatsapp: "5575991869502",
          prefill: "Oi! Quero saber sobre jogos/consoles na Loja GEEKS.",
        },
        {
          id: "cell",
          title: "Celular e acessórios",
          blurb: "Capas, fones, carregadores e mais",
          whatsapp: "5575991869502",
          prefill: "Oi! Quero ver opções de celular/acessórios.",
        },
        {
          id: "inss",
          title: "Serviços digitais / INSS",
          blurb: "Agendamento e auxílio na lan house",
          whatsapp: "5575988603747",
          prefill: "Oi! Preciso de ajuda com serviço digital / INSS na Lan Geeks.",
        },
        {
          id: "hours",
          title: "Horas de PC",
          blurb: "Compre pelo portal ou peça crédito no balcão",
          whatsapp: "5575988603747",
          prefill: "Oi! Quero comprar horas de PC na Lan House Geeks.",
        },
      ],
    };
  });

  app.get("/api/portal/health", async () => {
    const mode = config.portalCheckoutMode;
    return {
      ok: true,
      ts: new Date().toISOString(),
      payments: mercadopagoEnabled() ? "mp" : "stub",
      checkoutEnabled: mode !== "off",
      checkoutMode: mode,
      demo: mode === "demo",
    };
  });

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
      const token = app.jwt.sign(
        { role: "customer", customerId, sub: customerId },
        { expiresIn: "30d" },
      );
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
      const token = app.jwt.sign(
        { role: "customer", customerId, sub: customerId },
        { expiresIn: "30d" },
      );
      return { token, customer: publicCustomerProfile(customerId) };
    } catch (err) {
      return reply.code(401).send({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.get("/api/portal/me", async (req, reply) => {
    const customerId = await customerGuard(req, reply);
    if (!customerId) return;
    return publicCustomerProfile(customerId);
  });

  app.get("/api/portal/me/time-ledger", async (req, reply) => {
    const customerId = await customerGuard(req, reply);
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

  app.patch("/api/portal/me", async (req, reply) => {
    const customerId = await customerGuard(req, reply);
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
    const customerId = await customerGuard(req, reply);
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
    const customerId = await customerGuard(req, reply);
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

  app.post("/api/portal/checkout/hours", async (req, reply) => {
    const customerId = await customerGuard(req, reply);
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
    const customerId = await customerGuard(req, reply);
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

  app.post("/api/portal/enroll/preview", async (req, reply) => {
    const customerId = await customerGuard(req, reply);
    if (!customerId) return;
    const ip = req.ip || "unknown";
    if (!rateLimit(`preview:${customerId}:${ip}`, 90, 60_000)) {
      return reply.code(429).send({ error: "Muitas prévias — aguarde um minuto" });
    }
    const body = z.object({ imageBase64: z.string().min(32) }).parse(req.body);
    const embedded = await extractEmbedding(body.imageBase64);
    return facePreviewFromEmbed(embedded);
  });

  app.post("/api/portal/enroll", async (req, reply) => {
    const customerId = await customerGuard(req, reply);
    if (!customerId) return;
    const ip = req.ip || "unknown";
    if (!rateLimit(`enroll:${customerId}:${ip}`, 30, 60_000)) {
      return reply.code(429).send({ error: "Muitas capturas — aguarde um minuto" });
    }

    const customer = getCustomer(customerId) as { consent_at?: string } | undefined;
    if (!customer?.consent_at) {
      return reply.code(400).send({ error: "Consentimento LGPD ausente" });
    }
    if (!canEnrollMore(customerId)) {
      return reply.code(400).send({
        error: `Limite de ${MAX_FACE_SAMPLES} amostras atingido — refine na loja se precisar`,
        code: "max_samples",
      });
    }

    const body = z.object({ imageBase64: z.string().min(32) }).parse(req.body);
    const embedded = await extractEmbedding(body.imageBase64);
    const preview = facePreviewFromEmbed(embedded);
    if (!preview.ok) {
      return reply.code(400).send({
        error: preview.error || "Qualidade insuficiente",
        code: preview.code,
        tip: preview.tip || faceQualityTip(preview.code),
        quality: preview.quality,
      });
    }

    const embId = addFaceEmbedding(customerId, embedded.embedding!);
    const profile = publicCustomerProfile(customerId);
    return {
      ok: true,
      embeddingId: embId,
      quality: embedded.quality,
      faceSamples: profile?.faceSamples ?? 0,
      maxFaceSamples: MAX_FACE_SAMPLES,
      tip: "Amostra salva — próximo ângulo",
    };
  });

  app.delete("/api/portal/enroll", async (req, reply) => {
    const customerId = await customerGuard(req, reply);
    if (!customerId) return;
    const ip = req.ip || "unknown";
    if (!rateLimit(`enroll-clear:${customerId}:${ip}`, 10, 60_000)) {
      return reply.code(429).send({ error: "Muitas tentativas — aguarde um minuto" });
    }
    const removed = clearFaceEmbeddings(customerId);
    const profile = publicCustomerProfile(customerId);
    return {
      ok: true,
      removed,
      faceSamples: profile?.faceSamples ?? 0,
      maxFaceSamples: MAX_FACE_SAMPLES,
      tip: "Amostras apagadas — você pode cadastrar o rosto de novo",
    };
  });

  /** Alias POST (alguns proxies/CORS bloqueiam DELETE). */
  app.post("/api/portal/enroll/reset", async (req, reply) => {
    const customerId = await customerGuard(req, reply);
    if (!customerId) return;
    const ip = req.ip || "unknown";
    if (!rateLimit(`enroll-clear:${customerId}:${ip}`, 10, 60_000)) {
      return reply.code(429).send({ error: "Muitas tentativas — aguarde um minuto" });
    }
    const removed = clearFaceEmbeddings(customerId);
    const profile = publicCustomerProfile(customerId);
    return {
      ok: true,
      removed,
      faceSamples: profile?.faceSamples ?? 0,
      maxFaceSamples: MAX_FACE_SAMPLES,
      tip: "Amostras apagadas — você pode cadastrar o rosto de novo",
    };
  });

  app.post("/api/portal/webhooks/mercadopago", async (req, reply) => {
    try {
      if (config.mpWebhookSecret) {
        const provided =
          String(req.headers["x-webhook-secret"] || "") ||
          String(req.headers["x-signature"] || "");
        // MVP: exige header com o segredo configurado (ou assinatura que o contenha).
        // Em produção volume alto, troque por validação HMAC oficial do Mercado Pago.
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
