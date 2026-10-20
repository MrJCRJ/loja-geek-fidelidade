import { nanoid } from "nanoid";
import { consumeTime, effectiveHourPrice, getTimeBalance, recordOpenHourDue } from "./billing.js";
import { getCustomer } from "./customers.js";
import { getDb } from "./db.js";
import { getLowBalanceWarnSeconds } from "./session-safety.js";

/** O PC avisa cerca de 1 vez por minuto. Até 90s cobra o tempo real; um buraco maior não desconta tudo de uma vez. */
const BILLING_GAP_CAP_SEC = 90;
/** Sem heartbeat de sessão nesse prazo, o outro PC já fechou ou caiu. */
export const STALE_SESSION_MS = 2 * 60 * 1000;

export type EndSessionOpts = {
  /** Não cobra o gap desde last_seen (fantasma / Encerrar com Lock morto). */
  skipBilling?: boolean;
};

/** Contador do dia para o Dashboard (faxina stale_sweep). */
let staleSweepDay = "";
let staleSweepClosedToday = 0;

function bumpStaleSweepStats(closed: number, nowMs = Date.now()) {
  if (closed <= 0) return;
  const day = new Date(nowMs).toISOString().slice(0, 10);
  if (staleSweepDay !== day) {
    staleSweepDay = day;
    staleSweepClosedToday = 0;
  }
  staleSweepClosedToday += closed;
}

export function getStaleSweepStats(nowMs = Date.now()) {
  const day = new Date(nowMs).toISOString().slice(0, 10);
  if (staleSweepDay !== day) return { day, closedToday: 0 };
  return { day: staleSweepDay, closedToday: staleSweepClosedToday };
}

export function sessionSignalAgeMs(lastSeenAt: string, nowMs = Date.now()) {
  const seen = Date.parse(lastSeenAt);
  if (!Number.isFinite(seen)) return Number.POSITIVE_INFINITY;
  return Math.max(0, nowMs - seen);
}

export function sessionIsStale(lastSeenAt: string, nowMs = Date.now()) {
  return sessionSignalAgeMs(lastSeenAt, nowMs) >= STALE_SESSION_MS;
}

function billableDeltaSeconds(lastSeenIso: string, nowMs: number): number {
  const lastMs = Date.parse(lastSeenIso);
  const last = Number.isFinite(lastMs) ? lastMs : nowMs;
  return Math.max(0, Math.min(BILLING_GAP_CAP_SEC, Math.floor((nowMs - last) / 1000)));
}

export type SessionRow = {
  id: string;
  customer_id: string;
  station_id: string;
  started_at: string;
  ended_at: string | null;
  last_seen_at: string;
  seconds_total: number;
  status: "active" | "closed";
  open_after_balance?: number | null;
  open_started_at?: string | null;
  open_seconds?: number | null;
};

function enrich(session: SessionRow) {
  const customer = getCustomer(session.customer_id) as
    | {
        id: string;
        name: string;
        level: string;
        points: number;
        time_balance_seconds?: number;
        subscription_status?: string;
      }
    | undefined;
  const station = getDb().prepare("SELECT id, name FROM stations WHERE id = ?").get(session.station_id) as
    | { id: string; name: string }
    | undefined;
  return {
    ...session,
    customer_name: customer?.name ?? null,
    customer_level: customer?.level ?? null,
    customer_points: customer?.points ?? null,
    time_balance_seconds: customer?.time_balance_seconds ?? getTimeBalance(session.customer_id),
    subscription_status: customer?.subscription_status ?? "none",
    station_name: station?.name ?? null,
  };
}

export function getActiveSessionForStation(stationId: string) {
  return getDb()
    .prepare(
      `SELECT * FROM machine_sessions WHERE station_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1`,
    )
    .get(stationId) as SessionRow | undefined;
}

export function getSession(id: string) {
  return getDb().prepare("SELECT * FROM machine_sessions WHERE id = ?").get(id) as SessionRow | undefined;
}

