import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  api,
  attachCameraStream,
  captureFrame,
  openUserCamera,
  type Customer,
} from "../../api";
import { ENROLL_STEPS } from "../../enrollSteps";
import { useAutoEnroll } from "../../hooks/useAutoEnroll";
import type { Tab } from "../types";

type ToastFn = (msg: string, kind?: "ok" | "error" | "info") => void;

type Args = {
  tab: Tab;
  setTab: (t: Tab) => void;
  selected: Customer | null;
  setSelected: (c: Customer | null) => void;
  refreshNow: () => Promise<void>;
  setError: (msg: string) => void;
  toast: ToastFn;
};

export function useAdminEnrollCamera({
  tab,
  setTab,
  selected,
  setSelected,
  refreshNow,
  setError,
  toast,
}: Args) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const camBusyRef = useRef(false);

  const [enrollMsg, setEnrollMsg] = useState("");
  const [camLoading, setCamLoading] = useState(false);
  const [camReady, setCamReady] = useState(false);
  const [enrollStep, setEnrollStep] = useState(0);
  const [enrollBusy, setEnrollBusy] = useState(false);
  const [autoEnrollActive, setAutoEnrollActive] = useState(false);
  const [autoEnrollPaused, setAutoEnrollPaused] = useState(false);
  const [autoEnrollToken, setAutoEnrollToken] = useState(0);

  const autoEnroll = useAutoEnroll({
    customerId: selected?.id ?? null,
    videoRef,
    active: autoEnrollActive && camReady && tab === "clientes",
    paused: autoEnrollPaused,
    runToken: autoEnrollToken,
    refresh: refreshNow,
    onCustomerUpdated: setSelected,
    onComplete: () => setAutoEnrollActive(false),
  });

  const startCamInternal = async () => {
    if (camBusyRef.current) return false;
    camBusyRef.current = true;
    setCamLoading(true);
    setError("");
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const stream = await openUserCamera();
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setCamReady(false);
        return false;
      }
      await attachCameraStream(video, stream);
      setCamReady(true);
      setEnrollMsg("Câmera ativa.");
      return true;
    } catch (err) {
      setCamReady(false);
      setError(err instanceof Error ? err.message : "Falha na câmera");
      return false;
    } finally {
      camBusyRef.current = false;
      setCamLoading(false);
    }
  };

  const stopCam = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamReady(false);
    setAutoEnrollActive(false);
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => () => stopCam(), [stopCam]);

  useEffect(() => {
    if (tab !== "clientes") stopCam();
  }, [tab, stopCam]);

  const beginAutoEnroll = useCallback(async (customer: Customer) => {
    setSelected(customer);
    setTab("clientes");
    setEnrollStep(0);
    setEnrollMsg("");
    setAutoEnrollPaused(false);
    setAutoEnrollActive(true);
    await startCamInternal();
    setAutoEnrollToken((t) => t + 1);
  }, [setSelected, setTab]);

  const enrollFace = async () => {
    if (!selected || !videoRef.current) return;
    if (videoRef.current.readyState < 2 || !videoRef.current.videoWidth) {
      setEnrollMsg("Aguarde a câmera estabilizar.");
      return;
    }
    setEnrollBusy(true);
    const step = ENROLL_STEPS[enrollStep] ?? ENROLL_STEPS[0];
    setEnrollMsg(`Capturando: ${step.label}…`);
    try {
      const imageBase64 = captureFrame(videoRef.current, 0.85);
      const res = await api<{ ok: boolean; quality?: number }>(`/api/customers/${selected.id}/enroll`, {
        method: "POST",
        body: JSON.stringify({ imageBase64 }),
      });
      const q = res.quality != null ? ` (qualidade ${(res.quality * 100).toFixed(0)}%)` : "";
      const next = enrollStep + 1;
      if (next < ENROLL_STEPS.length) {
        setEnrollStep(next);
        setEnrollMsg(`Amostra “${step.label}” salva${q}. Próximo: ${ENROLL_STEPS[next].hint}`);
      } else {
        setEnrollStep(0);
        setEnrollMsg(`Enroll completo (5 ângulos)${q}.`);
        toast("Enroll completo", "ok");
      }
      await refreshNow();
      const updated = await api<Customer>(`/api/customers/${selected.id}`);
      setSelected(updated);
    } catch (err) {
      setEnrollMsg(err instanceof Error ? err.message : "Falha no enroll");
    } finally {
      setEnrollBusy(false);
    }
  };

  return {
    videoRef: videoRef as RefObject<HTMLVideoElement | null>,
    camLoading,
    camReady,
    enrollStep,
    setEnrollStep,
    enrollBusy,
    enrollMsg,
    setEnrollMsg,
    autoEnrollActive,
    setAutoEnrollActive,
    autoEnrollPaused,
    setAutoEnrollPaused,
    setAutoEnrollToken,
    autoEnroll,
    startCam: () => startCamInternal(),
    stopCam,
    enrollFace,
    beginAutoEnroll,
  };
}
