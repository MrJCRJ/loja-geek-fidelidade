import { nanoid } from "nanoid";
import { effectiveHourPrice, getTimeBalance } from "./billing.js";
import { getCustomer } from "./customers.js";
import { getDb } from "./db.js";
import { logEvent } from "./telemetry.js";
import { sendWhatsAppText } from "./whatsapp.js";

const MIN_SECONDS = 5 * 60;

export const CONSOLE_ROSTER = [
  { id: "console_ps4_1", name: "PS4-1", sort: 1 },
  { id: "console_ps4_2", name: "PS4-2", sort: 2 },
  { id: "console_switch", name: "Switch", sort: 3 },
  { id: "console_ps5", name: "PS5", sort: 4 },
] as const;

type SessionStatus = "active" | "expired" | "closed";
type SessionMode = "sale" | "balance" | "open";

type SessionRow = {
  id: string;
  console_id: string;
  customer_id: string;
  mode: SessionMode;
  started_at: string;
  ends_at: string | null;
  granted_seconds: number;
  status: SessionStatus;
  ended_at: string | null;
  whatsapp_sent_at: string | null;
  created_at: string;
};

export function ensureConsoles() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS consoles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS console_sessions (
      id TEXT PRIMARY KEY,
      console_id TEXT NOT NULL REFERENCES consoles(id),
      customer_id TEXT NOT NULL REFERENCES customers(id),
      mode TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ends_at TEXT,
      granted_seconds INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      ended_at TEXT,
      whatsapp_sent_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_console_sessions_open
      ON console_sessions(console_id, status);
  `);
  const upsert = db.prepare(
    `INSERT INTO consoles (id, name, sort_order) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, sort_order = excluded.sort_order`,
  );
  for (const row of CONSOLE_ROSTER) upsert.run(row.id, row.name, row.sort);
}

function digits(phone: string) {
  return String(phone || "").replace(/\D/g, "");
}

/** Loja + Luiz + Kauã. Env CONSOLE_ALERT_PHONES substitui a lista. */
export function consoleAlertPhones(): string[] {
  const raw = (process.env.CONSOLE_ALERT_PHONES || "").trim();
  const list = raw
    ? raw.split(/[,;\s]+/)
    : ["5575983403977", "557588233299", "557588977020"];
  return [...new Set(list.map(digits).filter((n) => n.length >= 10))];
}

function writeLedger(
  customerId: string,
  deltaSeconds: number,
  amountReais: number,
  reason: "sale" | "session_consume" | "adjust",
  meta: Record<string, unknown>,
) {
  getDb()
    .prepare(
      `INSERT INTO time_ledger (id, customer_id, delta_seconds, amount_reais, reason, meta, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      nanoid(),
      customerId,
      deltaSeconds,
      amountReais,
      reason,
      JSON.stringify(meta),
      new Date().toISOString(),
    );
}

function readBalance(customerId: string): number {
  const row = getDb()
    .prepare("SELECT time_balance_seconds FROM customers WHERE id = ?")
    .get(customerId) as { time_balance_seconds: number } | undefined;
  if (!row) throw new Error("Cliente não encontrado");
  return Math.max(0, Number(row.time_balance_seconds) || 0);
}

function setBalance(customerId: string, seconds: number) {
  getDb()
    .prepare("UPDATE customers SET time_balance_seconds = ?, updated_at = ? WHERE id = ?")
    .run(Math.max(0, seconds), new Date().toISOString(), customerId);
}

function quoteSeconds(input: { hours?: number; seconds?: number; amountReais?: number; customerId: string }) {
  const hourPrice = effectiveHourPrice(input.customerId);
  let amountReais = 0;
  let seconds = 0;
  if (input.seconds != null && input.seconds > 0) {
    seconds = Math.round(input.seconds);
    amountReais = Math.round((seconds / 3600) * hourPrice * 100) / 100;
  } else if (input.hours != null && input.hours > 0) {
    seconds = Math.round(input.hours * 3600);
    amountReais = Math.round((seconds / 3600) * hourPrice * 100) / 100;
  } else if (input.amountReais != null && input.amountReais > 0) {
    amountReais = input.amountReais;
    seconds = Math.round((amountReais / hourPrice) * 3600);
  } else {
    throw new Error("Informe valor em R$ ou horas");
  }
  if (seconds < MIN_SECONDS) throw new Error("Tempo mínimo: 5 minutos");
  return { seconds, amountReais, hourPrice };
}

