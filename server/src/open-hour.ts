import { nanoid } from "nanoid";
import { getTimeBalance } from "./billing.js";
import { getDb } from "./db.js";
import { broadcastAdmins, sendCommandToStation } from "./hub.js";
import { getCustomer } from "./customers.js";
import { loginLockCustomer } from "./lock-account.js";
import { markOpenAfterBalance, releaseStaleCustomerSessions, startOpenSession, startSession } from "./sessions.js";

export type OpenRequest = {
  id: string;
  customer_id: string;
  station_id: string;
  customer_name: string;
  created_at: string;
};

export function listPendingOpenRequests(): OpenRequest[] {
  return getDb()
    .prepare(
      `SELECT r.id, r.customer_id, r.station_id, r.created_at, c.name AS customer_name
       FROM open_hour_requests r
       JOIN customers c ON c.id = r.customer_id
       WHERE r.status = 'pending'
       ORDER BY r.created_at ASC`,
    )
    .all() as OpenRequest[];
}

export async function requestOpenHour(input: {
  stationId: string;
  stationName: string;
  username: string;
  password: string;
}) {
  const customer = (await loginLockCustomer(input.username, input.password)) as {
    id: string;
    name: string;
  };
  releaseStaleCustomerSessions(customer.id, input.stationId, { includeThisStation: true });
  const now = new Date().toISOString();
  const db = getDb();
  db.prepare(
    `UPDATE open_hour_requests SET status = 'replaced', resolved_at = ?
     WHERE station_id = ? AND status = 'pending'`,
  ).run(now, input.stationId);
  const id = nanoid();
  db.prepare(
    `INSERT INTO open_hour_requests (id, customer_id, station_id, status, created_at, resolved_at)
     VALUES (?, ?, ?, 'pending', ?, NULL)`,
  ).run(id, customer.id, input.stationId, now);
  const request = {
    id,
    customerId: customer.id,
    customerName: customer.name,
    stationId: input.stationId,
    at: now,
  };
  broadcastAdmins({
    type: "open_request",
    station: { id: input.stationId, name: input.stationName },
    customer: { id: customer.id, name: customer.name },
    request,
    at: now,
  });
  return { ok: true, pending: true, customerName: customer.name, timeBalanceSeconds: getTimeBalance(customer.id) };
}

export function approveOpenRequest(stationId: string, stationName: string) {
  const pending = getDb()
    .prepare(
      `SELECT r.id, r.customer_id, c.name AS customer_name
       FROM open_hour_requests r
       JOIN customers c ON c.id = r.customer_id
       WHERE r.station_id = ? AND r.status = 'pending'
       ORDER BY r.created_at DESC LIMIT 1`,
    )
    .get(stationId) as { id: string; customer_id: string; customer_name: string } | undefined;
  if (!pending) throw new Error("Nenhum pedido de hora em aberto neste PC");
  const customer = getCustomer(pending.customer_id);
  if (!customer) throw new Error("Cliente não encontrado");

  const balance = getTimeBalance(pending.customer_id);
  const session =
    balance > 0 ? startSession(pending.customer_id, stationId) : startOpenSession(pending.customer_id, stationId);
  if (balance > 0) markOpenAfterBalance(session.id as string);

  const now = new Date().toISOString();
  getDb()
    .prepare(`UPDATE open_hour_requests SET status = 'approved', resolved_at = ? WHERE id = ?`)
    .run(now, pending.id);

  sendCommandToStation(stationId, "unlock_screen", {
    occupantKind: "vip_desk",
    customerId: pending.customer_id,
    customerName: pending.customer_name,
    sessionId: session.id,
    timeBalanceSeconds: balance,
    openAfterBalance: true,
  });
  broadcastAdmins({
    type: "open_request_cleared",
    station: { id: stationId, name: stationName },
    at: now,
  });
  broadcastAdmins({
    type: "session_started",
    session,
    station: { id: stationId, name: stationName },
    customer,
    at: now,
  });
  return { ok: true, session, customer, timeBalanceSeconds: balance, openNow: balance <= 0 };
}

export function rejectOpenRequest(stationId: string, stationName: string) {
  const pending = getDb()
    .prepare(
      `SELECT id, customer_id FROM open_hour_requests
       WHERE station_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
    )
    .get(stationId) as { id: string } | undefined;
  if (!pending) throw new Error("Nenhum pedido de hora em aberto neste PC");
  const now = new Date().toISOString();
  getDb()
    .prepare(`UPDATE open_hour_requests SET status = 'rejected', resolved_at = ? WHERE id = ?`)
    .run(now, pending.id);
  sendCommandToStation(stationId, "message", {
    title: "Hora em aberto",
    text: "A equipe não liberou a hora em aberto. O PC continua travado.",
    level: "warn",
    durationSec: 12,
  });
  broadcastAdmins({
    type: "open_request_cleared",
    station: { id: stationId, name: stationName },
    at: now,
  });
  return { ok: true };
}
