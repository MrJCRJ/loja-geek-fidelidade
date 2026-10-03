import { useEffect, useRef, type RefObject } from "react";
import { captureFrame, checkPresence, sessionHeartbeat } from "../api";
import {
  FACE_GRACE_MS,
  INTRUDER_HOLD_MS,
  PRESENCE_MS,
  SESSION_HB_MS,
  STRONG_MATCH_SCORE,
  type Phase,
} from "../kiosk-helpers";
import type { GeekLockConfig, Session } from "../vite-env";

type IntruderKind = "vip" | "stranger";

/** Frames seguidos sem VIP antes de marcar ausente (evita falso positivo). */
const ABSENT_MISS_TICKS = 2;

type Args = {
  phase: Phase;
  config: GeekLockConfig | null;
  sessionId: string | undefined;
  customerId?: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  streamRef: RefObject<MediaStream | null>;
  configRef: RefObject<GeekLockConfig | null>;
  sessionRef: RefObject<Session | null>;
  faceGraceUntilRef: RefObject<number>;
  absentSinceRef: RefObject<number | null>;
  presenceMissStreakRef: RefObject<number>;
  /** Liberação do balcão sem face cadastrada — não trava por ausência. */
  deskLiberarRef?: RefObject<boolean>;
  startCam: () => Promise<void>;
  doEndSession: (reason: string) => Promise<void>;
  onIntruder: (kind: IntruderKind) => Promise<void>;
  setBalanceSeconds: (v: number | null) => void;
  setLowBalanceWarn: (v: boolean) => void;
  onLowBalanceWarn?: (balanceSeconds: number) => void;
};

function inFaceGrace(faceGraceUntilRef: RefObject<number>) {
  return Date.now() < (faceGraceUntilRef.current || 0);
}

function isImmediateAbsent(reason?: string) {
  return reason === "no_face" || reason === "face_too_far" || reason === "low_quality";
}

