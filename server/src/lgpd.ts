import { getDb } from "./db.js";
import { clearFaceEmbeddings, getCustomer, getSetting, setSetting, updateCustomer } from "./customers.js";

const DEFAULT_KEEP_DAYS = 90;

export function getRecognitionRetentionDays(): number {
  const raw = Number(getSetting("recognition_events_keep_days", String(DEFAULT_KEEP_DAYS)));
  if (!Number.isFinite(raw)) return DEFAULT_KEEP_DAYS;
  return Math.min(730, Math.max(7, Math.round(raw)));
}

export function setRecognitionRetentionDays(days: number): number {
  const keep = Math.min(730, Math.max(7, Math.round(days)));
  setSetting("recognition_events_keep_days", String(keep));
  return keep;
}

/** Remove eventos de reconhecimento mais antigos que a retenção configurada. */
export function pruneRecognitionEvents(keepDays?: number): { deleted: number; keepDays: number; cutoff: string } {
  const days = keepDays ?? getRecognitionRetentionDays();
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  const result = getDb().prepare("DELETE FROM recognition_events WHERE created_at < ?").run(cutoff);
  return { deleted: result.changes, keepDays: days, cutoff };
}

/**
 * Revoga consentimento biométrico: apaga embeddings e zera consent_at.
 * Mantém conta, pontos, horas e histórico (sem biometria).
 */
export function revokeBiometrics(customerId: string) {
  const customer = getCustomer(customerId);
  if (!customer) return null;
  const removed = clearFaceEmbeddings(customerId);
  const updated = updateCustomer(customerId, { consent: false });
  return {
    ok: true as const,
    removed,
    customer: updated,
    tip: "Biometria revogada — conta e créditos mantidos; re-enroll exige novo consentimento",
  };
}