function openSession(consoleId: string): SessionRow | undefined {
  return getDb()
    .prepare(
      `SELECT * FROM console_sessions
       WHERE console_id = ? AND status IN ('active', 'expired')
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(consoleId) as SessionRow | undefined;
}

function remainingSeconds(row: SessionRow, now = Date.now()): number {
  if (row.status !== "active" || !row.ends_at) return 0;
  return Math.max(0, Math.floor((Date.parse(row.ends_at) - now) / 1000));
}

function publicSession(row: SessionRow) {
  const customer = getCustomer(row.customer_id) as { id: string; name: string } | undefined;
  return {
    id: row.id,
    mode: row.mode,
    customerId: row.customer_id,
    customerName: customer?.name ?? "",
    startedAt: row.started_at,
    endsAt: row.ends_at,
    grantedSeconds: row.granted_seconds,
    status: row.status,
    remainingSeconds: remainingSeconds(row),
  };
}

async function notifyExpired(consoleName: string, customerName: string) {
  const text = `${consoleName} — tempo acabou · ${customerName}`;
  for (const phone of consoleAlertPhones()) {
    await sendWhatsAppText({ phone, text, kind: "console.time_up" });
  }
}

/** Marca sessões que chegaram no zero. O Zap sai uma vez (whatsapp_sent_at). */
export function expireDueConsoles() {
  ensureConsoles();
  const db = getDb();
  const nowIso = new Date().toISOString();
  const due = db
    .prepare(
      `SELECT s.id, s.customer_id, c.name AS console_name
       FROM console_sessions s
       JOIN consoles c ON c.id = s.console_id
       WHERE s.status = 'active' AND s.ends_at IS NOT NULL AND s.ends_at <= ?`,
    )
    .all(nowIso) as Array<{ id: string; customer_id: string; console_name: string }>;

  const pending: Array<{ consoleName: string; customerName: string }> = [];
  const tx = db.transaction(() => {
    for (const row of due) {
      const changed = db
        .prepare(
          `UPDATE console_sessions
           SET status = 'expired'
           WHERE id = ? AND status = 'active'`,
        )
        .run(row.id);
      if (changed.changes !== 1) continue;
      const claim = db
        .prepare(
          `UPDATE console_sessions
           SET whatsapp_sent_at = ?
           WHERE id = ? AND whatsapp_sent_at IS NULL`,
        )
        .run(nowIso, row.id);
      if (claim.changes !== 1) continue;
      const customer = getCustomer(row.customer_id) as { name?: string } | undefined;
      pending.push({
        consoleName: row.console_name,
        customerName: customer?.name || "cliente",
      });
    }
  });
  tx();

  for (const item of pending) {
    logEvent({
      level: "info",
      source: "console",
      kind: "console.expired",
      message: `${item.consoleName} — tempo acabou · ${item.customerName}`,
    });
    void notifyExpired(item.consoleName, item.customerName).catch((err) => {
      logEvent({
        level: "warn",
        source: "console",
        kind: "console.whatsapp_fail",
        message: err instanceof Error ? err.message : "Falha no Zap",
      });
    });
  }
  return pending.length;
}

export function listConsoles() {
  ensureConsoles();
  expireDueConsoles();
  const db = getDb();
  const consoles = db
    .prepare("SELECT id, name FROM consoles ORDER BY sort_order, name")
    .all() as Array<{ id: string; name: string }>;
  return consoles.map((console) => {
    const session = openSession(console.id);
    return {
      id: console.id,
      name: console.name,
      session: session ? publicSession(session) : null,
    };
  });
}

function requireConsole(id: string) {
  ensureConsoles();
  const row = getDb().prepare("SELECT id, name FROM consoles WHERE id = ?").get(id) as
    | { id: string; name: string }
    | undefined;
  if (!row) throw new Error("Console não encontrado");
  return row;
}

export function startConsoleSession(input: {
  consoleId: string;
  customerId: string;
  mode: SessionMode;
  hours?: number;
  seconds?: number;
  amountReais?: number;
  actor: string;
}) {
  const console = requireConsole(input.consoleId);
  const customer = getCustomer(input.customerId) as { id: string; name: string } | undefined;
  if (!customer) throw new Error("Cliente não encontrado");

  const db = getDb();
  const now = new Date();
  const nowIso = now.toISOString();

  const tx = db.transaction(() => {
    const busy = openSession(console.id);
    if (busy) throw new Error(`${console.name} já está em uso`);

    let granted = 0;
    let endsAt: string | null = null;
    let amountReais = 0;

    if (input.mode === "open") {
      granted = 0;
      endsAt = null;
    } else if (input.mode === "balance") {
      const balance = readBalance(customer.id);
      if (balance < MIN_SECONDS) throw new Error("Sem crédito de horas — venda ou liberar aberto");
      setBalance(customer.id, 0);
      writeLedger(customer.id, -balance, 0, "session_consume", {
        consoleId: console.id,
        mode: "balance",
      });
      granted = balance;
      endsAt = new Date(now.getTime() + balance * 1000).toISOString();
    } else {
      const quote = quoteSeconds({
        hours: input.hours,
        seconds: input.seconds,
        amountReais: input.amountReais,
        customerId: customer.id,
      });
      const balance = readBalance(customer.id);
      setBalance(customer.id, balance + quote.seconds);
      writeLedger(customer.id, quote.seconds, quote.amountReais, "sale", {
        consoleId: console.id,
        hourPrice: quote.hourPrice,
      });
      setBalance(customer.id, balance);
      writeLedger(customer.id, -quote.seconds, 0, "session_consume", {
        consoleId: console.id,
        mode: "sale",
      });
      granted = quote.seconds;
      amountReais = quote.amountReais;
      endsAt = new Date(now.getTime() + quote.seconds * 1000).toISOString();
    }

    const id = nanoid();
    db.prepare(
      `INSERT INTO console_sessions
        (id, console_id, customer_id, mode, started_at, ends_at, granted_seconds, status, ended_at, whatsapp_sent_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', NULL, NULL, ?)`,
    ).run(id, console.id, customer.id, input.mode, nowIso, endsAt, granted, nowIso);

    return { id, granted, amountReais, endsAt };
  });

  const created = tx();
  logEvent({
    level: "info",
    source: "console",
    kind: "console.start",
    message: `${input.actor} marcou ${console.name} para ${customer.name} (${input.mode})`,
    meta: { actor: input.actor, consoleId: console.id, customerId: customer.id, mode: input.mode },
  });
  return {
    ok: true,
    console,
    customer,
    session: publicSession(openSession(console.id)!),
    amountReais: created.amountReais,
    timeBalanceSeconds: getTimeBalance(customer.id),
  };
}

