import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { nanoid } from "nanoid";
import { config } from "./config.js";
import { getDb } from "./db.js";
import { getCustomer } from "./customers.js";
import {
  effectiveHourPrice,
  getHourPriceReais,
  getSubscriberDiscountPct,
  isSubscriberActive,
  sellTime,
  setSubscription,
} from "./billing.js";

const MAX_FACE_SAMPLES = 5;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function getCustomerByEmail(email: string) {
  return getDb()
    .prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM face_embeddings f WHERE f.customer_id = c.id) AS face_samples
       FROM customers c WHERE lower(c.email) = ?`,
    )
    .get(normalizeEmail(email));
}

export function countFaceSamples(customerId: string): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS c FROM face_embeddings WHERE customer_id = ?")
    .get(customerId) as { c: number };
  return Number(row?.c || 0);
}

export async function registerPortalCustomer(input: {
  name: string;
  email: string;
  password: string;
  phone?: string;
  consent: boolean;
}) {
  if (!input.consent) throw new Error("Consentimento LGPD é obrigatório");
  const email = normalizeEmail(input.email);
  if (!email.includes("@")) throw new Error("E-mail inválido");
  if (input.password.length < 6) throw new Error("Senha deve ter ao menos 6 caracteres");

  const existing = getCustomerByEmail(email) as { id: string } | undefined;
  if (existing) throw new Error("E-mail já cadastrado");

  const id = nanoid();
  const now = new Date().toISOString();
  const passwordHash = await bcrypt.hash(input.password, 10);

  getDb()
    .prepare(
      `INSERT INTO customers
        (id, name, phone, level, points, consent_at, notes, created_at, updated_at,
         email, password_hash, time_balance_seconds, subscription_status)
       VALUES (?, ?, ?, 'bronze', 0, ?, NULL, ?, ?, ?, ?, 0, 'none')`,
    )
    .run(
      id,
      input.name.trim(),
      input.phone?.trim() || null,
      now,
      now,
      now,
      email,
      passwordHash,
    );

  return getCustomer(id);
}

export async function loginPortalCustomer(email: string, password: string) {
  const customer = getCustomerByEmail(email) as
    | { id: string; password_hash?: string | null }
    | undefined;
  if (!customer?.password_hash) throw new Error("E-mail ou senha inválidos");
  const ok = await bcrypt.compare(password, customer.password_hash);
  if (!ok) throw new Error("E-mail ou senha inválidos");
  return getCustomer(customer.id);
}

export async function updatePortalProfile(
  customerId: string,
  input: {
    name?: string;
    phone?: string | null;
    password?: string;
    currentPassword?: string;
  },
) {
  const customer = getCustomer(customerId) as
    | { id: string; name: string; phone?: string | null; password_hash?: string | null }
    | undefined;
  if (!customer) throw new Error("Cliente não encontrado");

  const name = input.name !== undefined ? input.name.trim() : customer.name;
  if (!name || name.length < 2) throw new Error("Nome deve ter ao menos 2 caracteres");

  const phone =
    input.phone !== undefined ? (input.phone?.trim() || null) : (customer.phone ?? null);

  let passwordHash = customer.password_hash || null;
  if (input.password) {
    if (input.password.length < 6) throw new Error("Nova senha deve ter ao menos 6 caracteres");
    if (!input.currentPassword) throw new Error("Informe a senha atual para trocar a senha");
    if (!customer.password_hash) throw new Error("Conta sem senha — fale na loja");
    const ok = await bcrypt.compare(input.currentPassword, customer.password_hash);
    if (!ok) throw new Error("Senha atual incorreta");
    passwordHash = await bcrypt.hash(input.password, 10);
  }

  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE customers SET name = ?, phone = ?, password_hash = COALESCE(?, password_hash), updated_at = ?
       WHERE id = ?`,
    )
    .run(name, phone, passwordHash, now, customerId);

  return publicCustomerProfile(customerId);
}

export function publicCustomerProfile(customerId: string) {
  const customer = getCustomer(customerId) as
    | {
        id: string;
        name: string;
        email?: string | null;
        phone?: string | null;
        level: string;
        points: number;
        consent_at?: string | null;
        time_balance_seconds?: number;
        subscription_status?: string;
        subscription_expires_at?: string | null;
        face_samples?: number;
        created_at?: string;
      }
    | undefined;
  if (!customer) return null;

  const balance = Math.max(0, Number(customer.time_balance_seconds ?? 0));
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email || null,
    phone: customer.phone || null,
    level: customer.level,
    points: customer.points,
    consentAt: customer.consent_at || null,
    timeBalanceSeconds: balance,
    timeBalanceHours: Math.round((balance / 3600) * 100) / 100,
    faceSamples: Number(customer.face_samples ?? countFaceSamples(customer.id)),
    maxFaceSamples: MAX_FACE_SAMPLES,
    subscriptionStatus: customer.subscription_status || "none",
    subscriptionExpiresAt: customer.subscription_expires_at || null,
    isSubscriber: isSubscriberActive(customer),
    hourPrice: effectiveHourPrice(customer.id),
    baseHourPrice: getHourPriceReais(),
    subscriberDiscountPct: getSubscriberDiscountPct(),
    createdAt: customer.created_at || null,
  };
}

