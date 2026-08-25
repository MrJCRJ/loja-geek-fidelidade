import { nanoid } from "nanoid";
import { consumeTime, getTimeBalance } from "./billing.js";
import { getCustomer } from "./customers.js";
import { getDb } from "./db.js";

export type SessionRow = {
  id: string;
  customer_id: string;
  station_id: string;
  started_at: string;
  ended_at: string | null;
  last_seen_at: string;
  seconds_total: number;
  status: "active" | "closed";
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

  const other = db
    .prepare(
      `SELECT id FROM machine_sessions WHERE customer_id = ? AND status = 'active' AND station_id != ?`,
    )
    .all(customerId, stationId) as Array<{ id: string }>;
  for (const row of other) {
    endSession(row.id, "moved");
  }

  const id = nanoid();
  db.prepare(
    `INSERT INTO machine_sessions
      (id, customer_id, station_id, started_at, ended_at, last_seen_at, seconds_total, status)
     VALUES (?, ?, ?, ?, NULL, ?, 0, 'active')`,
  ).run(id, customerId, stationId, now, now);

  return enrich(getSession(id)!);
}

export function heartbeatSession(sessionId: string, stationId: string) {
  const db = getDb();
  const session = getSession(sessionId);
  if (!session || session.status !== "active") {
    throw new Error("Sessão inválida ou encerrada");
  }
  if (session.station_id !== stationId) {
    throw new Error("Sessão não pertence a esta estação");
  }

  const now = Date.now();
  const last = Date.parse(session.last_seen_at);
  const deltaSec = Math.max(0, Math.min(120, Math.floor((now - last) / 1000)));
  const iso = new Date(now).toISOString();

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

  return {
    ...enrich(getSession(sessionId)!),
    time_balance_seconds: timeBalance,
    time_depleted: timeDepleted,
  };
}

export function endSession(sessionId: string, _reason = "end") {
  const db = getDb();
  const session = getSession(sessionId);
  if (!session) throw new Error("Sessão não encontrada");
  if (session.status === "closed") return enrich(session);

  const now = Date.now();
  const last = Date.parse(session.last_seen_at);
  const deltaSec = Math.max(0, Math.min(120, Math.floor((now - last) / 1000)));
  const iso = new Date(now).toISOString();

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

export function endActiveSessionForStation(stationId: string) {
  const active = getActiveSessionForStation(stationId);
  if (!active) return null;
  return endSession(active.id, "station_end");
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