export function addConsoleTime(input: {
  consoleId: string;
  hours?: number;
  seconds?: number;
  amountReais?: number;
  fromBalance?: boolean;
  actor: string;
}) {
  const console = requireConsole(input.consoleId);
  const db = getDb();
  const tx = db.transaction(() => {
    const row = openSession(console.id);
    if (!row) throw new Error(`${console.name} está livre`);
    if (row.mode === "open" || !row.ends_at) {
      throw new Error("Liberado aberto não soma hora. Encerre e marque de novo.");
    }
    let seconds = 0;
    let amountReais = 0;
    if (input.fromBalance) {
      const balance = readBalance(row.customer_id);
      if (balance < MIN_SECONDS) throw new Error("Sem crédito de horas");
      seconds = balance;
      setBalance(row.customer_id, 0);
      writeLedger(row.customer_id, -seconds, 0, "session_consume", {
        consoleId: console.id,
        mode: "add_balance",
      });
    } else {
      const quote = quoteSeconds({
        hours: input.hours,
        seconds: input.seconds,
        amountReais: input.amountReais,
        customerId: row.customer_id,
      });
      const balance = readBalance(row.customer_id);
      setBalance(row.customer_id, balance + quote.seconds);
      writeLedger(row.customer_id, quote.seconds, quote.amountReais, "sale", {
        consoleId: console.id,
        hourPrice: quote.hourPrice,
        add: true,
      });
      setBalance(row.customer_id, balance);
      writeLedger(row.customer_id, -quote.seconds, 0, "session_consume", {
        consoleId: console.id,
        mode: "add_sale",
      });
      seconds = quote.seconds;
      amountReais = quote.amountReais;
    }

    const base = Math.max(Date.now(), Date.parse(row.ends_at));
    const endsAt = new Date(base + seconds * 1000).toISOString();
    db.prepare(
      `UPDATE console_sessions
       SET ends_at = ?, granted_seconds = granted_seconds + ?, status = 'active', whatsapp_sent_at = NULL
       WHERE id = ?`,
    ).run(endsAt, seconds, row.id);
    return { seconds, amountReais, customerId: row.customer_id };
  });
  const added = tx();
  logEvent({
    level: "info",
    source: "console",
    kind: "console.add",
    message: `${input.actor} somou ${added.seconds}s em ${console.name}`,
    meta: { actor: input.actor, consoleId: console.id, seconds: added.seconds },
  });
  return {
    ok: true,
    console,
    session: publicSession(openSession(console.id)!),
    amountReais: added.amountReais,
    timeBalanceSeconds: getTimeBalance(added.customerId),
  };
}

