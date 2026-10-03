import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { exportCustomerLgpd } from "./admin-ops.js";
import {
  adjustTime,
  getCustomerTimeSummary,
  sellTime,
  setSubscription,
} from "./billing.js";
import { config } from "./config.js";
import {
  addFaceEmbedding,
  adjustPoints,
  clearFaceEmbeddings,
  createCustomer,
  createReward,
  deleteCustomer,
  deleteReward,
  getCustomer,
  getSetting,
  listCustomers,
  listLedger,
  listRewards,
  redeemReward,
  updateCustomer,
  updateReward,
} from "./customers.js";
import { extractEmbedding } from "./face-client.js";
import { facePreviewFromEmbed } from "./face-preview.js";
import {
  adminGuard,
  ownerWriteGuard,
  staffWriteGuard,
  actorLabel,
  stationFromHeader,
} from "./http-guards.js";
import { broadcastAdmins, sendToStation } from "./hub.js";
import { logEvent } from "./telemetry.js";

export async function registerCustomerRoutes(app: FastifyInstance) {
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
    if (!(await staffWriteGuard(req, reply))) return;
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
    if (!(await staffWriteGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = z
      .object({
        name: z.string().min(2).optional(),
        phone: z.string().optional(),
        level: z.enum(["bronze", "prata", "ouro"]).optional(),
        notes: z.string().optional(),
        consent: z.boolean().optional(),
        reviewAskOptOut: z.boolean().optional(),
      })
      .parse(req.body);
    const updated = updateCustomer(id, body);
    if (!updated) return reply.code(404).send({ error: "Não encontrado" });
    return updated;
  });

  app.post("/api/customers/:id/password-reset", async (req, reply) => {
    if (!(await staffWriteGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    try {
      const { adminIssuePasswordReset } = await import("./customer-auth.js");
      return adminIssuePasswordReset(id);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  /** Pedir avaliação Google via WhatsApp (Evolution ou devolve wa.me). */
  app.post("/api/customers/:id/ask-google-review", async (req, reply) => {
    if (!(await staffWriteGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = z.object({ force: z.boolean().optional() }).parse(req.body || {});
    const customer = getCustomer(id);
    if (!customer) return reply.code(404).send({ error: "Não encontrado" });
    try {
      const wa = await import("./whatsapp.js");
      return wa.askGoogleReviewWhatsApp({ customerId: id, force: body.force !== false });
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.delete("/api/customers/:id", async (req, reply) => {
    if (!(await ownerWriteGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    if (!deleteCustomer(id)) return reply.code(404).send({ error: "Não encontrado" });
    return { ok: true };
  });

  app.post("/api/face/preview", async (req, reply) => {
    if (!(await staffWriteGuard(req, reply))) return;
    const body = z.object({ imageBase64: z.string().min(32) }).parse(req.body);
    const embedded = await extractEmbedding(body.imageBase64);
    return facePreviewFromEmbed(embedded);
  });

  app.post("/api/customers/:id/enroll", async (req, reply) => {
    if (!(await staffWriteGuard(req, reply))) return;
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
    if (!(await staffWriteGuard(req, reply))) return;
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

  app.post("/api/customers/:id/lgpd/revoke-biometrics", async (req, reply) => {
    if (!(await ownerWriteGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    const { revokeBiometrics } = await import("./lgpd.js");
    const result = revokeBiometrics(id);
    if (!result) return reply.code(404).send({ error: "Não encontrado" });
    return result;
  });

  app.post("/api/customers/:id/points", async (req, reply) => {
    const station = stationFromHeader(req);
    const isStation = Boolean(station);
    if (!isStation && !(await staffWriteGuard(req, reply))) return;
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
    if (!(await staffWriteGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = z
      .object({
        hours: z.number().positive().optional(),
        amountReais: z.number().positive().optional(),
      })
      .parse(req.body);
    try {
      const result = sellTime({ customerId: id, hours: body.hours, amountReais: body.amountReais });
      logEvent({
        level: "info",
        source: "caixa",
        kind: "time.sale",
        message: `Venda de horas para ${id}`,
        meta: {
          customerId: id,
          hours: body.hours ?? null,
          amountReais: body.amountReais ?? result.amountReais ?? null,
          actor: actorLabel(req),
        },
      });
      broadcastAdmins({ type: "time_updated", customer: result.customer });
      return { ok: true, ...result };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.post("/api/customers/:id/time/adjust", async (req, reply) => {
    if (!(await staffWriteGuard(req, reply))) return;
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
    if (!(await staffWriteGuard(req, reply))) return;
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
      logEvent({
        level: "info",
        source: "caixa",
        kind: "subscription",
        message: `Assinatura ${body.status} — cliente ${id}`,
        meta: { customerId: id, status: body.status, actor: actorLabel(req) },
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
    if (!(await ownerWriteGuard(req, reply))) return;
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
    if (!(await ownerWriteGuard(req, reply))) return;
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
    if (!(await ownerWriteGuard(req, reply))) return;
    const { id } = req.params as { id: string };
    if (!deleteReward(id)) return reply.code(404).send({ error: "Não encontrado" });
    return { ok: true };
  });

  app.post("/api/customers/:id/redeem", async (req, reply) => {
    const station = stationFromHeader(req);
    if (!station && !(await staffWriteGuard(req, reply))) return;
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
}
