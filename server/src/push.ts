import { getDb } from "./db.js";
import { config } from "./config.js";
import { nanoid } from "nanoid";

export type PushSubscriptionRow = {
  id: string;
  customer_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
  last_notified_at: string | null;
};

export function pushEnabled() {
  return Boolean(config.vapidPublicKey && config.vapidPrivateKey);
}

export function ensurePushTable() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      user_agent TEXT,
      created_at TEXT NOT NULL,
      last_notified_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_push_customer ON push_subscriptions(customer_id);
  `);
}

export function upsertPushSubscription(
  customerId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent?: string,
) {
  ensurePushTable();
  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM push_subscriptions WHERE endpoint = ?")
    .get(sub.endpoint) as { id: string } | undefined;
  const now = new Date().toISOString();
  if (existing) {
    db.prepare(
      `UPDATE push_subscriptions
       SET customer_id = ?, p256dh = ?, auth = ?, user_agent = ?
       WHERE id = ?`,
    ).run(customerId, sub.keys.p256dh, sub.keys.auth, userAgent || null, existing.id);
    return existing.id;
  }
  const id = nanoid();
  db.prepare(
    `INSERT INTO push_subscriptions
     (id, customer_id, endpoint, p256dh, auth, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, customerId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, userAgent || null, now);
  return id;
}

export function deletePushSubscription(customerId: string, endpoint: string) {
  ensurePushTable();
  getDb()
    .prepare("DELETE FROM push_subscriptions WHERE customer_id = ? AND endpoint = ?")
    .run(customerId, endpoint);
}

export function listPushForCustomer(customerId: string): PushSubscriptionRow[] {
  ensurePushTable();
  return getDb()
    .prepare("SELECT * FROM push_subscriptions WHERE customer_id = ?")
    .all(customerId) as PushSubscriptionRow[];
}

const lowBalanceCooldownMs = 30 * 60 * 1000;
const recentlyWarned = new Map<string, number>();

export async function notifyLowBalance(customerId: string, balanceSeconds: number) {
  const now = Date.now();
  const last = recentlyWarned.get(customerId) || 0;
  if (now - last < lowBalanceCooldownMs) return { sent: 0, skipped: "cooldown" as const };

  const minutes = Math.max(1, Math.round(balanceSeconds / 60));
  let sent = 0;

  if (pushEnabled()) {
    const result = await sendPushToCustomer(customerId, {
      title: "Saldo baixo — Lan Geeks",
      body: `Restam cerca de ${minutes} min de PC. Recarregue no site ou no balcão.`,
      url: "/dashboard",
    });
    sent += result.sent;
  }

  try {
    const { getCustomer } = await import("./customers.js");
    const { notifyWhatsAppLowBalance } = await import("./whatsapp.js");
    const c = getCustomer(customerId) as { name?: string; phone?: string | null } | undefined;
    if (c?.phone) {
      const wa = await notifyWhatsAppLowBalance({
        phone: c.phone,
        name: c.name || "VIP",
        minutesLeft: minutes,
      });
      if (wa.ok) sent += 1;
    }
  } catch {
    /* ignore */
  }

  if (sent > 0) recentlyWarned.set(customerId, now);
  if (!pushEnabled() && sent === 0) return { sent: 0, skipped: "no_channel" as const };
  return { sent };
}

export async function sendPushToCustomer(
  customerId: string,
  payload: { title: string; body: string; url?: string },
) {
  if (!pushEnabled()) return { sent: 0, failed: 0 };
  const webpush = await import("web-push");
  webpush.setVapidDetails(
    config.vapidSubject,
    config.vapidPublicKey,
    config.vapidPrivateKey,
  );

  const rows = listPushForCustomer(customerId);
  let sent = 0;
  let failed = 0;
  const body = JSON.stringify(payload);
  for (const row of rows) {
    try {
      await webpush.sendNotification(
        {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
        },
        body,
      );
      getDb()
        .prepare("UPDATE push_subscriptions SET last_notified_at = ? WHERE id = ?")
        .run(new Date().toISOString(), row.id);
      sent += 1;
    } catch (err) {
      failed += 1;
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        getDb().prepare("DELETE FROM push_subscriptions WHERE id = ?").run(row.id);
      }
    }
  }
  return { sent, failed };
}
