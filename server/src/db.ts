import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { ensureStaffUsersTable } from "./staff-users.js";

export type CustomerLevel = "bronze" | "prata" | "ouro";

type TableInfoRow = { name: string };
type CountRow = { c: number };

let db: Database.Database | undefined;

export function getDb() {
  if (!db) throw new Error("Database not initialized");
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = undefined;
  }
}

export function initDb(databasePath?: string) {
  if (db) return db;
  const resolvedPath = databasePath ?? config.databasePath;
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  db = new Database(resolvedPath);
  // Local const so nested helpers keep a narrowed Database (module `db` is `| undefined`).
  const conn = db;
  conn.pragma("journal_mode = WAL");
  conn.pragma("foreign_keys = ON");

  conn.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      level TEXT NOT NULL DEFAULT 'bronze',
      points INTEGER NOT NULL DEFAULT 0,
      consent_at TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS face_embeddings (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      embedding TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      last_seen_at TEXT,
      last_ip TEXT,
      online INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recognition_events (
      id TEXT PRIMARY KEY,
      customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
      station_id TEXT REFERENCES stations(id) ON DELETE SET NULL,
      score REAL NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS point_ledger (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      delta INTEGER NOT NULL,
      reason TEXT NOT NULL,
      station_id TEXT,
      meta TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rewards (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      cost_points INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS machine_sessions (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      station_id TEXT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      last_seen_at TEXT NOT NULL,
      seconds_total INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active'
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_status ON machine_sessions(status);
    CREATE INDEX IF NOT EXISTS idx_sessions_customer ON machine_sessions(customer_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_station ON machine_sessions(station_id);

    CREATE TABLE IF NOT EXISTS time_ledger (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      delta_seconds INTEGER NOT NULL,
      amount_reais REAL NOT NULL DEFAULT 0,
      reason TEXT NOT NULL,
      meta TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      plan_code TEXT NOT NULL DEFAULT 'monthly',
      price_reais REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      expires_at TEXT,
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_time_ledger_customer ON time_ledger(customer_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_customer ON subscriptions(customer_id);
  `);

  // Migrações leves (colunas novas em DBs já existentes)
  const customerCols = (conn.prepare("PRAGMA table_info(customers)").all() as TableInfoRow[]).map(
    (c) => c.name,
  );
  const ensureCol = (name: string, ddl: string) => {
    if (!customerCols.includes(name)) {
      conn.exec(`ALTER TABLE customers ADD COLUMN ${ddl}`);
    }
  };
  ensureCol("time_balance_seconds", "time_balance_seconds INTEGER NOT NULL DEFAULT 0");
  ensureCol("subscription_status", "subscription_status TEXT NOT NULL DEFAULT 'none'");
  ensureCol("subscription_expires_at", "subscription_expires_at TEXT");
  ensureCol("subscriber_since", "subscriber_since TEXT");
  ensureCol("email", "email TEXT");
  ensureCol("password_hash", "password_hash TEXT");
  ensureCol("email_verified_at", "email_verified_at TEXT");

  const stationCols = (conn.prepare("PRAGMA table_info(stations)").all() as TableInfoRow[]).map(
    (c) => c.name,
  );
  if (!stationCols.includes("lock_version")) {
    conn.exec("ALTER TABLE stations ADD COLUMN lock_version TEXT");
  }
  if (!stationCols.includes("disk_free_pct")) {
    conn.exec("ALTER TABLE stations ADD COLUMN disk_free_pct REAL");
  }
  if (!stationCols.includes("disk_total_gb")) {
    conn.exec("ALTER TABLE stations ADD COLUMN disk_total_gb REAL");
  }
  if (!stationCols.includes("uptime_sec")) {
    conn.exec("ALTER TABLE stations ADD COLUMN uptime_sec INTEGER");
  }
  if (!stationCols.includes("ram_used_pct")) {
    conn.exec("ALTER TABLE stations ADD COLUMN ram_used_pct REAL");
  }

  conn.exec(`
    CREATE TABLE IF NOT EXISTS web_orders (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      amount_reais REAL NOT NULL DEFAULT 0,
      hours REAL,
      months INTEGER,
      status TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'stub',
      provider_ref TEXT,
      created_at TEXT NOT NULL,
      paid_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_web_orders_customer ON web_orders(customer_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_email
      ON customers(email) WHERE email IS NOT NULL AND email != '';
  `);

  const countRewards = conn.prepare("SELECT COUNT(*) AS c FROM rewards").get() as CountRow;
  if (countRewards.c === 0) {
    const now = new Date().toISOString();
    const insert = conn.prepare(
      "INSERT INTO rewards (id, title, description, cost_points, active, created_at) VALUES (?, ?, ?, ?, 1, ?)",
    );
    insert.run("rw_pin", "Pin exclusivo", "Pin da loja geek", 50, now);
    insert.run("rw_desc10", "Desconto 10%", "Válido em uma compra", 100, now);
    insert.run("rw_brinde", "Brinde surpresa", "Item geek sortido", 150, now);
  }

  const upsertSetting = (key: string, value: string) => {
    const row = conn.prepare("SELECT value FROM settings WHERE key = ?").get(key);
    if (!row) {
      conn.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(key, value);
    }
  };
  upsertSetting("face_match_threshold", String(config.faceMatchThreshold));
  upsertSetting("points_per_real", String(config.pointsPerReal));
  upsertSetting("hour_price_reais", "10");
  upsertSetting("subscriber_hour_discount_pct", "20");

  conn.exec(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL DEFAULT 'portal'
    );
    CREATE INDEX IF NOT EXISTS idx_password_reset_customer ON password_reset_tokens(customer_id);
  `);

  conn.exec(`
    CREATE TABLE IF NOT EXISTS system_events (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      level TEXT NOT NULL,
      source TEXT NOT NULL,
      kind TEXT NOT NULL,
      message TEXT NOT NULL,
      station_id TEXT,
      meta TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_system_events_created ON system_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_system_events_level ON system_events(level);
    CREATE INDEX IF NOT EXISTS idx_system_events_kind ON system_events(kind);
  `);

  ensureStaffUsersTable();

  return conn;
}
