import { useEffect, useRef, type RefObject } from "react";
import {
  captureFrame,
  checkHealth,
  recognize,
  startSession,
} from "../api";
import {
  KEEP_STREAK_MIN_SCORE,
  STRONG_MATCH_SCORE,
  playUnlockChime,
  sessionStartErrorMessage,
  type Phase,
} from "../kiosk-helpers";
import type { Customer, GeekLockConfig, Session } from "../vite-env";

type MatchStreak = { id: string; count: number } | null;

type ScanSetters = {
  setScanning: (v: boolean) => void;
  setScanReason: (v: string | undefined) => void;
  setCustomer: (c: Customer | null) => void;
  setScore: (v: number | null) => void;
  setStatus: (v: string) => void;
  setWelcomeCustomer: (c: Customer | null) => void;
  setSession: (s: Session | null) => void;
  setElapsed: (v: number) => void;
};

type SessionRefs = {
  sessionStartedAtRef: RefObject<number | null>;
  absentSinceRef: RefObject<number | null>;
  presenceMissStreakRef: RefObject<number>;
  handoffStreakRef: RefObject<MatchStreak>;
};

type Args = {
  phase: Phase;
  config: GeekLockConfig | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  configRef: RefObject<GeekLockConfig | null>;
  unlockUi: () => Promise<void>;
} & ScanSetters &
  SessionRefs;