export function createWebOrder(input: {
  customerId: string;
  kind: "hours" | "subscription";
  amountReais: number;
  hours?: number | null;
  months?: number | null;
  status: "pending" | "paid" | "failed";
  provider?: string;
  providerRef?: string | null;
}) {
  const id = nanoid();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO web_orders
        (id, customer_id, kind, amount_reais, hours, months, status, provider, provider_ref, created_at, paid_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.customerId,
      input.kind,
      input.amountReais,
      input.hours ?? null,
      input.months ?? null,
      input.status,
      input.provider || "stub",
      input.providerRef || null,
      now,
      input.status === "paid" ? now : null,
    );
  return getDb().prepare("SELECT * FROM web_orders WHERE id = ?").get(id);
}

export function checkoutHoursStub(customerId: string, input: { hours?: number; amountReais?: number }) {
  const sale = sellTime({
    customerId,
    hours: input.hours,
    amountReais: input.amountReais,
  });
  const order = createWebOrder({
    customerId,
    kind: "hours",
    amountReais: sale.amountReais,
    hours: sale.creditedSeconds / 3600,
    status: "paid",
    provider: "stub",
    providerRef: `stub_hours_${Date.now()}`,
  });
  return { ...sale, order, customer: publicCustomerProfile(customerId) };
}

export function checkoutSubscriptionStub(
  customerId: string,
  input: { months?: number; priceReais?: number },
) {
  const months = Math.max(1, Math.min(36, input.months ?? 1));
  const price = input.priceReais ?? 49.9;
  const sub = setSubscription({
    customerId,
    status: "active",
    months,
    priceReais: price,
    notes: "Assinatura portal (stub)",
  });
  const order = createWebOrder({
    customerId,
    kind: "subscription",
    amountReais: price * months,
    months,
    status: "paid",
    provider: "stub",
    providerRef: `stub_sub_${Date.now()}`,
  });
  return {
    ...sub,
    order,
    customer: publicCustomerProfile(customerId),
  };
}

export function canEnrollMore(customerId: string) {
  return countFaceSamples(customerId) < MAX_FACE_SAMPLES;
}

function hashResetToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function createResetTokenRow(customerId: string, createdBy: "portal" | "admin") {
  const token = randomBytes(24).toString("hex");
  const id = nanoid();
  const now = new Date();
  const expires = new Date(now.getTime() + 60 * 60 * 1000); // 1h
  getDb()
    .prepare(
      `INSERT INTO password_reset_tokens (id, customer_id, token_hash, expires_at, used_at, created_at, created_by)
       VALUES (?, ?, ?, ?, NULL, ?, ?)`,
    )
    .run(id, customerId, hashResetToken(token), expires.toISOString(), now.toISOString(), createdBy);
  return { token, expiresAt: expires.toISOString(), id };
}

/** Pedido pelo portal: nunca revela se o e-mail existe (exceto em dev sem STRICT). */
export async function requestPortalPasswordReset(email: string) {
  const customer = getCustomerByEmail(email) as { id: string; email?: string } | undefined;
  const generic = {
    ok: true as const,
    tip: "Se o e-mail existir, peça o código no balcão da Geeks ou use o link de redefinição. O código vale 1 hora.",
  };
  if (!customer) return generic;

  const { token, expiresAt } = createResetTokenRow(customer.id, "portal");
  if (config.strictSecrets) {
    return generic;
  }
  // Dev: devolve o token para testar sem e-mail/SMTP
  return { ...generic, resetToken: token, expiresAt };
}

/** Balcão / GeekCentral: gera código e devolve em claro (mostrar uma vez). */
export function adminIssuePasswordReset(customerId: string) {
  const customer = getCustomer(customerId);
  if (!customer) throw new Error("Cliente não encontrado");
  const row = customer as { email?: string | null; password_hash?: string | null };
  if (!row.email) throw new Error("Cliente sem e-mail de portal — cadastre e-mail primeiro");
  const { token, expiresAt } = createResetTokenRow(customerId, "admin");
  return {
    ok: true as const,
    resetToken: token,
    expiresAt,
    tip: "Passe este código ao cliente (vale 1h). Ele redefine em /reset no portal.",
  };
}

export async function resetPasswordWithToken(token: string, newPassword: string) {
  if (!token || token.length < 16) throw new Error("Código inválido");
  if (newPassword.length < 6) throw new Error("Senha deve ter ao menos 6 caracteres");

  const hash = hashResetToken(token);
  const row = getDb()
    .prepare(
      `SELECT * FROM password_reset_tokens WHERE token_hash = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .get(hash) as
    | { id: string; customer_id: string; expires_at: string; used_at: string | null }
    | undefined;

  if (!row) throw new Error("Código inválido ou expirado");
  if (row.used_at) throw new Error("Código já utilizado");
  if (Date.parse(row.expires_at) < Date.now()) throw new Error("Código expirado — peça outro no balcão");

  const passwordHash = await bcrypt.hash(newPassword, 10);
  const now = new Date().toISOString();
  const tx = getDb().transaction(() => {
    getDb()
      .prepare(`UPDATE customers SET password_hash = ?, updated_at = ? WHERE id = ?`)
      .run(passwordHash, now, row.customer_id);
    getDb().prepare(`UPDATE password_reset_tokens SET used_at = ? WHERE id = ?`).run(now, row.id);
  });
  tx();

  return { ok: true as const, tip: "Senha atualizada — entre com o e-mail e a nova senha." };
}

export { MAX_FACE_SAMPLES };