/**
 * Fecha sessões desta conta que pararam de mandar sinal.
 * Se outra estação ainda está ativa, impede o login.
 */
export function releaseStaleCustomerSessions(
  customerId: string,
  stationId: string,
  opts?: { includeThisStation?: boolean },
) {
  const rows = getDb()
    .prepare(
      `SELECT id, station_id, last_seen_at FROM machine_sessions
       WHERE customer_id = ? AND status = 'active'`,
    )
    .all(customerId) as Array<{ id: string; station_id: string; last_seen_at: string }>;

  let liveElsewhere = false;
  for (const row of rows) {
    const here = row.station_id === stationId;
    if (here && !opts?.includeThisStation) continue;
    if (sessionIsStale(row.last_seen_at)) {
      endSession(row.id, "stale_other_pc", { skipBilling: true });
      continue;
    }
    liveElsewhere = true;
  }
  if (liveElsewhere) throw new Error("Esta conta já está em outro PC");
}

/**
 * Fecha sessões active sem heartbeat há ≥ STALE_SESSION_MS, sem cobrar o gap.
 * Usado pela faxina periódica (e limpeza manual).
 */
export function sweepStaleSessions(nowMs = Date.now()) {
  const rows = getDb()
    .prepare(`SELECT id, last_seen_at FROM machine_sessions WHERE status = 'active'`)
    .all() as Array<{ id: string; last_seen_at: string }>;

  const closed: ReturnType<typeof enrich>[] = [];
  for (const row of rows) {
    if (!sessionIsStale(row.last_seen_at, nowMs)) continue;
    closed.push(endSession(row.id, "stale_sweep", { skipBilling: true }));
  }
  bumpStaleSweepStats(closed.length, nowMs);
  return closed;
}

export function startSession(customerId: string, stationId: string) {
  const balance = getTimeBalance(customerId);
  if (balance <= 0) {
    throw new Error("Sem crédito de horas — passe no caixa");
  }

  const db = getDb();
  const now = new Date().toISOString();

  const existing = getActiveSessionForStation(stationId);
  if (existing) {
    if (existing.customer_id === customerId) {
      db.prepare("UPDATE machine_sessions SET last_seen_at = ? WHERE id = ?").run(now, existing.id);
      return enrich(getSession(existing.id)!);
    }
    endSession(existing.id, "replaced");
  }

  releaseStaleCustomerSessions(customerId, stationId);

  const id = nanoid();
  db.prepare(
    `INSERT INTO machine_sessions
      (id, customer_id, station_id, started_at, ended_at, last_seen_at, seconds_total, status)
     VALUES (?, ?, ?, ?, NULL, ?, 0, 'active')`,
  ).run(id, customerId, stationId, now, now);

  return enrich(getSession(id)!);
}

