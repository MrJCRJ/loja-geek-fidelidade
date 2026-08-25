import type { extractEmbedding } from "./face-client.js";

type EmbedResult = Awaited<ReturnType<typeof extractEmbedding>>;

function faceQualityTip(code: string) {
  if (code === "face_too_small") return "Aproxime o rosto da câmera.";
  if (code === "face_blurry") return "Segure firme e melhore a iluminação.";
  if (code === "low_quality") return "Melhore a luz, aproxime o rosto e capture de novo.";
  if (code === "no_face") return "Centralize o rosto no oval.";
  return "Centralize o rosto e tente de novo.";
}

export function facePreviewFromEmbed(embedded: EmbedResult) {
  const code = embedded.code || "no_face";
  if (!embedded.ok || !embedded.embedding) {
    return {
      ok: false as const,
      code,
      tip: faceQualityTip(code),
      error: embedded.error || "Nenhum rosto detectado",
      quality: embedded.quality,
      blur: embedded.blur,
      face_ratio: embedded.face_ratio,
      rotation_used: embedded.rotation_used,
    };
  }
  if (embedded.quality !== undefined && embedded.quality < 0.25) {
    return {
      ok: false as const,
      code: "low_quality",
      tip: faceQualityTip("low_quality"),
      error: "Qualidade da amostra insuficiente",
      quality: embedded.quality,
      blur: embedded.blur,
      face_ratio: embedded.face_ratio,
      rotation_used: embedded.rotation_used,
    };
  }
  return {
    ok: true as const,
    code: "ready",
    tip: "Rosto detectado — ótimo!",
    quality: embedded.quality,
    blur: embedded.blur,
    face_ratio: embedded.face_ratio,
    rotation_used: embedded.rotation_used,
  };
}

export { faceQualityTip };