export function useRecognizeLoop({
  phase,
  config,
  videoRef,
  configRef,
  unlockUi,
  sessionStartedAtRef,
  absentSinceRef,
  presenceMissStreakRef,
  handoffStreakRef,
  setScanning,
  setScanReason,
  setCustomer,
  setScore,
  setStatus,
  setWelcomeCustomer,
  setSession,
  setElapsed,
}: Args) {
  const scanningRef = useRef(false);
  const scanTimerRef = useRef<number | null>(null);
  const noFaceStreakRef = useRef(0);
  const serviceDownStreakRef = useRef(0);
  const matchStreakRef = useRef<MatchStreak>(null);

  useEffect(() => {
    if (phase !== "locked" || !config?.stationToken) return;

    let cancelled = false;
    matchStreakRef.current = null;

    const scheduleNext = () => {
      const serviceDelay =
        serviceDownStreakRef.current > 0
          ? Math.min(5000 + serviceDownStreakRef.current * 1000, 15000)
          : null;
      const delay =
        serviceDelay ??
        (noFaceStreakRef.current >= 3 ? 2000 : matchStreakRef.current ? 1200 : 1500);
      scanTimerRef.current = window.setTimeout(() => {
        scanOnce().catch(() => scheduleNext());
      }, delay);
    };

    const scanOnce = async () => {
      if (cancelled || scanningRef.current) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth) {
        if (!cancelled) scheduleNext();
        return;
      }

      scanningRef.current = true;
      setScanning(true);
      try {
        const imageBase64 = captureFrame(video, 0.85);
        const res = await recognize(config, imageBase64);

        if (res.matched && res.customer && (res.score ?? 0) > 0) {
          noFaceStreakRef.current = 0;
          serviceDownStreakRef.current = 0;
          const scoreVal = res.score ?? 0;
          const prev = matchStreakRef.current;
          if (prev && prev.id === res.customer.id) {
            matchStreakRef.current = { id: res.customer.id, count: prev.count + 1 };
          } else {
            matchStreakRef.current = { id: res.customer.id, count: 1 };
          }

          const streak = matchStreakRef.current.count;
          const strongEnough = scoreVal >= STRONG_MATCH_SCORE;
          const confirmed = strongEnough || streak >= 2;

          setScanReason(undefined);
          setCustomer(res.customer);
          setScore(scoreVal);
          if (!confirmed) {
            setStatus(
              `Confirmando ${res.customer.name}… (${streak}/2 · ${(scoreVal * 100).toFixed(0)}%)`,
            );
            return;
          }

          const bal = typeof res.timeBalanceSeconds === "number" ? res.timeBalanceSeconds : null;
          if (bal != null && bal <= 0) {
            matchStreakRef.current = null;
            setWelcomeCustomer(null);
            setScanReason("no_credit");
            setStatus("Sem crédito — passe no caixa para liberar o PC");
            return;
          }

          setStatus(
            bal != null
              ? `VIP ${res.customer.name} — saldo ~${Math.floor(bal / 60)}m`
              : `VIP ${res.customer.name} reconhecido — liberando`,
          );
          setWelcomeCustomer({
            ...res.customer,
            timeBalanceSeconds: bal ?? undefined,
          });

          try {
            const started = await startSession(config, res.customer.id);
            if (cancelled) return;
            setSession(started.session);
            if (started.customer) setCustomer(started.customer);
            const startedAt = Date.parse(started.session.started_at);
            sessionStartedAtRef.current = Number.isFinite(startedAt) ? startedAt : Date.now();
            setElapsed(
              Math.max(0, Math.floor((Date.now() - sessionStartedAtRef.current) / 1000)),
            );
            absentSinceRef.current = null;
            presenceMissStreakRef.current = 0;
            handoffStreakRef.current = null;
            matchStreakRef.current = null;
            playUnlockChime();
            await unlockUi();
          } catch (err) {
            matchStreakRef.current = null;
            setWelcomeCustomer(null);
            const mapped = sessionStartErrorMessage(err);
            setScanReason(mapped.reason);
            setStatus(mapped.status);
          }
        } else {
          const reason = res.reason || "no_face";
          const best = typeof res.bestScore === "number" ? res.bestScore : 0;
          if (reason === "service_down") {
            serviceDownStreakRef.current += 1;
            setScanReason("service_down");
            setStatus(res.tip || "Serviço facial reiniciando…");
            const cfg = configRef.current;
            if (cfg) {
              checkHealth(cfg)
                .then((h) => {
                  if (h.faceService) serviceDownStreakRef.current = 0;
                })
                .catch(() => undefined);
            }
          } else {
            serviceDownStreakRef.current = 0;
            if (reason === "no_face") {
              noFaceStreakRef.current += 1;
              matchStreakRef.current = null;
            } else if (reason === "unknown" || reason === "ambiguous") {
              noFaceStreakRef.current = 0;
              if (!(matchStreakRef.current && best >= KEEP_STREAK_MIN_SCORE)) {
                matchStreakRef.current = null;
              }
            } else {
              noFaceStreakRef.current = 0;
              matchStreakRef.current = null;
            }

            if (typeof res.bestScore === "number") setScore(res.bestScore);
            setScanReason(reason);
            const tip =
              res.tip ||
              (reason === "no_face"
                ? "Posicione o rosto no oval"
                : best > 0
                  ? `Não confirmado (${(best * 100).toFixed(0)}%) — olhe de frente`
                  : "Não reconhecido");
            setStatus(tip);
          }
        }
      } catch (err) {
        matchStreakRef.current = null;
        setStatus(err instanceof Error ? err.message : "Erro no reconhecimento");
        setScanReason("error");
      } finally {
        scanningRef.current = false;
        setScanning(false);
        if (!cancelled) scheduleNext();
      }
    };

    scheduleNext();

    return () => {
      cancelled = true;
      if (scanTimerRef.current != null) {
        window.clearTimeout(scanTimerRef.current);
        scanTimerRef.current = null;
      }
    };
  }, [
    phase,
    config,
    unlockUi,
    videoRef,
    configRef,
    sessionStartedAtRef,
    absentSinceRef,
    presenceMissStreakRef,
    handoffStreakRef,
    setScanning,
    setScanReason,
    setCustomer,
    setScore,
    setStatus,
    setWelcomeCustomer,
    setSession,
    setElapsed,
  ]);
}