export function heartbeatSession(
  sessionId: string,
  stationId: string,
  opts?: { pauseBilling?: boolean },
) {
  const db = getDb();
  const session = getSession(sessionId);
  if (!session || session.status !== "active") {
    throw new Error("Sessão inválida ou encerrada");
  }
  if (session.station_id !== stationId) {
    throw new Error("Sessão não pertence a esta estação");
  }

  const pauseBilling = Boolean(opts?.pauseBilling);
  const now = Date.now();
  const deltaSec = billableDeltaSeconds(session.last_seen_at, now);
  const iso = new Date(now).toISOString();

  if (session.open_started_at) {
    const openSeconds = Math.max(0, Number(session.open_seconds || 0)) + (pauseBilling ? 0 : deltaSec);
    db.prepare(
      `UPDATE machine_sessions
       SET last_seen_at = ?, open_seconds = ?, seconds_total = seconds_total + ?
       WHERE id = ?`,
    ).run(iso, openSeconds, pauseBilling ? 0 : deltaSec, sessionId);
    const hourPrice = effectiveHourPrice(session.customer_id);
    const amountReais = Math.round((openSeconds / 3600) * hourPrice * 100) / 100;
    return {
      ...enrich(getSession(sessionId)!),
      time_balance_seconds: 0,
      time_depleted: false,
      billing_paused: pauseBilling,
      low_balance_warn: false,
      low_balance_warn_seconds: getLowBalanceWarnSeconds(),
      open_mode: true,
      open_seconds: openSeconds,
      open_amount_reais: amountReais,
      hour_price_reais: hourPrice,
    };
  }

  // Em pausa (VIP ausente): só avança last_seen — evita cobrar o gap da ausência (T10).
  if (pauseBilling) {
    db.prepare(`UPDATE machine_sessions SET last_seen_at = ? WHERE id = ?`).run(iso, sessionId);
    const timeBalance = getTimeBalance(session.customer_id);
    const warnAt = getLowBalanceWarnSeconds();
    return {
      ...enrich(getSession(sessionId)!),
      time_balance_seconds: timeBalance,
      time_depleted: false,
      billing_paused: true,
      low_balance_warn: timeBalance > 0 && timeBalance <= warnAt,
      low_balance_warn_seconds: warnAt,
    };
  }

  db.prepare(
    `UPDATE machine_sessions SET last_seen_at = ?, seconds_total = seconds_total + ? WHERE id = ?`,
  ).run(iso, deltaSec, sessionId);

  let timeDepleted = false;
  let timeBalance = getTimeBalance(session.customer_id);
  if (deltaSec > 0) {
    const result = consumeTime(session.customer_id, deltaSec, {
      sessionId,
      stationId,
    });
    timeBalance = result.balance;
    timeDepleted = result.depleted;
  }

  const warnAt = getLowBalanceWarnSeconds();
  if (timeDepleted && Number(session.open_after_balance) === 1) {
    db.prepare(
      `UPDATE machine_sessions SET open_started_at = ?, open_seconds = 0 WHERE id = ?`,
    ).run(iso, sessionId);
    const hourPrice = effectiveHourPrice(session.customer_id);
    return {
      ...enrich(getSession(sessionId)!),
      time_balance_seconds: 0,
      time_depleted: false,
      billing_paused: false,
      low_balance_warn: false,
      low_balance_warn_seconds: warnAt,
      open_mode: true,
      switched_to_open: true,
      open_seconds: 0,
      open_amount_reais: 0,
      hour_price_reais: hourPrice,
    };
  }
  return {
    ...enrich(getSession(sessionId)!),
    time_balance_seconds: timeBalance,
    time_depleted: timeDepleted,
    billing_paused: false,
    low_balance_warn: !timeDepleted && timeBalance > 0 && timeBalance <= warnAt,
    low_balance_warn_seconds: warnAt,
    open_mode: false,
  };
}

export function markOpenAfterBalance(sessionId: string) {
  getDb().prepare(`UPDATE machine_sessions SET open_after_balance = 1 WHERE id = ?`).run(sessionId);
}

/** Sessão já em hora em aberto, sem saldo. */
export function startOpenSession(customerId: string, stationId: string) {
  const db = getDb();
  const now = new Date().toISOString();
  const existing = getActiveSessionForStation(stationId);
  if (existing) {
    if (existing.customer_id === customerId && existing.open_started_at) {
      return enrich(existing);
    }
    endSession(existing.id, "replaced");
  }
  releaseStaleCustomerSessions(customerId, stationId);

  const id = nanoid();
  db.prepare(
    `INSERT INTO machine_sessions
      (id, customer_id, station_id, started_at, ended_at, last_seen_at, seconds_total, status,
       open_after_balance, open_started_at, open_seconds)
     VALUES (?, ?, ?, ?, NULL, ?, 0, 'active', 1, ?, 0)`,
  ).run(id, customerId, stationId, now, now, now);
  return enrich(getSession(id)!);
}

