import { config } from "./config.js";

export type EmbedResponse = {
  ok: boolean;
  embedding?: number[];
  faces?: number;
  error?: string;
};

export type MatchCandidate = {
  id: string;
  customer_id: string;
  embedding: number[];
};

export async function faceHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${config.faceServiceUrl}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function extractEmbedding(imageBase64: string): Promise<EmbedResponse> {
  const res = await fetch(`${config.faceServiceUrl}/embed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ image_base64: imageBase64 }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json()) as EmbedResponse;
  if (!res.ok) {
    return { ok: false, error: data.error || `face-service HTTP ${res.status}` };
  }
  return data;
}

export async function matchEmbedding(
  embedding: number[],
  gallery: MatchCandidate[],
  threshold: number,
): Promise<{
  ok: boolean;
  match: null | { id: string; customer_id: string; score: number };
  error?: string;
}> {
  const res = await fetch(`${config.faceServiceUrl}/match`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ embedding, gallery, threshold }),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json()) as {
    ok: boolean;
    match?: null | { id: string; customer_id: string; score: number };
    error?: string;
  };
  if (!res.ok) {
    return { ok: false, match: null, error: data.error || `face-service HTTP ${res.status}` };
  }
  return { ok: true, match: data.match ?? null };
}
