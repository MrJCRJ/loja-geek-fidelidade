import type { RefObject } from "react";
import { api, type Customer } from "../../api";
import { ENROLL_STEPS } from "../../enrollSteps";

type AutoEnrollApi = {
  step: number;
  busy: boolean;
  overlay: string;
  message: string;
  completed: boolean;
  reset: () => void;
  restart: () => void;
};

type Props = {
  selected: Customer;
  videoRef: RefObject<HTMLVideoElement | null>;
  camLoading: boolean;
  camReady: boolean;
  enrollStep: number;
  setEnrollStep: (n: number) => void;
  enrollBusy: boolean;
  enrollMsg: string;
  setEnrollMsg: (s: string) => void;
  autoEnrollActive: boolean;
  setAutoEnrollActive: (v: boolean) => void;
  autoEnrollPaused: boolean;
  setAutoEnrollPaused: (v: boolean | ((p: boolean) => boolean)) => void;
  setAutoEnrollToken: (fn: (t: number) => number) => void;
  autoEnroll: AutoEnrollApi;
  startCam: () => void;
  stopCam: () => void;
  enrollFace: () => void;
  setSelected: (c: Customer | null) => void;
  refresh: () => Promise<void>;
  onError: (msg: string) => void;
  onToast: (msg: string, kind?: "ok" | "error" | "info") => void;
  askConfirm: (opts: {
    title: string;
    message: string;
    danger?: boolean;
    confirmLabel?: string;
  }) => Promise<boolean>;
};

export function ClienteEnrollPanel({
  selected,
  videoRef,
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
  startCam,
  stopCam,
  enrollFace,
  setSelected,
  refresh,
  onError,
  onToast,
  askConfirm,
}: Props) {
  const currentStep = autoEnrollActive ? autoEnroll.step : enrollStep;
  const statusMessage = autoEnrollActive ? autoEnroll.message : enrollMsg;

  return (
    <>
      <p>
        <strong>{selected.name}</strong>{" "}
        <span className={`tag ${selected.level}`}>{selected.level}</span>
        {(selected.face_samples ?? 0) === 0 ? (
          <span className="tag noface" style={{ marginLeft: 6 }}>
            Sem face
          </span>
        ) : null}{" "}
        · {selected.points} pts · {selected.face_samples ?? 0} amostras
      </p>
      <div className="enroll-progress">
        {ENROLL_STEPS.map((s, i) => {
          const stepState =
            autoEnroll.overlay === "saved" && i === currentStep
              ? "done"
              : i === currentStep
                ? autoEnroll.busy
                  ? "capturing"
                  : "active"
                : i < currentStep
                  ? "done"
                  : "pending";
          return (
            <span key={s.id} className={`enroll-step ${stepState}`}>
              {i + 1}. {s.label}
            </span>
          );
        })}
      </div>
      <p className="muted">{ENROLL_STEPS[currentStep]?.hint}</p>
      <div className="video-wrap">
        <video ref={videoRef} muted playsInline autoPlay />
        <div
          className={`face-guide enroll-overlay-${autoEnrollActive ? autoEnroll.overlay : "idle"}`}
          aria-hidden
        />
        <p className="face-guide-label">{autoEnrollActive ? "Captura automática" : "Centralize o rosto"}</p>
      </div>
      <div className="row" style={{ marginTop: "0.75rem" }}>
        <button className="btn" type="button" disabled={camLoading} onClick={() => startCam()}>
          {camLoading ? "Abrindo câmera…" : "Ligar câmera"}
        </button>
        {autoEnrollActive && (
          <button
            className="btn"
            type="button"
            onClick={() => setAutoEnrollPaused((p) => !p)}
            disabled={autoEnroll.completed}
          >
            {autoEnrollPaused ? "Retomar automático" : "Pausar automático"}
          </button>
        )}
        {!autoEnrollActive && (
          <button
            className="btn"
            type="button"
            disabled={!camReady || camLoading}
            onClick={() => {
              setAutoEnrollPaused(false);
              setAutoEnrollActive(true);
              setAutoEnrollToken((t) => t + 1);
            }}
          >
            Iniciar captura automática
          </button>
        )}
        <button
          className="btn ghost"
          type="button"
          disabled={enrollBusy || camLoading || autoEnroll.busy}
          onClick={() => enrollFace()}
        >
          {enrollBusy ? "Capturando…" : `Captura manual: ${ENROLL_STEPS[enrollStep]?.label ?? "amostra"}`}
        </button>
        <button
          className="btn ghost"
          type="button"
          onClick={() => {
            autoEnroll.reset();
            setAutoEnrollActive(false);
            setAutoEnrollPaused(false);
            setEnrollStep(0);
            setEnrollMsg("Progresso reiniciado.");
          }}
        >
          Reiniciar progresso
        </button>
        <button
          className="btn ghost"
          type="button"
          disabled={!selected || (selected.face_samples ?? 0) === 0}
          onClick={async () => {
            const ok = await askConfirm({
              title: "Zerar amostras",
              message: `Apagar as ${selected.face_samples ?? 0} amostras faciais de ${selected.name}?`,
              danger: true,
              confirmLabel: "Apagar",
            });
            if (!ok) return;
            try {
              const res = await api<{ customer?: Customer; removed?: number }>(
                `/api/customers/${selected.id}/enroll`,
                { method: "DELETE" },
              );
              if (res.customer) setSelected(res.customer);
              await refresh();
              autoEnroll.reset();
              setAutoEnrollActive(false);
              setEnrollStep(0);
              setEnrollMsg(`Amostras apagadas (${res.removed ?? 0}).`);
              onToast("Amostras apagadas", "ok");
            } catch (e) {
              onError(e instanceof Error ? e.message : "Falha ao zerar");
            }
          }}
        >
          Zerar amostras
        </button>
        {autoEnroll.completed && (
          <button
            className="btn ghost"
            type="button"
            onClick={async () => {
              if ((selected.face_samples ?? 0) > 0) {
                const ok = await askConfirm({
                  title: "Refazer enroll",
                  message: "Apagar amostras atuais e refazer o enroll do zero?",
                  danger: true,
                });
                if (!ok) return;
                await api(`/api/customers/${selected.id}/enroll`, { method: "DELETE" });
                await refresh();
                const updated = await api<Customer>(`/api/customers/${selected.id}`);
                setSelected(updated);
              }
              autoEnroll.restart();
              setAutoEnrollPaused(false);
              setAutoEnrollActive(true);
              setAutoEnrollToken((t) => t + 1);
              setEnrollStep(0);
              setEnrollMsg("Recomeçando enroll…");
            }}
          >
            Refazer enroll
          </button>
        )}
        <button className="btn ghost" type="button" onClick={stopCam}>
          Parar
        </button>
      </div>
      {statusMessage ? <p>{statusMessage}</p> : null}
    </>
  );
}

export type { AutoEnrollApi };