export function usePresenceLoop({
  phase,
  config,
  sessionId,
  customerId,
  videoRef,
  streamRef,
  configRef,
  sessionRef,
  faceGraceUntilRef,
  absentSinceRef,
  presenceMissStreakRef,
  deskLiberarRef,
  startCam,
  doEndSession,
  onIntruder,
  setBalanceSeconds,
  setLowBalanceWarn,
  onLowBalanceWarn,
}: Args) {
  const presenceTimerRef = useRef<number | null>(null);
  const warnedLowRef = useRef(false);
  const intruderSinceRef = useRef<{ kind: IntruderKind; since: number } | null>(null);
  const intruderBusyRef = useRef(false);
  const onLowBalanceWarnRef = useRef(onLowBalanceWarn);
  onLowBalanceWarnRef.current = onLowBalanceWarn;

  useEffect(() => {
    warnedLowRef.current = false;
    intruderSinceRef.current = null;
    intruderBusyRef.current = false;
    absentSinceRef.current = null;
    presenceMissStreakRef.current = 0;
    faceGraceUntilRef.current = Date.now() + FACE_GRACE_MS;
  }, [sessionId, faceGraceUntilRef, absentSinceRef, presenceMissStreakRef]);

  useEffect(() => {
    if (phase !== "unlocked" || !config?.stationToken) return;
    if (customerId === "staff") return;
    if (!sessionId) return;

    if (!streamRef.current?.active) {
      startCam().catch(() => undefined);
    }

    let cancelled = false;
    let lastHb = 0;
    let vipPresent = true;

    const markIntruder = (kind: IntruderKind): boolean => {
      const prev = intruderSinceRef.current;
      const now = Date.now();
      if (prev && prev.kind === kind) {
        return now - prev.since >= INTRUDER_HOLD_MS;
      }
      intruderSinceRef.current = { kind, since: now };
      return false;
    };

    const noteMiss = (reason?: string) => {
      const need = isImmediateAbsent(reason) ? 1 : ABSENT_MISS_TICKS;
      presenceMissStreakRef.current += 1;
      return presenceMissStreakRef.current >= need;
    };

    const notePresent = () => {
      presenceMissStreakRef.current = 0;
      vipPresent = true;
      absentSinceRef.current = null;
    };

    const syncAbsentMark = (grace: boolean) => {
      if (grace || vipPresent) {
        absentSinceRef.current = null;
        return;
      }
      if (absentSinceRef.current == null) {
        absentSinceRef.current = Date.now();
      }
    };

    const tick = async () => {
      if (cancelled || intruderBusyRef.current) return;
      const cfg = configRef.current;
      const sess = sessionRef.current;
      if (!cfg || !sess || sess.id !== sessionId) return;

      const now = Date.now();
      const grace = inFaceGrace(faceGraceUntilRef);
      const vipId = sess.customer_id || customerId;
      const deskLiberar = Boolean(deskLiberarRef?.current);

      if (deskLiberar || grace) {
        notePresent();
        intruderSinceRef.current = null;
      } else if (!videoRef.current || videoRef.current.readyState < 2) {
        if (noteMiss("no_face")) vipPresent = false;
        intruderSinceRef.current = null;
      } else {
        try {
          const imageBase64 = captureFrame(videoRef.current, 0.85);
          const res = await checkPresence(cfg, imageBase64, vipId);

          if (res.present) {
            notePresent();
            intruderSinceRef.current = null;
          } else if (res.reason === "other_vip" && res.bestCustomerId && res.bestCustomerId !== vipId) {
            if (noteMiss(res.reason)) vipPresent = false;
            if (markIntruder("vip")) {
              intruderBusyRef.current = true;
              try {
                intruderSinceRef.current = null;
                await onIntruder("vip");
              } finally {
                intruderBusyRef.current = false;
              }
              return;
            }
          } else if (res.reason === "unknown" || res.reason === "ambiguous") {
            const score = res.bestScore ?? 0;
            if (score >= STRONG_MATCH_SCORE && res.bestCustomerId && res.bestCustomerId !== vipId) {
              if (noteMiss(res.reason)) vipPresent = false;
              if (markIntruder("vip")) {
                intruderBusyRef.current = true;
                try {
                  intruderSinceRef.current = null;
                  await onIntruder("vip");
                } finally {
                  intruderBusyRef.current = false;
                }
                return;
              }
            } else if (score >= STRONG_MATCH_SCORE) {
              if (noteMiss(res.reason)) vipPresent = false;
              if (markIntruder("stranger")) {
                intruderBusyRef.current = true;
                try {
                  intruderSinceRef.current = null;
                  await onIntruder("stranger");
                } finally {
                  intruderBusyRef.current = false;
                }
                return;
              }
            } else if (noteMiss(res.reason)) {
              vipPresent = false;
              intruderSinceRef.current = null;
            }
          } else if (noteMiss(res.reason)) {
            vipPresent = false;
            intruderSinceRef.current = null;
          }
        } catch {
          intruderSinceRef.current = null;
        }
      }

      syncAbsentMark(grace);

      if (now - lastHb >= SESSION_HB_MS) {
        lastHb = now;
        try {
          const hb = await sessionHeartbeat(cfg, sess.id, { pauseBilling: false });
          if (sessionRef.current) {
            sessionRef.current = { ...sessionRef.current, ...hb.session };
          }
          const bal =
            typeof hb.timeBalanceSeconds === "number"
              ? hb.timeBalanceSeconds
              : typeof hb.session?.time_balance_seconds === "number"
                ? hb.session.time_balance_seconds
                : null;
          if (bal != null) setBalanceSeconds(bal);
          const low = Boolean(hb.lowBalanceWarn) || (bal != null && bal > 0 && bal <= 300);
          setLowBalanceWarn(low);
          if (low && bal != null && !warnedLowRef.current) {
            warnedLowRef.current = true;
            onLowBalanceWarnRef.current?.(bal);
          }
          if (hb.timeDepleted || hb.session?.time_depleted) {
            await doEndSession("no_credit");
            return;
          }
        } catch {
          /* ledger */
        }
      }

      if (!cancelled) {
        presenceTimerRef.current = window.setTimeout(() => {
          tick().catch(() => undefined);
        }, PRESENCE_MS);
      }
    };

    lastHb = 0;
    tick().catch(() => undefined);

    return () => {
      cancelled = true;
      if (presenceTimerRef.current != null) {
        window.clearTimeout(presenceTimerRef.current);
        presenceTimerRef.current = null;
      }
    };
  }, [
    phase,
    config,
    sessionId,
    customerId,
    videoRef,
    streamRef,
    configRef,
    sessionRef,
    faceGraceUntilRef,
    absentSinceRef,
    presenceMissStreakRef,
    startCam,
    doEndSession,
    onIntruder,
    setBalanceSeconds,
    setLowBalanceWarn,
  ]);
}
