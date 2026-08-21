import { nanoid } from "nanoid";
import { getDb, type CustomerLevel } from "./db.js";

export function listCustomers() {
  return getDb()
    .prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM face_embeddings f WHERE f.customer_id = c.id) AS face_samples
       FROM customers c
       ORDER BY c.name COLLATE NOCASE`,
    )
    .all();
}

export function getCustomer(id: string) {
  return getDb()
    .prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM face_embeddings f WHERE f.customer_id = c.id) AS face_samples
       FROM customers c WHERE c.id = ?`,
    )
    .get(id);
}

export function createCustomer(input: {
  name: string;
  phone?: string;
  level?: CustomerLevel;
  notes?: string;
  consent: boolean;
}) {
  const id = nanoid();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO customers (id, name, phone, level, points, consent_at, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.name.trim(),
      input.phone?.trim() || null,
      input.level || "bronze",
      input.consent ? now : null,
      input.notes?.trim() || null,
      now,
      now,
    );
  return getCustomer(id);
}

export function updateCustomer(
  id: string,
  input: Partial<{ name: string; phone: string; level: CustomerLevel; notes: string; consent: boolean }>,
) {
  const current = getCustomer(id) as Record<string, unknown> | undefined;
  if (!current) return null;
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE customers SET
        name = ?,
        phone = ?,
        level = ?,
        notes = ?,
        consent_at = ?,
        updated_at = ?
       WHERE id = ?`,
    )
    .run(
      input.name?.trim() ?? current.name,
      input.phone !== undefined ? input.phone.trim() || null : current.phone,
      input.level ?? current.level,
      input.notes !== undefined ? input.notes.trim() || null : current.notes,
      input.consent === true ? (current.consent_at || now) : input.consent === false ? null : current.consent_at,
      now,
      id,
    );
  return getCustomer(id);
}

export function deleteCustomer(id: string) {
  return getDb().prepare("DELETE FROM customers WHERE id = ?").run(id).changes > 0;
}

export function addFaceEmbedding(customerId: string, embedding: number[]) {
  const id = nanoid();
  const now = new Date().toISOString();
  getDb()
    .prepare("INSERT INTO face_embeddings (id, customer_id, embedding, created_at) VALUES (?, ?, ?, ?)")
    .run(id, customerId, JSON.stringify(embedding), now);
  return id;
}

export function listFaceEmbeddings() {
  return getDb()
    .prepare(
      `SELECT f.id, f.customer_id, f.embedding, c.name, c.level, c.points
       FROM face_embeddings f
       JOIN customers c ON c.id = f.customer_id
       WHERE c.consent_at IS NOT NULL`,
    )
    .all() as Array<{
    id: string;
    customer_id: string;
    embedding: string;
    name: string;
    level: string;
    points: number;
  }>;
}

export function adjustPoints(input: {
  customerId: string;
  delta: number;
  reason: string;
  stationId?: string;
  meta?: unknown;
}) {
  const db = getDb();
  const tx = db.transaction(() => {
    const customer = db.prepare("SELECT points FROM customers WHERE id = ?").get(input.customerId) as
      | { points: number }
      | undefined;
    if (!customer) throw new Error("Cliente não encontrado");
    const next = customer.points + input.delta;
    if (next < 0) throw new Error("Pontos insuficientes");
    const now = new Date().toISOString();
    db.prepare("UPDATE customers SET points = ?, updated_at = ? WHERE id = ?").run(
      next,
      now,
      input.customerId,
    );
    const ledgerId = nanoid();
    db.prepare(
      `INSERT INTO point_ledger (id, customer_id, delta, reason, station_id, meta, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      ledgerId,
      input.customerId,
      input.delta,
      input.reason,
      input.stationId || null,
      input.meta ? JSON.stringify(input.meta) : null,
      now,
    );
    return { points: next, ledgerId };
  });
  return tx();
}

export function listLedger(customerId?: string, limit = 50) {
  if (customerId) {
    return getDb()
      .prepare(
        `SELECT * FROM point_ledger WHERE customer_id = ? ORDER BY created_at DESC LIMIT ?`,
      )
      .all(customerId, limit);
  }
  return getDb()
    .prepare(`SELECT * FROM point_ledger ORDER BY created_at DESC LIMIT ?`)
    .all(limit);
}

export function listRewards(activeOnly = false) {
  if (activeOnly) {
    return getDb()
      .prepare("SELECT * FROM rewards WHERE active = 1 ORDER BY cost_points ASC")
      .all();
  }
  return getDb().prepare("SELECT * FROM rewards ORDER BY cost_points ASC").all();
}

export function createReward(input: { title: string; description?: string; costPoints: number }) {
  const id = nanoid();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      "INSERT INTO rewards (id, title, description, cost_points, active, created_at) VALUES (?, ?, ?, ?, 1, ?)",
    )
    .run(id, input.title.trim(), input.description?.trim() || null, input.costPoints, now);
  return getDb().prepare("SELECT * FROM rewards WHERE id = ?").get(id);
}

export function updateReward(
  id: string,
  input: Partial<{ title: string; description: string; costPoints: number; active: boolean }>,
) {
  const current = getDb().prepare("SELECT * FROM rewards WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!current) return null;
  getDb()
    .prepare(
      `UPDATE rewards SET title = ?, description = ?, cost_points = ?, active = ? WHERE id = ?`,
    )
    .run(
      input.title?.trim() ?? current.title,
      input.description !== undefined ? input.description.trim() || null : current.description,
      input.costPoints ?? current.cost_points,
      input.active === undefined ? current.active : input.active ? 1 : 0,
      id,
    );
  return getDb().prepare("SELECT * FROM rewards WHERE id = ?").get(id);
}

export function deleteReward(id: string) {
  return getDb().prepare("DELETE FROM rewards WHERE id = ?").run(id).changes > 0;
}

export function redeemReward(customerId: string, rewardId: string, stationId?: string) {
  const reward = getDb().prepare("SELECT * FROM rewards WHERE id = ? AND active = 1").get(rewardId) as
    | { id: string; title: string; cost_points: number }
    | undefined;
  if (!reward) throw new Error("Recompensa indisponível");
  const result = adjustPoints({
    customerId,
    delta: -reward.cost_points,
    reason: `Resgate: ${reward.title}`,
    stationId,
    meta: { rewardId: reward.id },
  });
  return { ...result, reward };
}

export function getSetting(key: string, fallback: string) {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? fallback;
}

export function setSetting(key: string, value: string) {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value);
}

export function addRecognitionEvent(input: {
  customerId?: string | null;
  stationId?: string | null;
  score: number;
  status: string;
}) {
  const id = nanoid();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO recognition_events (id, customer_id, station_id, score, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, input.customerId || null, input.stationId || null, input.score, input.status, now);
  return id;
}

export function listRecognitionEvents(limit = 40) {
  return getDb()
    .prepare(
      `SELECT e.*, c.name AS customer_name, c.level AS customer_level, s.name AS station_name
       FROM recognition_events e
       LEFT JOIN customers c ON c.id = e.customer_id
       LEFT JOIN stations s ON s.id = e.station_id
       ORDER BY e.created_at DESC
       LIMIT ?`,
    )
    .all(limit);
}
