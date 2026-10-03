import { getSetting, setSetting } from "./customers.js";

const DEFAULT_LOW_BALANCE_WARN_SEC = 300;
const DEFAULT_STAFF_UNLOCK_MAX_SEC = 600;
const DEFAULT_PRESENCE_MIN_FACE_RATIO = 0.12;
const DEFAULT_PRESENCE_SCORE_MARGIN = 0.1;

export function getLowBalanceWarnSeconds() {
  const n = Number(getSetting("low_balance_warn_seconds", String(DEFAULT_LOW_BALANCE_WARN_SEC)));
  if (!Number.isFinite(n)) return DEFAULT_LOW_BALANCE_WARN_SEC;
  return Math.min(3600, Math.max(60, Math.floor(n)));
}

export function setLowBalanceWarnSeconds(seconds: number) {
  const n = Math.min(3600, Math.max(60, Math.floor(seconds)));
  setSetting("low_balance_warn_seconds", String(n));
}

export function getStaffUnlockMaxSeconds() {
  const n = Number(getSetting("staff_unlock_max_seconds", String(DEFAULT_STAFF_UNLOCK_MAX_SEC)));
  if (!Number.isFinite(n)) return DEFAULT_STAFF_UNLOCK_MAX_SEC;
  return Math.min(7200, Math.max(60, Math.floor(n)));
}

export function setStaffUnlockMaxSeconds(seconds: number) {
  setSetting(
    "staff_unlock_max_seconds",
    String(Math.min(7200, Math.max(60, Math.floor(seconds)))),
  );
}

/** Rosto menor que isso na presença = VIP longe / fundo (T4). */
export function getPresenceMinFaceRatio() {
  const n = Number(getSetting("presence_min_face_ratio", String(DEFAULT_PRESENCE_MIN_FACE_RATIO)));
  if (!Number.isFinite(n)) return DEFAULT_PRESENCE_MIN_FACE_RATIO;
  return Math.min(0.4, Math.max(0.06, n));
}

export function setPresenceMinFaceRatio(ratio: number) {
  setSetting(
    "presence_min_face_ratio",
    String(Math.min(0.4, Math.max(0.06, Number(ratio) || DEFAULT_PRESENCE_MIN_FACE_RATIO))),
  );
}

/** Threshold de presença = match normal + margem (reduz T14 no limiar). */
export function getPresenceMatchThreshold(faceMatchThreshold: number) {
  const margin = Number(getSetting("presence_score_margin", String(DEFAULT_PRESENCE_SCORE_MARGIN)));
  const m = Number.isFinite(margin) ? margin : DEFAULT_PRESENCE_SCORE_MARGIN;
  return Math.min(0.95, faceMatchThreshold + Math.max(0, Math.min(0.2, m)));
}

type StaffUnlockWindow = { startedAt: number; durationSec: number; timer?: ReturnType<typeof setTimeout> };
const staffUnlockWindows = new Map<string, StaffUnlockWindow>();

const STAFF_UNLOCK_MIN_SEC = 5 * 60;
const STAFF_UNLOCK_MAX_SEC = 23 * 3600 + 59 * 60;

export function clampStaffUnlockSeconds(seconds: number) {
  if (!Number.isFinite(seconds)) return Math.max(STAFF_UNLOCK_MIN_SEC, getStaffUnlockMaxSeconds());
  return Math.min(STAFF_UNLOCK_MAX_SEC, Math.max(STAFF_UNLOCK_MIN_SEC, Math.floor(seconds)));
}

export function startStaffUnlockWindow(stationId: string, durationSec: number) {
  clearStaffUnlockWindow(stationId);
  const d = clampStaffUnlockSeconds(durationSec);
  staffUnlockWindows.set(stationId, { startedAt: Date.now(), durationSec: d });
  return d;
}

export function attachStaffUnlockTimer(stationId: string, timer: ReturnType<typeof setTimeout>) {
  const w = staffUnlockWindows.get(stationId);
  if (w) w.timer = timer;
}

export function clearStaffUnlockWindow(stationId: string) {
  const prev = staffUnlockWindows.get(stationId);
  if (prev?.timer) clearTimeout(prev.timer);
  staffUnlockWindows.delete(stationId);
}

export function staffUnlockLeftSeconds(stationId: string) {
  const w = staffUnlockWindows.get(stationId);
  if (!w) return 0;
  const left = w.durationSec - Math.floor((Date.now() - w.startedAt) / 1000);
  if (left <= 0) {
    clearStaffUnlockWindow(stationId);
    return 0;
  }
  return left;
}

export function sessionSafetySettingsPayload(stationId?: string) {
  const windowSec = stationId ? staffUnlockWindows.get(stationId)?.durationSec : 0;
  return {
    lowBalanceWarnSeconds: getLowBalanceWarnSeconds(),
    staffUnlockMaxSeconds: windowSec && staffUnlockLeftSeconds(stationId!) > 0
      ? windowSec
      : getStaffUnlockMaxSeconds(),
    presenceMinFaceRatio: getPresenceMinFaceRatio(),
  };
}