export function endSession(sessionId: string, _reason = "end", opts?: EndSessionOpts) {
  const db = getDb();
  const session = getSession(sessionId);
  if (!session) throw new Error("Sessão não encontrada");
  if (session.status === "closed") return enrich(session);

  const now = Date.now();
  const skipBilling = Boolean(opts?.skipBilling);
  const deltaSec = skipBilling ? 0 : billableDeltaSeconds(session.last_seen_at, now);
  // Fantasma: encerra no último sinal (sem gap). Sessão viva: encerra em agora.
  const iso = skipBilling ? session.last_seen_at : new Date(now).toISOString();

  if (session.open_started_at) {
    const openSeconds = Math.max(0, Number(session.open_seconds || 0)) + deltaSec;
    db.prepare(
      `UPDATE machine_sessions
       SET status = 'closed', ended_at = ?, last_seen_at = ?, seconds_total = seconds_total + ?, open_seconds = ?
       WHERE id = ?`,
    ).run(iso, iso, deltaSec, openSeconds, sessionId);
    const due = recordOpenHourDue({
      customerId: session.customer_id,
      openSeconds,
      sessionId,
      stationId: session.station_id,
    });
    return {
      ...enrich(getSession(sessionId)!),
      open_seconds: openSeconds,
      open_charge_reais: due.amountReais,
      hour_price_reais: due.hourPrice,
    };
  }

  db.prepare(
    `UPDATE machine_sessions
     SET status = 'closed', ended_at = ?, last_seen_at = ?, seconds_total = seconds_total + ?
     WHERE id = ?`,
  ).run(iso, iso, deltaSec, sessionId);

  if (deltaSec > 0) {
    consumeTime(session.customer_id, deltaSec, { sessionId, reason: _reason });
  }

  return enrich(getSession(sessionId)!);
}

export function endActiveSessionForStation(stationId: string, opts?: EndSessionOpts & { reason?: string }) {
  const active = getActiveSessionForStation(stationId);
  if (!active) return null;
  return endSession(active.id, opts?.reason || "station_end", opts);
}

/** Encerrar/Travar no Central: fecha no banco mesmo com Lock morto. */
export function endActiveSessionsAllStations(opts?: EndSessionOpts & { reason?: string }) {
  const rows = getDb()
    .prepare(`SELECT id FROM machine_sessions WHERE status = 'active'`)
    .all() as Array<{ id: string }>;
  return rows.map((row) => endSession(row.id, opts?.reason || "admin_end_all", opts));
}

export function listSessions(limit = 100) {
  const rows = getDb()
    .prepare(`SELECT * FROM machine_sessions ORDER BY started_at DESC LIMIT ?`)
    .all(limit) as SessionRow[];
  return rows.map(enrich);
}

export function sessionStatsToday() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const since = start.toISOString();

  const byCustomer = getDb()
    .prepare(
      `SELECT c.id AS customer_id, c.name AS customer_name, c.level AS customer_level,
              COALESCE(SUM(s.seconds_total), 0) AS seconds_total,
              COUNT(*) AS sessions
       FROM machine_sessions s
       JOIN customers c ON c.id = s.customer_id
       WHERE s.started_at >= ?
       GROUP BY c.id
       ORDER BY seconds_total DESC`,
    )
    .all(since);

  const byStation = getDb()
    .prepare(
      `SELECT st.id AS station_id, st.name AS station_name,
              COALESCE(SUM(s.seconds_total), 0) AS seconds_total,
              COUNT(*) AS sessions
       FROM machine_sessions s
       JOIN stations st ON st.id = s.station_id
       WHERE s.started_at >= ?
       GROUP BY st.id
       ORDER BY seconds_total DESC`,
    )
    .all(since);

  const active = getDb()
    .prepare(
      `SELECT s.*, c.name AS customer_name, st.name AS station_name
       FROM machine_sessions s
       JOIN customers c ON c.id = s.customer_id
       JOIN stations st ON st.id = s.station_id
       WHERE s.status = 'active'
       ORDER BY s.started_at DESC`,
    )
    .all();

  return { since, byCustomer, byStation, active };
}
