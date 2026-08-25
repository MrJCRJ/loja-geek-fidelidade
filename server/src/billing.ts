import { nanoid } from "nanoid";
import { getCustomer, getSetting } from "./customers.js";
import { getDb } from "./db.js";

export type TimeLedgerReason = "sale" | "session_consume" | "adjust" | "subscription_bonus";

export function getHourPriceReais(): number {
  return Number(getSetting("hour_price_reais", "10")) || 10;
}

export function getSubscriberDiscountPct(): number {
  const n = Number(getSetting("subscriber_hour_discount_pct", "20"));
  return Math.min(90, Math.max(0, Number.isFinite(n) ? n : 20));
}

export function isSubscriberActive(customer: {
  subscription_status?: string | null;
  subscription_expires_at?: string | null;
}): boolean {
  if (customer.subscription_status !== "active") return false;
  if (!customer.subscription_expires_at) return true;
  return Date.parse(customer.subscription_expires_at) > Date.now();
}

/** Preço efetivo da hora (assinante com desconto). */
export function effectiveHourPrice(customerId: string): number {
  const customer = getCustomer(customerId) as
    | {
        subscription_status?: string;
        subscription_expires_at?: string | null;
      }
    | undefined;
  const base = getHourPriceReais();
  if (!customer || !isSubscriberActive(customer)) return base;
  const discount = getSubscriberDiscountPct() / 100;
  return Math.max(0.01, base * (1 - discount));
}

export function getTimeBalance(customerId: string): number {
  const row = getDb()
    .prepare("SELECT time_balance_seconds FROM customers WHERE id = ?")
    .get(customerId) as { time_balance_seconds?: number } | undefined;
  return Math.max(0, Number(row?.time_balance_seconds ?? 0));
}

function writeLedger(input: {
  customerId: string;
  deltaSeconds: number;
  amountReais?: number;
  reason: TimeLedgerReason;
  meta?: Record<string, unknown>;
}) {
  const id = nanoid();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO time_ledger (id, customer_id, delta_seconds, amount_reais, reason, meta, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.customerId,
      input.deltaSeconds,
      input.amountReais ?? 0,
      input.reason,
      input.meta ? JSON.stringify(input.meta) : null,
      now,
    );
  return id;
}

