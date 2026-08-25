import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "./config.js";
import {
  addRecognitionEvent,
  getCustomer,
  getSetting,
  listFaceEmbeddings,
  listRecognitionEvents,
} from "./customers.js";
import { extractEmbedding, matchEmbedding, parseGalleryEmbeddings } from "./face-client.js";
import { adminGuard, stationFromHeader } from "./http-guards.js";
import { broadcastAdmins, sendToStation } from "./hub.js";
import { rateLimit } from "./security.js";
import { heartbeatStationById } from "./stations.js";
import { getTimeBalance } from "./billing.js";
import { logEvent } from "./telemetry.js";

export async function registerFaceRoutes(app: FastifyInstance) {
  app.get("/api/events/recognition", async (req, reply) => {
    if (!(await adminGuard(req, reply))) return;
    return listRecognitionEvents(50);
  });

  app.post("/api/presence", async (req, reply) => {
    const station = stationFromHeader(req);
    if (!station) return reply.code(401).send({ error: "Token de estação obrigatório" });
    heartbeatStationById(station.id, req.ip);

    const body = z
      .object({
        imageBase64: z.string().min(32),
        customerId: z.string().min(1).optional(),
      })
      .parse(req.body);
    const embedded = await extractEmbedding(body.imageBase64);
    if (!embedded.ok || !embedded.embedding) {
      if (embedded.code === "service_down") {
        return reply.code(503).send({
          present: false,
          reason: "service_down",
          code: "service_down",
          tip: "Serviço facial reiniciando — aguarde alguns segundos",
        });
      }
      const code = embedded.code || "no_face";
      const reason =
        code === "face_too_small" || code === "face_blurry" || code === "low_quality"
          ? "low_quality"
          : "no_face";
      return { present: false, reason, code };
    }

    // Sem customerId: só "há rosto" (compat). Com customerId: VIP da sessão ainda reconhecido.
    if (!body.customerId) {
      return { present: true, reason: "face", code: "ok" };
    }

    const galleryRaw = listFaceEmbeddings();
    const gallery = parseGalleryEmbeddings(galleryRaw);
    if (gallery.length === 0) {
      return { present: false, reason: "no_gallery", code: "no_gallery" };
    }

    const threshold = Number(getSetting("face_match_threshold", String(config.faceMatchThreshold)));
    const matched = await matchEmbedding(embedded.embedding, gallery, threshold);
    if (!matched.ok) {
      if (matched.code === "service_down") {
        return reply.code(503).send({
          present: false,
          reason: "service_down",
          code: "service_down",
          tip: "Serviço facial reiniciando — aguarde alguns segundos",
          error: matched.error,
        });
      }
      return reply.code(502).send({ error: matched.error || "Falha no match de presença" });
    }

    if (matched.match && matched.match.customer_id !== body.customerId) {
      return {
        present: false,
        reason: "other_vip",
        code: "other_vip",
        bestScore: matched.match.score,
        bestCustomerId: matched.match.customer_id,
      };
    }

    if (!matched.match) {
      return {
        present: false,
        reason: matched.reason === "ambiguous" ? "ambiguous" : "unknown",
        code: matched.reason === "ambiguous" ? "ambiguous" : "unknown",
        bestScore: matched.best_score ?? 0,
        bestCustomerId: matched.best_customer_id ?? null,
      };
    }

    return {
      present: true,
      reason: "face",
      code: "ok",
      score: matched.match.score,
    };
  });

  app.post("/api/recognize", async (req, reply) => {
    const station = stationFromHeader(req);
    if (!station) return reply.code(401).send({ error: "Token de estação obrigatório" });
    const ip = req.ip || "unknown";
    if (!rateLimit(`recognize:${station.id}:${ip}`, 120, 60_000)) {
      return reply.code(429).send({ error: "Muitas tentativas de reconhecimento" });
    }
    heartbeatStationById(station.id, req.ip);

    const body = z.object({ imageBase64: z.string().min(32) }).parse(req.body);
    const embedded = await extractEmbedding(body.imageBase64);
    if (!embedded.ok || !embedded.embedding) {
      if (embedded.code === "service_down") {
        logEvent({
          level: "error",
          source: "api",
          kind: "face.service_down",
          message: "Recognize: face-service indisponível",
          stationId: station.id as string,
        });
        return reply.code(503).send({
          matched: false,
          reason: "service_down",
          code: "service_down",
          tip: "Serviço facial reiniciando — aguarde alguns segundos",
          error: embedded.error,
        });
      }
      const code = embedded.code || "no_face";
      const reason =
        code === "face_too_small" || code === "face_blurry" || code === "low_quality"
          ? "low_quality"
          : "no_face";
      const tip =
        code === "face_too_small"
          ? "Aproxime o rosto da câmera"
          : code === "face_blurry"
            ? "Imagem borrada — melhore a luz e segure firme"
            : "Posicione o rosto no centro do oval";
      return { matched: false, reason, tip, code, error: embedded.error };
    }

    const galleryRaw = listFaceEmbeddings();
    if (galleryRaw.length === 0) {
      return {
        matched: false,
        reason: "no_gallery",
        tip: "Nenhum VIP com enroll facial. Cadastre amostras no GeekCentral.",
      };
    }

    const gallery = parseGalleryEmbeddings(galleryRaw);
    if (gallery.length === 0) {
      return {
        matched: false,
        reason: "no_gallery",
        tip: "Nenhum VIP com enroll facial válido. Cadastre amostras no GeekCentral.",
      };
    }

    const threshold = Number(getSetting("face_match_threshold", String(config.faceMatchThreshold)));
    const matched = await matchEmbedding(embedded.embedding, gallery, threshold);
    if (!matched.ok) {
      if (matched.code === "service_down") {
        return reply.code(503).send({
          matched: false,
          reason: "service_down",
          code: "service_down",
          tip: "Serviço facial reiniciando — aguarde alguns segundos",
          error: matched.error,
        });
      }
      return reply.code(502).send({ error: matched.error || "Falha no match" });
    }

    if (!matched.match) {
      const bestScore = matched.best_score ?? 0;
      addRecognitionEvent({
        customerId: matched.best_customer_id || null,
        stationId: station.id,
        score: bestScore,
        status: "unknown",
      });
      const tip =
        matched.reason === "ambiguous"
          ? "Match ambíguo — refaça o enroll com mais ângulos"
          : bestScore > 0
            ? `Score baixo: ${(bestScore * 100).toFixed(0)}% — aproxime o rosto ou ajuste o limiar`
            : "Não reconhecido — faça enroll no GeekCentral";
      return {
        matched: false,
        reason: matched.reason === "ambiguous" ? "ambiguous" : "unknown",
        bestScore,
        bestCustomerId: matched.best_customer_id ?? null,
        tip,
      };
    }

    const customer = getCustomer(matched.match.customer_id);
    addRecognitionEvent({
      customerId: matched.match.customer_id,
      stationId: station.id,
      score: matched.match.score,
      status: "matched",
    });

    const payload = {
      type: "vip_detected",
      station: { id: station.id, name: station.name },
      customer,
      score: matched.match.score,
      at: new Date().toISOString(),
    };
    broadcastAdmins(payload);
    sendToStation(station.id, payload);

    return {
      matched: true,
      score: matched.match.score,
      customer,
      tip: `VIP reconhecido (${(matched.match.score * 100).toFixed(0)}%)`,
      timeBalanceSeconds: getTimeBalance(matched.match.customer_id),
    };
  });
}
