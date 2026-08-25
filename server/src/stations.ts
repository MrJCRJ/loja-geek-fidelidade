import { nanoid } from "nanoid";
import { getDb } from "./db.js";
import { hashStationToken } from "./security.js";

export type StationRow = {
  id: string;
  name: string;
  token: string;
  last_seen_at: string | null;
  last_ip: string | null;
  online: number;
  created_at: string;
};

export function listStations() {
  return getDb()
    .prepare("SELECT id, name, last_seen_at, last_ip, online, created_at FROM stations ORDER BY name COLLATE NOCASE")
    .all() as Omit<StationRow, "token">[];
}

function findByTokenColumn(value: string) {
  return getDb().prepare("SELECT * FROM stations WHERE token = ?").get(value) as StationRow | undefined;
}

/** Aceita token em claro; compara com hash SHA-256 (e migra legado plaintext). */
export function getStationByToken(token: string) {
  if (!token) return undefined;
  const hashed = hashStationToken(token);
  const byHash = findByTokenColumn(hashed);
  if (byHash) return byHash;

  const legacy = findByTokenColumn(token);
  if (legacy) {
    getDb().prepare("UPDATE stations SET token = ? WHERE id = ?").run(hashed, legacy.id);
    return { ...legacy, token: hashed };
  }
  return undefined;
}

export function getStation(id: string) {
  return getDb().prepare("SELECT * FROM stations WHERE id = ?").get(id) as StationRow | undefined;
}

export function registerStation(name: string) {
  const id = nanoid();
  const token = nanoid(32);
  const tokenHash = hashStationToken(token);
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO stations (id, name, token, last_seen_at, last_ip, online, created_at)
       VALUES (?, ?, ?, NULL, NULL, 0, ?)`,
    )
    .run(id, name.trim(), tokenHash, now);
  return { id, name: name.trim(), token, created_at: now };
}

export function renameStation(id: string, name: string) {
  getDb().prepare("UPDATE stations SET name = ? WHERE id = ?").run(name.trim(), id);
  return getStation(id);
}

export function deleteStation(id: string) {
  return getDb().prepare("DELETE FROM stations WHERE id = ?").run(id).changes > 0;
}

export function heartbeatStationById(id: string, ip?: string) {
  const station = getStation(id);
  if (!station) return null;
  const now = new Date().toISOString();
  getDb()
    .prepare("UPDATE stations SET last_seen_at = ?, last_ip = ?, online = 1 WHERE id = ?")
    .run(now, ip || station.last_ip, station.id);
  return getStation(station.id);
}

/** `token` deve ser o valor em claro enviado pela estação (não o hash do banco). */
export function heartbeatStation(token: string, ip?: string) {
  const station = getStationByToken(token);
  if (!station) return null;
  return heartbeatStationById(station.id, ip);
}

export function markStationOffline(id: string) {
  getDb().prepare("UPDATE stations SET online = 0 WHERE id = ?").run(id);
}

export function markStaleStationsOffline(maxAgeMs = 20_000) {
  const stations = listStations() as Array<{ id: string; last_seen_at: string | null; online: number }>;
  const now = Date.now();
  for (const s of stations) {
    if (!s.online) continue;
    if (!s.last_seen_at || now - Date.parse(s.last_seen_at) > maxAgeMs) {
      markStationOffline(s.id);
    }
  }
}
