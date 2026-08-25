import { describe, expect, it } from "vitest";
import { cosineSimilarity, matchEmbeddingLocal } from "../src/face-client.js";

describe("matchEmbeddingLocal", () => {
  it("cosine idêntico ~1", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeGreaterThan(0.99);
  });

  it("retorna match acima do limiar", () => {
    const query = [1, 0, 0, 0];
    const gallery = [
      { id: "e1", customer_id: "c1", embedding: [0.99, 0.01, 0, 0] },
      { id: "e2", customer_id: "c2", embedding: [0, 1, 0, 0] },
    ];
    const res = matchEmbeddingLocal(query, gallery, 0.5);
    expect(res.ok).toBe(true);
    expect(res.match?.customer_id).toBe("c1");
  });

  it("abaixo do limiar → null", () => {
    const res = matchEmbeddingLocal([1, 0], [{ id: "e1", customer_id: "c1", embedding: [0, 1] }], 0.9);
    expect(res.match).toBeNull();
    expect(res.reason).toBe("below_threshold");
  });

  it("ambíguo → null", () => {
    const query = [1, 0];
    const gallery = [
      { id: "e1", customer_id: "c1", embedding: [0.95, 0.05] },
      { id: "e2", customer_id: "c2", embedding: [0.94, 0.06] },
    ];
    const res = matchEmbeddingLocal(query, gallery, 0.5, 0.05);
    expect(res.match).toBeNull();
    expect(res.reason).toBe("ambiguous");
  });
});