export function sellTime(input: {
  customerId: string;
  hours?: number;
  amountReais?: number;
}): { customer: unknown; creditedSeconds: number; amountReais: number; hourPrice: number } {
  const customer = getCustomer(input.customerId);
  if (!customer) throw new Error("Cliente não encontrado");

  const hourPrice = effectiveHourPrice(input.customerId);
  let amountReais = 0;
  let creditedSeconds = 0;

  if (input.hours != null && input.hours > 0) {
    creditedSeconds = Math.round(input.hours * 3600);
    amountReais = Math.round((creditedSeconds / 3600) * hourPrice * 100) / 100;
  } else if (input.amountReais != null && input.amountReais > 0) {
    amountReais = input.amountReais;
    creditedSeconds = Math.round((amountReais / hourPrice) * 3600);
  } else {
    throw new Error("Informe hours ou amountReais");
  }

  if (creditedSeconds <= 0) throw new Error("Crédito inválido");

  const db = getDb();
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE customers SET time_balance_seconds = time_balance_seconds + ?, updated_at = ? WHERE id = ?`,
    ).run(creditedSeconds, now, input.customerId);
    writeLedger({
      customerId: input.customerId,
      deltaSeconds: creditedSeconds,
      amountReais,
      reason: "sale",
      meta: { hourPrice, hours: creditedSeconds / 3600 },
    });
  });
  tx();

  return {
    customer: getCustomer(input.customerId),
    creditedSeconds,
    amountReais,
    hourPrice,
  };
}

export function adjustTime(input: {
  customerId: string;
  deltaSeconds: number;
  note?: string;
}): { customer: unknown } {
  const customer = getCustomer(input.customerId);
  if (!customer) throw new Error("Cliente não encontrado");
  const delta = Math.trunc(input.deltaSeconds);
  if (delta === 0) throw new Error("deltaSeconds não pode ser 0");

  const db = getDb();
  const now = new Date().toISOString();
  const current = getTimeBalance(input.customerId);
  const next = Math.max(0, current + delta);
  const applied = next - current;

  const tx = db.transaction(() => {
    db.prepare(`UPDATE customers SET time_balance_seconds = ?, updated_at = ? WHERE id = ?`).run(
      next,
      now,
      input.customerId,
    );
    writeLedger({
      customerId: input.customerId,
      deltaSeconds: applied,
      amountReais: 0,
      reason: "adjust",
      meta: { note: input.note || null, requested: delta },
    });
  });
  tx();

  return { customer: getCustomer(input.customerId) };
}

/**
 * Debita segundos do saldo. Retorna saldo restante e se zeroxou.
 */
export function consumeTime(
  customerId: string,
  deltaSeconds: number,
  meta?: Record<string, unknown>,
): { balance: number; depleted: boolean; consumed: number } {
  const delta = Math.max(0, Math.trunc(deltaSeconds));
  if (delta === 0) {
    return { balance: getTimeBalance(customerId), depleted: false, consumed: 0 };
  }

  const db = getDb();
  const now = new Date().toISOString();
  let consumed = 0;
  let balance = 0;

  const tx = db.transaction(() => {
    const row = db
      .prepare("SELECT time_balance_seconds FROM customers WHERE id = ?")
      .get(customerId) as { time_balance_seconds: number } | undefined;
    if (!row) throw new Error("Cliente não encontrado");
    const current = Math.max(0, Number(row.time_balance_seconds) || 0);
    consumed = Math.min(current, delta);
    balance = current - consumed;
    db.prepare(`UPDATE customers SET time_balance_seconds = ?, updated_at = ? WHERE id = ?`).run(
      balance,
      now,
      customerId,
    );
    if (consumed > 0) {
      writeLedger({
        customerId,
        deltaSeconds: -consumed,
        amountReais: 0,
        reason: "session_consume",
        meta,
      });
    }
  });
  tx();

  return { balance, depleted: balance <= 0, consumed };
}

export function setSubscription(input: {
  customerId: string;
  status: "none" | "active" | "paused";
  months?: number;
  priceReais?: number;
  notes?: string;
}): { customer: unknown; subscription: unknown | null } {
  const customer = getCustomer(input.customerId) as
    | { subscriber_since?: string | null }
    | undefined;
  if (!customer) throw new Error("Cliente não encontrado");

  const db = getDb();
  const now = new Date();
  const nowIso = now.toISOString();
  let expiresAt: string | null = null;
  let subscriptionRow: unknown = null;

  if (input.status === "active") {
    const months = Math.max(1, Math.min(36, input.months ?? 1));
    const exp = new Date(now);
    exp.setMonth(exp.getMonth() + months);
    expiresAt = exp.toISOString();
  }

  const tx = db.transaction(() => {
    const since =
      input.status === "active"
        ? (customer.subscriber_since as string) || nowIso
        : customer.subscriber_since || null;

    db.prepare(
      `UPDATE customers SET
        subscription_status = ?,
        subscription_expires_at = ?,
        subscriber_since = ?,
        updated_at = ?
       WHERE id = ?`,
    ).run(input.status, expiresAt, input.status === "none" ? null : since, nowIso, input.customerId);

    if (input.status === "active") {
      const id = nanoid();
      db.prepare(
        `INSERT INTO subscriptions
          (id, customer_id, plan_code, price_reais, status, started_at, expires_at, notes, created_at)
         VALUES (?, ?, 'monthly', ?, 'active', ?, ?, ?, ?)`,
      ).run(
        id,
        input.customerId,
        input.priceReais ?? 0,
        nowIso,
        expiresAt,
        input.notes?.trim() || null,
        nowIso,
      );
      subscriptionRow = db.prepare("SELECT * FROM subscriptions WHERE id = ?").get(id);
    }
  });
  tx();

  return { customer: getCustomer(input.customerId), subscription: subscriptionRow };
}

export function listTimeLedger(customerId: string, limit = 30) {
  return getDb()
    .prepare(
      `SELECT * FROM time_ledger WHERE customer_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .all(customerId, limit);
}

export function getCustomerTimeSummary(customerId: string) {
  const customer = getCustomer(customerId) as
    | {
        id: string;
        time_balance_seconds?: number;
        subscription_status?: string;
        subscription_expires_at?: string | null;
        subscriber_since?: string | null;
      }
    | undefined;
  if (!customer) return null;
  const balance = Math.max(0, Number(customer.time_balance_seconds ?? 0));
  return {
    customerId,
    timeBalanceSeconds: balance,
    timeBalanceHours: Math.round((balance / 3600) * 100) / 100,
    hourPrice: effectiveHourPrice(customerId),
    baseHourPrice: getHourPriceReais(),
    subscriberDiscountPct: getSubscriberDiscountPct(),
    isSubscriber: isSubscriberActive(customer),
    subscriptionStatus: customer.subscription_status || "none",
    subscriptionExpiresAt: customer.subscription_expires_at || null,
    subscriberSince: customer.subscriber_since || null,
    ledger: listTimeLedger(customerId, 30),
  };
}
