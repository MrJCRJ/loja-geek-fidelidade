/**
 * Formatação de tempo compartilhada (admin, portal, GeekLock).
 */

function splitSeconds(seconds: number) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return { s, h, m, r };
}

/** Relógio HH:MM:SS (equipe / HUD). */
export function formatClock(seconds: number): string {
  const { h, m, r } = splitSeconds(seconds);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

/** Sessão / elapsed: `1h 05m` ou `5m 30s`. */
export function formatDuration(seconds: number): string {
  const { h, m, r } = splitSeconds(seconds);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(r).padStart(2, "0")}s`;
}

/** Saldo de horas (admin): `1h 05m` ou `5m`. */
export function formatHours(seconds: number): string {
  const { h, m } = splitSeconds(seconds);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m`;
}

/** Saldo no portal: `1h 05m` ou `5 min`. */
export function formatHoursPortal(seconds: number): string {
  const { h, m } = splitSeconds(seconds);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m} min`;
}