export function reduceConsoleTime(input: { consoleId: string; seconds: number; actor: string }) {
  const console = requireConsole(input.consoleId);
  const cut = Math.trunc(input.seconds);
  if (cut < 60) throw new Error("Reduza pelo menos 1 minuto");

  const db = getDb();
  const tx = db.transaction(() => {
    const row = openSession(console.id);
    if (!row || row.status !== "active" || !row.ends_at) {
      throw new Error("Não há tempo contando neste console");
    }
    const left = remainingSeconds(row);
    if (cut >= left) {
      const nowIso = new Date().toISOString();
      db.prepare(
        `UPDATE console_sessions SET status = 'closed', ended_at = ? WHERE id = ? AND status = 'active'`,
      ).run(nowIso, row.id);
      return { refunded: 0, removed: left, closed: true, customerId: row.customer_id };
    }
    const endsAt = new Date(Date.parse(row.ends_at) - cut * 1000).toISOString();
    db.prepare(
      `UPDATE console_sessions SET ends_at = ?, granted_seconds = MAX(0, granted_seconds - ?) WHERE id = ?`,
    ).run(endsAt, cut, row.id);
    return { refunded: 0, removed: cut, closed: false, customerId: row.customer_id };
  });
  const result = tx();
  logEvent({
    level: "info",
    source: "console",
    kind: "console.reduce",
    message: `${input.actor} reduziu ${result.removed}s em ${console.name}`,
    meta: {
      actor: input.actor,
      consoleId: console.id,
      removed: result.removed,
      closed: result.closed,
    },
  });
  return {
    ok: true,
    closed: result.closed,
    refundedSeconds: result.refunded,
    console,
    session: result.closed ? null : publicSession(openSession(console.id)!),
    timeBalanceSeconds: getTimeBalance(result.customerId),
  };
}

export function endConsoleSession(input: { consoleId: string; actor: string }) {
  const console = requireConsole(input.consoleId);
  const db = getDb();
  const tx = db.transaction(() => {
    const row = openSession(console.id);
    if (!row) return { refunded: 0, customerId: null as string | null, already: true };
    const nowIso = new Date().toISOString();
    let removed = 0;
    if (row.status === "active" && row.mode !== "open" && row.ends_at) {
      removed = remainingSeconds(row);
    }
    const changed = db
      .prepare(
        `UPDATE console_sessions SET status = 'closed', ended_at = ?
         WHERE id = ? AND status IN ('active', 'expired')`,
      )
      .run(nowIso, row.id);
    if (changed.changes !== 1) return { refunded: 0, removed: 0, customerId: row.customer_id, already: true };
    return { refunded: 0, removed, customerId: row.customer_id, already: false };
  });
  const result = tx();
  if (!result.already) {
    logEvent({
      level: "info",
      source: "console",
      kind: "console.end",
      message: `${input.actor} encerrou ${console.name}`,
      meta: { actor: input.actor, consoleId: console.id, removed: result.removed },
    });
  }
  return {
    ok: true,
    refundedSeconds: result.refunded,
    timeBalanceSeconds: result.customerId ? getTimeBalance(result.customerId) : 0,
    console,
  };
}

export function startConsoleExpiryLoop(intervalMs = 15_000): { stop: () => void } {
  expireDueConsoles();
  const timer = setInterval(() => {
    try {
      expireDueConsoles();
    } catch (err) {
      logEvent({
        level: "warn",
        source: "console",
        kind: "console.expire_fail",
        message: err instanceof Error ? err.message : "Falha ao vencer console",
      });
    }
  }, intervalMs);
  return {
    stop() {
      clearInterval(timer);
    },
  };
}
