import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  canEnrollMore,
  MAX_FACE_SAMPLES,
  publicCustomerProfile,
} from "./customer-auth.js";
import { addFaceEmbedding, clearFaceEmbeddings, getCustomer } from "./customers.js";
import { extractEmbedding } from "./face-client.js";
import { facePreviewFromEmbed, faceQualityTip } from "./face-preview.js";
import { portalCustomerGuard } from "./portal-guards.js";
import { rateLimit } from "./security.js";

async function clearPortalEnroll(
  customerId: string,
  reply: import("fastify").FastifyReply,
  ip: string,
) {
  if (!rateLimit(`enroll-clear:${customerId}:${ip}`, 10, 60_000)) {
    reply.code(429).send({ error: "Muitas tentativas — aguarde um minuto" });
    return null;
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
}

export async function registerPortalEnrollRoutes(app: FastifyInstance) {
  app.post("/api/portal/enroll/preview", async (req, reply) => {
    const customerId = await portalCustomerGuard(req, reply);
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
    const customerId = await portalCustomerGuard(req, reply);
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
    const customerId = await portalCustomerGuard(req, reply);
    if (!customerId) return;
    const ip = req.ip || "unknown";
    const result = await clearPortalEnroll(customerId, reply, ip);
    if (!result) return;
    return result;
  });

  /** Alias POST (alguns proxies/CORS bloqueiam DELETE). */
  app.post("/api/portal/enroll/reset", async (req, reply) => {
    const customerId = await portalCustomerGuard(req, reply);
    if (!customerId) return;
    const ip = req.ip || "unknown";
    const result = await clearPortalEnroll(customerId, reply, ip);
    if (!result) return;
    return result;
  });
}
