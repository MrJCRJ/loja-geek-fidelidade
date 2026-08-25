import { useEffect, useRef, type RefObject } from "react";
import {
  captureFrame,
  checkPresence,
  sessionHeartbeat,
  startSession,
} from "../api";
import {
  DEFAULT_ABSENT_SEC,
  PRESENCE_MS,
  SESSION_HB_MS,
  STRONG_MATCH_SCORE,
  playUnlockChime,
  sessionStartErrorMessage,
  type Phase,
} from "../kiosk-helpers";
import type { Customer, GeekLockConfig, Session } from "../vite-env";

type MatchStreak = { id: string; count: number } | null;

type Args = {
  phase: Phase;
  config: GeekLockConfig | null;
  session: Session | null;
  customerId?: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  streamRef: RefObject<MediaStream | null>;
  configRef: RefObject<GeekLockConfig | null>;
  sessionRef: RefObject<Session | null>;
  sessionStartedAtRef: RefObject<number | null>;
  absentSinceRef: RefObject<number | null>;
  presenceMissStreakRef: RefObject<number>;
  handoffStreakRef: RefObject<MatchStreak>;
  handoffBusyRef: RefObject<boolean>;
  startCam: () => Promise<void>;
  doEndSession: (reason: string) => Promise<void>;
  setSession: (s: Session | null) => void;
  setCustomer: (c: Customer | null) => void;
  setElapsed: (v: number) => void;
  setAbsentLeft: (v: number | null) => void;
  setStatus: (v: string) => void;
};

export function usePresenceLoop({
  phase,
  config,
  session,
  customerId,
  videoRef,
  streamRef,
  configRef,
  sessionRef,
  sessionStartedAtRef,
  absentSinceRef,
  presenceMissStreakRef,
  handoffStreakRef,
  handoffBusyRef,
  startCam,
  doEndSession,
  setSession,
  setCustomer,
  setElapsed,
  setAbsentLeft,
  setStatus,
}: Args) {
  const presenceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (phase !== "unlocked" || !config?.stationToken) return;
    if (customerId === "staff") return;
    if (!session) return;

    if (!streamRef.current?.active) {
      startCam().catch(() => undefined);
    }

    let cancelled = false;
    let lastHb = 0;

    const tick = async () => {
      if (cancelled) return;
      const cfg = configRef.current;
      const sess = sessionRef.current;
      if (!cfg) return;

      const now = Date.now();
      if (sess && now - lastHb >= SESSION_HB_MS) {
        lastHb = now;
        try {
          const hb = await sessionHeartbeat(cfg, sess.id);
          setSession(hb.session);
          if (hb.timeDepleted || hb.session?.time_depleted) {
            await doEndSession("no_credit");
            return;
          }
        } catch {
          /* ledger pode falhar — timer local continua */
        }
      }

      const limitSec = cfg.absentSecondsToLock || DEFAULT_ABSENT_SEC;
      const limitMs = limitSec * 1000;

      if (!videoRef.current || videoRef.current.readyState < 2) {
        presenceMissStreakRef.current += 1;
        if (presenceMissStreakRef.current >= 3 && absentSinceRef.current == null) {
          absentSinceRef.current = Date.now();
        }
      } else {
        try {
          const imageBase64 = captureFrame(videoRef.current, 0.85);
          const vipId = sessionRef.current?.customer_id || customerId;
          const res = await checkPresence(cfg, imageBase64, vipId);
          if (res.reason === "service_down") {
            presenceMissStreakRef.current = 0;
          } else if (res.present) {
            presenceMissStreakRef.current = 0;
            handoffStreakRef.current = null;
            absentSinceRef.current = null;
            setAbsentLeft(null);
          } else {
            const otherId = res.bestCustomerId || null;
            const otherScore = res.bestScore ?? 0;
            const canHandoff =
              !!otherId &&
              otherId !== vipId &&
              (res.reason === "other_vip" || otherScore >= STRONG_MATCH_SCORE);

            if (canHandoff && !handoffBusyRef.current) {
              const prev = handoffStreakRef.current;
              if (prev && prev.id === otherId) {
                handoffStreakRef.current = { id: otherId, count: prev.count + 1 };
              } else {
                handoffStreakRef.current = { id: otherId, count: 1 };
              }
              if (handoffStreakRef.current.count >= 2) {
                handoffBusyRef.current = true;
                try {
                  const started = await startSession(cfg, otherId);
                  if (cancelled) return;
                  setSession(started.session);
                  if (started.customer) {
                    setCustomer(started.customer);
                  } else {
                    setCustomer({
                      id: otherId,
                      name: started.session.customer_name || "VIP",
                      level: "bronze",
                      points: 0,
                    });
                  }
                  const startedAt = Date.parse(started.session.started_at);
                  sessionStartedAtRef.current = Number.isFinite(startedAt) ? startedAt : Date.now();
                  setElapsed(0);
                  presenceMissStreakRef.current = 0;
                  handoffStreakRef.current = null;
                  absentSinceRef.current = null;
                  setAbsentLeft(null);
                  setStatus(`Sessão: ${started.session.customer_name || "VIP"}`);
                  playUnlockChime();
                } catch (err) {
                  handoffStreakRef.current = null;
                  const mapped = sessionStartErrorMessage(err);
                  if (mapped.reason === "no_credit") {
                    setStatus("Outro VIP sem crédito — aguardando ausência");
                  }
                  presenceMissStreakRef.current += 1;
                  if (presenceMissStreakRef.current >= 3 && absentSinceRef.current == null) {
                    absentSinceRef.current = Date.now();
                  }
                } finally {
                  handoffBusyRef.current = false;
                }
              }
            } else {
              handoffStreakRef.current = null;
              presenceMissStreakRef.current += 1;
              if (presenceMissStreakRef.current >= 3 && absentSinceRef.current == null) {
                absentSinceRef.current = Date.now();
              }
            }
          }
        } catch {
          presenceMissStreakRef.current += 1;
          if (presenceMissStreakRef.current >= 3 && absentSinceRef.current == null) {
            absentSinceRef.current = Date.now();
          }
        }
      }

      if (absentSinceRef.current != null) {
        const left = Math.ceil((limitMs - (Date.now() - absentSinceRef.current)) / 1000);
        setAbsentLeft(Math.max(0, left));
        if (left <= 0) {
          await doEndSession("absent");
          return;
        }
      } else {
        setAbsentLeft(null);
      }

      if (!cancelled) {
        presenceTimerRef.current = window.setTimeout(() => {
          tick().catch(() => undefined);
        }, PRESENCE_MS);
      }
    };

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
    session,
    customerId,
    videoRef,
    streamRef,
    configRef,
    sessionRef,
    sessionStartedAtRef,
    absentSinceRef,
    presenceMissStreakRef,
    handoffStreakRef,
    handoffBusyRef,
    startCam,
    doEndSession,
    setSession,
    setCustomer,
    setElapsed,
    setAbsentLeft,
    setStatus,
  ]);
}
