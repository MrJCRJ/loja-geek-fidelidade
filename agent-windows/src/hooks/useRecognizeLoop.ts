import { useEffect, useRef, type RefObject } from "react";
import {
  captureFrame,
  checkHealth,
  recognize,
} from "../api";
import {
  FACE_GRACE_MS,
  KEEP_STREAK_MIN_SCORE,
  STRONG_MATCH_SCORE,
  type Phase,
} from "../kiosk-helpers";
import type { Customer, GeekLockConfig } from "../vite-env";

type MatchStreak = { id: string; count: number } | null;

export type PendingLogin = {
  customer: Customer;
  score: number;
  timeBalanceSeconds: number | null;
};

type ScanSetters = {
  setScanning: (v: boolean) => void;
  setScanReason: (v: string | undefined) => void;
  setCustomer: (c: Customer | null) => void;
  setScore: (v: number | null) => void;
  setStatus: (v: string) => void;
  setWelcomeCustomer: (c: Customer | null) => void;
};

type Args = {
  phase: Phase;
  config: GeekLockConfig | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  configRef: RefObject<GeekLockConfig | null>;
  faceGraceUntilRef: RefObject<number>;
  scanPaused: boolean;
  declinedLoginRef: RefObject<{ id: string; until: number } | null>;
  onMatchConfirmed: (pending: PendingLogin) => void | Promise<void>;
} & ScanSetters;

function faceGraceLeft(faceGraceUntilRef: RefObject<number>) {
  return Math.max(0, (faceGraceUntilRef.current || 0) - Date.now());
}

export function useRecognizeLoop({
  phase,
  config,
  videoRef,
  configRef,
  faceGraceUntilRef,
  scanPaused,
  declinedLoginRef,
  onMatchConfirmed,
  setScanning,
  setScanReason,
  setCustomer,
  setScore,
  setStatus,
  setWelcomeCustomer,
}: Args) {
  const scanningRef = useRef(false);
  const scanTimerRef = useRef<number | null>(null);
  const noFaceStreakRef = useRef(0);
  const serviceDownStreakRef = useRef(0);
  const matchStreakRef = useRef<MatchStreak>(null);
  const onMatchConfirmedRef = useRef(onMatchConfirmed);

  useEffect(() => {
    onMatchConfirmedRef.current = onMatchConfirmed;
  }, [onMatchConfirmed]);

  useEffect(() => {
    if (phase !== "locked" || !config?.stationToken || scanPaused) return;

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
      if (cancelled || scanningRef.current || scanPaused) return;
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
          const declined = declinedLoginRef.current;
          if (declined && declined.id === res.customer.id && Date.now() < declined.until) {
            setScanReason("unknown");
            setStatus("Entrada cancelada — aguarde ou peça ajuda no balcão");
            return;
          }

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
            setScanReason("no_credit");
            setStatus("Sem crédito — passe no caixa para liberar o PC");
            setWelcomeCustomer({
              ...res.customer,
              timeBalanceSeconds: 0,
            });
            setCustomer(res.customer);
            setScore(scoreVal);
            return;
          }

          matchStreakRef.current = null;
          setWelcomeCustomer(null);
          setStatus(`Olá, ${res.customer.name}! Deseja entrar nesta máquina?`);
          await Promise.resolve(onMatchConfirmedRef.current({
            customer: res.customer,
            score: scoreVal,
            timeBalanceSeconds: bal,
          }));
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
            const graceSec = Math.ceil(faceGraceLeft(faceGraceUntilRef) / 1000);
            const inGrace = graceSec > 0;

            if (reason === "no_face") {
              noFaceStreakRef.current += 1;
              if (!inGrace) matchStreakRef.current = null;
              setWelcomeCustomer(null);
            } else if (reason === "unknown" || reason === "ambiguous") {
              noFaceStreakRef.current = 0;
              if (!(matchStreakRef.current && best >= KEEP_STREAK_MIN_SCORE)) {
                if (!inGrace) matchStreakRef.current = null;
              }
            } else if (inGrace && (reason === "low_quality" || reason === "face_too_far")) {
              noFaceStreakRef.current = 0;
            } else {
              noFaceStreakRef.current = 0;
              if (!inGrace) matchStreakRef.current = null;
            }

            if (typeof res.bestScore === "number") setScore(res.bestScore);

            if (inGrace && reason !== "unknown" && reason !== "ambiguous" && reason !== "no_gallery") {
              setScanReason(undefined);
              setStatus(`Analisando rosto… (${graceSec}s)`);
            } else {
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
        }
      } catch (err) {
        matchStreakRef.current = null;
        setStatus(err instanceof Error ? err.message : "Erro no reconhecimento");
        setScanReason("error");
      } finally {
        scanningRef.current = false;
        setScanning(false);
        if (!cancelled && !scanPaused) scheduleNext();
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
    scanPaused,
    videoRef,
    configRef,
    faceGraceUntilRef,
    declinedLoginRef,
    setScanning,
    setScanReason,
    setCustomer,
    setScore,
    setStatus,
    setWelcomeCustomer,
  ]);
}
