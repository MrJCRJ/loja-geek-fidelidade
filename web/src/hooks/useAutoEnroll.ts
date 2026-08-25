import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { api, captureFrame, type Customer } from "../api";
import { ENROLL_STEPS, type EnrollOverlayState } from "../enrollSteps";

const PREVIEW_MS = 900;
const CONSECUTIVE_OK = 2;
const PAUSE_AFTER_SAVE_MS = 1200;
const MIN_QUALITY = 0.25;

export type FacePreviewResult = {
  ok: boolean;
  code: string;
  tip: string;
  quality?: number;
  error?: string;
};

type UseAutoEnrollOptions = {
  customerId: string | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  active: boolean;
  paused: boolean;
  runToken: number;
  onComplete?: () => void;
  refresh?: () => Promise<void>;
  onCustomerUpdated?: (customer: Customer) => void;
};

export function useAutoEnroll({
  customerId,
  videoRef,
  active,
  paused,
  runToken,
  onComplete,
  refresh,
  onCustomerUpdated,
}: UseAutoEnrollOptions) {
  const [step, setStep] = useState(0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [overlay, setOverlay] = useState<EnrollOverlayState>("idle");
  const [completed, setCompleted] = useState(false);

  const runIdRef = useRef(0);
  const okStreakRef = useRef(0);
  const loopTimerRef = useRef<number | null>(null);

  const reset = useCallback(() => {
    runIdRef.current += 1;
    okStreakRef.current = 0;
    setStep(0);
    setMessage("");
    setBusy(false);
    setOverlay("idle");
    setCompleted(false);
    if (loopTimerRef.current != null) {
      window.clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }
  }, []);

  const sleep = (ms: number, runId: number) =>
    new Promise<void>((resolve) => {
      loopTimerRef.current = window.setTimeout(() => {
        if (runIdRef.current === runId) resolve();
      }, ms);
    });

  useEffect(() => {
    if (!active || !customerId || paused) return;

    const runId = ++runIdRef.current;
    okStreakRef.current = 0;
    let cancelled = false;

    const run = async () => {
      setBusy(true);
      setCompleted(false);

      for (let stepIndex = 0; stepIndex < ENROLL_STEPS.length; stepIndex += 1) {
        if (cancelled || runIdRef.current !== runId) return;

        const current = ENROLL_STEPS[stepIndex];
        setStep(stepIndex);
        setOverlay("idle");
        setMessage(`Amostra ${stepIndex + 1}/${ENROLL_STEPS.length}: ${current.hint}`);
        okStreakRef.current = 0;

        while (!cancelled && runIdRef.current === runId) {
          const video = videoRef.current;
          if (!video || video.readyState < 2 || !video.videoWidth) {
            setOverlay("idle");
            setMessage("Aguardando câmera estabilizar…");
            await sleep(PREVIEW_MS, runId);
            continue;
          }

          setOverlay("detecting");
          try {
            const imageBase64 = captureFrame(video, 0.85);
            const preview = await api<FacePreviewResult>("/api/face/preview", {
              method: "POST",
              body: JSON.stringify({ imageBase64 }),
            });

            if (cancelled || runIdRef.current !== runId) return;

            if (preview.ok && (preview.quality == null || preview.quality >= MIN_QUALITY)) {
              okStreakRef.current += 1;
              setOverlay("ready");
              setMessage(`${preview.tip} (${okStreakRef.current}/${CONSECUTIVE_OK})`);

              if (okStreakRef.current >= CONSECUTIVE_OK) {
                setMessage(`Salvando: ${current.label}…`);
                const res = await api<{ ok: boolean; quality?: number }>(
                  `/api/customers/${customerId}/enroll`,
                  { method: "POST", body: JSON.stringify({ imageBase64 }) },
                );
                if (cancelled || runIdRef.current !== runId) return;

                const q =
                  res.quality != null ? ` (qualidade ${(res.quality * 100).toFixed(0)}%)` : "";
                setOverlay("saved");
                setMessage(`Amostra “${current.label}” salva${q}!`);
                okStreakRef.current = 0;
                await refresh?.();
                const updated = await api<Customer>(`/api/customers/${customerId}`);
                onCustomerUpdated?.(updated);
                await sleep(PAUSE_AFTER_SAVE_MS, runId);
                break;
              }
            } else {
              okStreakRef.current = 0;
              setOverlay(preview.code === "no_face" ? "idle" : "error");
              setMessage(preview.tip || preview.error || "Ajuste posição e luz");
            }
          } catch (err) {
            okStreakRef.current = 0;
            setOverlay("error");
            setMessage(err instanceof Error ? err.message : "Falha na captura");
          }

          await sleep(PREVIEW_MS, runId);
        }
      }

      if (cancelled || runIdRef.current !== runId) return;
      setStep(0);
      setOverlay("saved");
      setMessage("Enroll completo — 5 amostras salvas.");
      setCompleted(true);
      setBusy(false);
      onComplete?.();
    };

    run().catch(() => {
      if (!cancelled) {
        setOverlay("error");
        setMessage("Enroll automático interrompido.");
        setBusy(false);
      }
    });

    return () => {
      cancelled = true;
      runIdRef.current += 1;
      if (loopTimerRef.current != null) {
        window.clearTimeout(loopTimerRef.current);
        loopTimerRef.current = null;
      }
    };
  }, [active, customerId, paused, runToken, videoRef, refresh, onComplete, onCustomerUpdated]);

  const restart = useCallback(() => {
    reset();
  }, [reset]);

  return {
    step,
    message,
    busy,
    overlay,
    completed,
    reset,
    restart,
  };
}
