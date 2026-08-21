import { nanoid } from "nanoid";
import { getDb } from "./db.js";

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

export function getStationByToken(token: string) {
  return getDb().prepare("SELECT * FROM stations WHERE token = ?").get(token) as StationRow | undefined;
}

export function getStation(id: string) {
  return getDb().prepare("SELECT * FROM stations WHERE id = ?").get(id) as StationRow | undefined;
}

export function registerStation(name: string) {
  const id = nanoid();
  const token = nanoid(32);
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO stations (id, name, token, last_seen_at, last_ip, online, created_at)
       VALUES (?, ?, ?, NULL, NULL, 0, ?)`,
    )
    .run(id, name.trim(), token, now);
  return { id, name: name.trim(), token, created_at: now };
}

export function renameStation(id: string, name: string) {
  getDb().prepare("UPDATE stations SET name = ? WHERE id = ?").run(name.trim(), id);
  return getStation(id);
}

export function deleteStation(id: string) {
  return getDb().prepare("DELETE FROM stations WHERE id = ?").run(id).changes > 0;
}

export function heartbeatStation(token: string, ip?: string) {
  const station = getStationByToken(token);
  if (!station) return null;
  const now = new Date().toISOString();
  getDb()
    .prepare("UPDATE stations SET last_seen_at = ?, last_ip = ?, online = 1 WHERE id = ?")
    .run(now, ip || station.last_ip, station.id);
  return getStation(station.id);
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
