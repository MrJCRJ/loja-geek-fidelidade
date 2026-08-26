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

export function sessionSafetySettingsPayload() {
  return {
    lowBalanceWarnSeconds: getLowBalanceWarnSeconds(),
    staffUnlockMaxSeconds: getStaffUnlockMaxSeconds(),
    presenceMinFaceRatio: getPresenceMinFaceRatio(),
  };
}
