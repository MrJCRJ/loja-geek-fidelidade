import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { addFaceEmbedding, deleteCustomer, getCustomer, getSetting, setSetting } from "./customers.js";
import { getDb } from "./db.js";
import { extractEmbedding } from "./face-client.js";
import { facePreviewFromEmbed } from "./face-preview.js";

const USERNAME_RE = /^[a-z0-9._]{3,24}$/;
const PURGE_KEY = "credential_purge_v1";

export function normalizeLockUsername(raw: string) {
  return raw.trim().toLowerCase();
}

export function assertLockUsername(raw: string) {
  const username = normalizeLockUsername(raw);
  if (!USERNAME_RE.test(username)) {
    throw new Error("Usuário: 3 a 24 letras, números, ponto ou _");
  }
  return username;
}

export function getCustomerByUsername(username: string) {
  return getDb()
    .prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM face_embeddings f WHERE f.customer_id = c.id) AS face_samples
       FROM customers c WHERE c.username = ?`,
    )
    .get(normalizeLockUsername(username));
}

export async function registerLockCustomer(input: {
  name: string;
  username: string;
  password: string;
  imageBase64?: string;
}) {
  const name = input.name.trim();
  if (name.length < 2) throw new Error("Nome deve ter ao menos 2 caracteres");
  const username = assertLockUsername(input.username);
  if (input.password.length < 6) throw new Error("Senha deve ter ao menos 6 caracteres");
  if (getCustomerByUsername(username)) throw new Error("Usuário já cadastrado");

  let embedding: number[] | null = null;
  if (input.imageBase64) {
    const embedded = await extractEmbedding(input.imageBase64);
    const preview = facePreviewFromEmbed(embedded);
    if (!preview.ok || !embedded.embedding) {
      throw new Error(preview.error || embedded.error || "Não deu para gravar a face");
    }
    embedding = embedded.embedding;
  }

  const id = nanoid();
  const now = new Date().toISOString();
  const passwordHash = await bcrypt.hash(input.password, 10);
  getDb()
    .prepare(
      `INSERT INTO customers
        (id, name, phone, level, points, consent_at, notes, created_at, updated_at,
         username, password_hash, time_balance_seconds, subscription_status)
       VALUES (?, ?, NULL, 'bronze', 0, ?, NULL, ?, ?, ?, ?, 0, 'none')`,
    )
    .run(id, name, now, now, now, username, passwordHash);

  if (embedding) {
    try {
      addFaceEmbedding(id, embedding);
    } catch (err) {
      deleteCustomer(id);
      throw err;
    }
  }

  return getCustomer(id);
}

export async function loginLockCustomer(username: string, password: string) {
  const row = getCustomerByUsername(username) as
    | { id: string; password_hash?: string | null }
    | undefined;
  if (!row?.password_hash) throw new Error("Usuário ou senha inválidos");
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) throw new Error("Usuário ou senha inválidos");
  return getCustomer(row.id);
}

/** Apaga contas sem senha e sem face. Quem está numa sessão aberta fica. Roda uma vez por banco. */
export function purgeCustomersWithoutCredential() {
  if (getSetting(PURGE_KEY, "") === "done") return { removed: 0, skipped: true };
  const rows = getDb()
    .prepare(
      `SELECT c.id FROM customers c
       WHERE (c.password_hash IS NULL OR c.password_hash = '')
         AND NOT EXISTS (SELECT 1 FROM face_embeddings f WHERE f.customer_id = c.id)
         AND NOT EXISTS (
           SELECT 1 FROM machine_sessions s
           WHERE s.customer_id = c.id AND s.status = 'active'
         )`,
    )
    .all() as Array<{ id: string }>;
  let removed = 0;
  for (const row of rows) {
    try {
      if (deleteCustomer(row.id)) removed += 1;
    } catch {
      /* sessão de console ou outro vínculo: essa conta fica */
    }
  }
  setSetting(PURGE_KEY, "done");
  return { removed, skipped: false };
}
