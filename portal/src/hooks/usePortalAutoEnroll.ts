import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { api, captureFrame } from "../api";
import { ENROLL_STEPS, type EnrollOverlayState } from "../enrollSteps";
import {
  detectPoseFromVideo,
  loadFaceLandmarker,
  resetPoseClock,
  type PoseId,
} from "../facePose";

const LOOP_MS = 280;
const CONSECUTIVE_OK = 3;
/** Frames ruins seguidos necessários para zerar o streak (histerese). */
const FAIL_RESET = 2;
const PAUSE_AFTER_SAVE_MS = 1000;
const MIN_QUALITY = 0.25;

export type FacePreviewResult = {
  ok: boolean;
  code: string;
  tip: string;
  quality?: number;
  error?: string;
};

type Options = {
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Só true depois que o vídeo está com frames (attachCameraStream ok). */
  active: boolean;
  paused: boolean;
  runToken: number;
  startFromSamples?: number;
  onSampleSaved?: (faceSamples: number) => void;
  onComplete?: (faceSamples: number) => void;
};

export function usePortalAutoEnroll({
  videoRef,
  active,
  paused,
  runToken,
  startFromSamples = 0,
  onSampleSaved,
  onComplete,
}: Options) {
  const [step, setStep] = useState(0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [overlay, setOverlay] = useState<EnrollOverlayState>("idle");
  const [completed, setCompleted] = useState(false);
  const [faceSamples, setFaceSamples] = useState(startFromSamples);
  const [poseEngine, setPoseEngine] = useState<"mediapipe" | "api" | "loading">("loading");

  const runIdRef = useRef(0);
  const okStreakRef = useRef(0);
  const failStreakRef = useRef(0);
  const loopTimerRef = useRef<number | null>(null);

  // Callbacks e startFromSamples em refs — não reiniciam o loop a cada render.
  const onSampleSavedRef = useRef(onSampleSaved);
  const onCompleteRef = useRef(onComplete);
  const startFromSamplesRef = useRef(startFromSamples);
  const videoRefStable = useRef(videoRef);
  videoRefStable.current = videoRef;
  onSampleSavedRef.current = onSampleSaved;
  onCompleteRef.current = onComplete;
  startFromSamplesRef.current = startFromSamples;

  const reset = useCallback(() => {
    runIdRef.current += 1;
    okStreakRef.current = 0;
    failStreakRef.current = 0;
    resetPoseClock();
    setStep(0);
    setMessage("");
    setBusy(false);
    setOverlay("idle");
    setCompleted(false);
    setFaceSamples(0);
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

  // Só sincroniza UI; não cancela o loop em andamento.
  useEffect(() => {
    setFaceSamples(startFromSamples);
  }, [startFromSamples]);

  useEffect(() => {
    if (!active || paused) return;

    const initialSamples = startFromSamplesRef.current;
    const remaining = Math.max(0, ENROLL_STEPS.length - initialSamples);
    if (remaining <= 0) {
      setCompleted(true);
      setMessage("Cadastro facial completo.");
      setOverlay("saved");
      return;
    }

    const runId = ++runIdRef.current;
    okStreakRef.current = 0;
    failStreakRef.current = 0;
    resetPoseClock();
    let cancelled = false;
    let samples = initialSamples;

    const bumpFail = (tip: string, overlayState: EnrollOverlayState) => {
      failStreakRef.current += 1;
      if (failStreakRef.current >= FAIL_RESET) {
        okStreakRef.current = 0;
        failStreakRef.current = 0;
      }
      setOverlay(overlayState);
      const streakHint =
        okStreakRef.current > 0 ? ` (mantém… ${okStreakRef.current}/${CONSECUTIVE_OK})` : "";
      setMessage(`${tip}${streakHint}`);
    };

    const run = async () => {
      setBusy(true);
      setCompleted(false);
      setPoseEngine("loading");
      setMessage("Carregando detector de rosto…");

      const landmarker = await loadFaceLandmarker();
      if (cancelled || runIdRef.current !== runId) return;
      setPoseEngine(landmarker ? "mediapipe" : "api");
      if (!landmarker) {
        setMessage("Detector local indisponível — usando qualidade da loja.");
      }

      for (let i = 0; i < remaining; i += 1) {
        if (cancelled || runIdRef.current !== runId) return;
        const stepIndex = initialSamples + i;
        const current = ENROLL_STEPS[Math.min(stepIndex, ENROLL_STEPS.length - 1)];
        const poseId = current.id as PoseId;
        setStep(stepIndex);
        setOverlay("idle");
        setMessage(`Amostra ${stepIndex + 1}/${ENROLL_STEPS.length}: ${current.hint}`);
        okStreakRef.current = 0;
        failStreakRef.current = 0;

        while (!cancelled && runIdRef.current === runId) {
          const video = videoRefStable.current.current;
          if (!video || video.readyState < 2 || !video.videoWidth) {
            setOverlay("idle");
            setMessage("Aguardando câmera…");
            await sleep(LOOP_MS, runId);
            continue;
          }

          setOverlay("detecting");

          try {
            if (landmarker) {
              const pose = detectPoseFromVideo(landmarker, video, poseId);
              if (!pose.hasFace) {
                bumpFail(pose.tip, "idle");
                await sleep(LOOP_MS, runId);
                continue;
              }
              if (!pose.ok) {
                bumpFail(pose.tip, "error");
                await sleep(LOOP_MS, runId);
                continue;
              }
              failStreakRef.current = 0;
              okStreakRef.current += 1;
              setOverlay("ready");
              setMessage(`${pose.tip} (${okStreakRef.current}/${CONSECUTIVE_OK})`);
              if (okStreakRef.current < CONSECUTIVE_OK) {
                await sleep(LOOP_MS, runId);
                continue;
              }
            }

            const imageBase64 = captureFrame(video, 0.85);

            if (!landmarker) {
              const preview = await api<FacePreviewResult>("/api/portal/enroll/preview", {
                method: "POST",
                body: JSON.stringify({ imageBase64 }),
              });
              if (cancelled || runIdRef.current !== runId) return;

              if (preview.ok && (preview.quality == null || preview.quality >= MIN_QUALITY)) {
                failStreakRef.current = 0;
                okStreakRef.current += 1;
                setOverlay("ready");
                setMessage(`${preview.tip} (${okStreakRef.current}/${CONSECUTIVE_OK})`);
                if (okStreakRef.current < CONSECUTIVE_OK) {
                  await sleep(LOOP_MS, runId);
                  continue;
                }
              } else {
                bumpFail(preview.tip || preview.error || "Ajuste posição e luz", preview.code === "no_face" ? "idle" : "error");
                await sleep(LOOP_MS, runId);
                continue;
              }
            }

            setMessage(`Salvando: ${current.label}…`);
            const res = await api<{ ok: boolean; faceSamples: number; quality?: number; tip?: string }>(
              "/api/portal/enroll",
              { method: "POST", body: JSON.stringify({ imageBase64 }) },
            );
            if (cancelled || runIdRef.current !== runId) return;

            samples = res.faceSamples;
            setFaceSamples(samples);
            onSampleSavedRef.current?.(samples);
            setOverlay("saved");
            const q = res.quality != null ? ` (${Math.round(res.quality * 100)}%)` : "";
            setMessage(`“${current.label}” salvo${q}`);
            okStreakRef.current = 0;
            failStreakRef.current = 0;
            await sleep(PAUSE_AFTER_SAVE_MS, runId);
            break;
          } catch (err) {
            // Erro de rede/API: não zera de imediato — histerese
            bumpFail(err instanceof Error ? err.message : "Falha na captura", "error");
          }

          await sleep(LOOP_MS, runId);
        }
      }

      if (cancelled || runIdRef.current !== runId) return;
      setOverlay("saved");
      setMessage("Pronto! Vá à lan house e sente no PC.");
      setCompleted(true);
      setBusy(false);
      onCompleteRef.current?.(samples);
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
    // Intencional: só reinicia com active/paused/runToken — não com callbacks nem startFromSamples.
  }, [active, paused, runToken]);

  return {
    step,
    message,
    busy,
    overlay,
    completed,
    faceSamples,
    poseEngine,
    totalSteps: ENROLL_STEPS.length,
    reset,
    currentHint: ENROLL_STEPS[Math.min(step, ENROLL_STEPS.length - 1)]?.hint || "",
  };
}
