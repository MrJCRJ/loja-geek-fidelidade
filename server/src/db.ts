import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

export type CustomerLevel = "bronze" | "prata" | "ouro";

let db: Database.Database;

export function getDb() {
  if (!db) throw new Error("Database not initialized");
  return db;
}

export function initDb() {
  fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
  db = new Database(config.databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
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
  `);

  const countRewards = db.prepare("SELECT COUNT(*) AS c FROM rewards").get() as { c: number };
  if (countRewards.c === 0) {
    const now = new Date().toISOString();
    const insert = db.prepare(
      "INSERT INTO rewards (id, title, description, cost_points, active, created_at) VALUES (?, ?, ?, ?, 1, ?)",
    );
    insert.run("rw_pin", "Pin exclusivo", "Pin da loja geek", 50, now);
    insert.run("rw_desc10", "Desconto 10%", "Válido em uma compra", 100, now);
    insert.run("rw_brinde", "Brinde surpresa", "Item geek sortido", 150, now);
  }

  const threshold = db.prepare("SELECT value FROM settings WHERE key = ?").get("face_match_threshold");
  if (!threshold) {
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "face_match_threshold",
      String(config.faceMatchThreshold),
    );
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "points_per_real",
      String(config.pointsPerReal),
    );
  }

  return db;
}
