import { config } from "./config.js";

export type EmbedResponse = {
  ok: boolean;
  embedding?: number[];
  faces?: number;
  error?: string;
  code?: string;
  quality?: number;
  blur?: number;
  face_ratio?: number;
  rotation_used?: number;
  face_box?: { x: number; y: number; w: number; h: number };
};

export type MatchCandidate = {
  id: string;
  customer_id: string;
  embedding: number[];
};

export type MatchResponse = {
  ok: boolean;
  match: null | { id: string; customer_id: string; score: number };
  best_score?: number | null;
  best_customer_id?: string | null;
  second_score?: number | null;
  reason?: string;
  error?: string;
  code?: string;
};

const SERVICE_DOWN = {
  ok: false as const,
  error: "Serviço facial indisponível",
  code: "service_down",
};

const DEFAULT_MARGIN = 0.05;

function faceHeaders(json = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (json) headers["content-type"] = "application/json";
  if (config.faceServiceToken) {
    headers.authorization = `Bearer ${config.faceServiceToken}`;
  }
  return headers;
}

export async function faceHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${config.faceServiceUrl}/health`, {
      headers: faceHeaders(),
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function extractEmbedding(imageBase64: string): Promise<EmbedResponse> {
  try {
    const res = await fetch(`${config.faceServiceUrl}/embed`, {
      method: "POST",
      headers: faceHeaders(true),
      body: JSON.stringify({ image_base64: imageBase64 }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await res.json().catch(() => ({}))) as EmbedResponse;
    if (!res.ok) {
      return { ok: false, error: data.error || `face-service HTTP ${res.status}`, code: data.code };
    }
    return data;
  } catch {
    return SERVICE_DOWN;
  }
}

/** Cosine similarity — match local na API (evita mandar a galeria ao face-service). */
export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb) + 1e-8;
  return dot / denom;
}

export function matchEmbeddingLocal(
  embedding: number[],
  gallery: MatchCandidate[],
  threshold: number,
  margin = DEFAULT_MARGIN,
): MatchResponse {
  const bestByCustomer = new Map<string, { id: string; customer_id: string; score: number }>();
  for (const item of gallery) {
    const score = cosineSimilarity(embedding, item.embedding);
    const prev = bestByCustomer.get(item.customer_id);
    if (!prev || score > prev.score) {
      bestByCustomer.set(item.customer_id, {
        id: item.id,
        customer_id: item.customer_id,
        score,
      });
    }
  }

  const ranked = [...bestByCustomer.values()].sort((a, b) => b.score - a.score);
  if (ranked.length === 0) {
    return { ok: true, match: null, best_score: null, second_score: null };
  }

  const best = ranked[0];
  const secondScore = ranked.length > 1 ? ranked[1].score : null;
  const bestScore = best.score;

  if (bestScore < threshold) {
    return {
      ok: true,
      match: null,
      best_score: bestScore,
      best_customer_id: best.customer_id,
      second_score: secondScore,
      reason: "below_threshold",
    };
  }

  if (secondScore !== null && bestScore - secondScore < margin) {
    return {
      ok: true,
      match: null,
      best_score: bestScore,
      best_customer_id: best.customer_id,
      second_score: secondScore,
      reason: "ambiguous",
    };
  }

  return {
    ok: true,
    match: { id: best.id, customer_id: best.customer_id, score: bestScore },
    best_score: bestScore,
    second_score: secondScore,
  };
}

/** Match local por padrão (rápido). FACE_MATCH_REMOTE=1 usa /match no face-service. */
export async function matchEmbedding(
  embedding: number[],
  gallery: MatchCandidate[],
  threshold: number,
): Promise<MatchResponse> {
  if (process.env.FACE_MATCH_REMOTE !== "1") {
    return matchEmbeddingLocal(embedding, gallery, threshold);
  }

  try {
    const res = await fetch(`${config.faceServiceUrl}/match`, {
      method: "POST",
      headers: faceHeaders(true),
      body: JSON.stringify({ embedding, gallery, threshold, margin: DEFAULT_MARGIN }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => ({}))) as MatchResponse;
    if (!res.ok) {
      return {
        ok: false,
        match: null,
        error: data.error || `face-service HTTP ${res.status}`,
        code: data.code,
      };
    }
    return {
      ok: true,
      match: data.match ?? null,
      best_score: data.best_score ?? null,
      best_customer_id: data.best_customer_id ?? null,
      second_score: data.second_score ?? null,
      reason: data.reason,
    };
  } catch {
    return { ok: false, match: null, error: SERVICE_DOWN.error, code: "service_down" };
  }
}

export function parseGalleryEmbeddings(
  rows: Array<{ id: string; customer_id: string; embedding: string }>,
): MatchCandidate[] {
  const gallery: MatchCandidate[] = [];
  for (const row of rows) {
    try {
      const embedding = JSON.parse(row.embedding) as number[];
      if (!Array.isArray(embedding) || embedding.length < 2) continue;
      gallery.push({ id: row.id, customer_id: row.customer_id, embedding });
    } catch {
      /* embedding corrompido — ignora */
    }
  }
  return gallery;
}
