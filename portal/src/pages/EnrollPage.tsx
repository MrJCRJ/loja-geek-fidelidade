import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  attachCameraStream,
  captureFrame,
  openCamera,
  PortalCustomer,
} from "../api";
import BrandHeader from "../components/BrandHeader";
import OfflineBanner from "../components/OfflineBanner";
import GoogleReviewCta from "../components/GoogleReviewCta";
import { ENROLL_STEPS } from "../enrollSteps";
import { usePortalAutoEnroll } from "../hooks/usePortalAutoEnroll";
import { useProximityField } from "../hooks/useProximityField";
import { useReveal } from "../hooks/useReveal";

const WA_LAN = "https://wa.me/5575988603747?text=Oi%20preciso%20de%20ajuda%20com%20o%20cadastro%20facial";

export default function EnrollPage() {
  const { setRef, rootRef, rootVersion } = useReveal();
  useProximityField(rootRef, {}, rootVersion);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [consent, setConsent] = useState(false);
  const [started, setStarted] = useState(false);
  /** Stream pronto para anexar depois do React pintar o <video> em tamanho real. */
  const [pendingStream, setPendingStream] = useState<MediaStream | null>(null);
  const [videoLive, setVideoLive] = useState(false);
  const [camBusy, setCamBusy] = useState(false);
  const [initialSamples, setInitialSamples] = useState(0);
  const [maxSamples, setMaxSamples] = useState(5);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [manualBusy, setManualBusy] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const [runToken, setRunToken] = useState(0);
  const [autoPaused, setAutoPaused] = useState(false);

  const auto = usePortalAutoEnroll({
    videoRef,
    active: started && videoLive,
    paused: autoPaused,
    runToken,
    startFromSamples: initialSamples,
    onSampleSaved: (n) => setInitialSamples(n),
  });

  useEffect(() => {
    api<PortalCustomer>("/api/portal/me")
      .then((r) => {
        setInitialSamples(r.faceSamples);
        setMaxSamples(r.maxFaceSamples);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Erro"));

    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setPendingStream(null);
    setVideoLive(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
  }

  // Anexa o stream só depois do layout (vídeo em tamanho real — sem clip 1px).
  useLayoutEffect(() => {
    if (!started || !pendingStream) return;
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    setCamBusy(true);
    setError("");

    (async () => {
      try {
        await attachCameraStream(video, pendingStream);
        if (cancelled) return;
        setVideoLive(true);
        setPendingStream(null);
        setRunToken((t) => t + 1);
        setAutoPaused(false);
      } catch (err) {
        if (cancelled) return;
        stopCamera();
        setStarted(false);
        setError(err instanceof Error ? err.message : "Não foi possível abrir a câmera");
      } finally {
        if (!cancelled) setCamBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stopCamera estável o suficiente via refs
  }, [started, pendingStream]);

  async function onStart() {
    if (!consent) {
      setError("Aceite o consentimento LGPD para biometria.");
      return;
    }
    setError("");
    setMsg("");
    setCamBusy(true);
    setVideoLive(false);

    try {
      // Para stream anterior sem zerar started ainda
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setPendingStream(null);
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      }

      // Mostra o vídeo em tamanho real ANTES do getUserMedia (mobile precisa disso).
      setStarted(true);
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

      const stream = await openCamera();
      streamRef.current = stream;
      setPendingStream(stream);
      // attach fica no useLayoutEffect
    } catch (err) {
      stopCamera();
      setStarted(false);
      setCamBusy(false);
      setError(err instanceof Error ? err.message : "Não foi possível abrir a câmera");
    }
  }

  async function clearAndRestart() {
    if (
      !window.confirm(
        "Apagar todas as amostras faciais e cadastrar de novo? O GeekLock só reconhecerá você depois do novo cadastro.",
      )
    ) {
      return;
    }
    setClearBusy(true);
    setError("");
    setMsg("");
    try {
      await api<{ removed: number }>("/api/portal/enroll/reset", { method: "POST" });
      setInitialSamples(0);
      setStarted(false);
      setConsent(false);
      setAutoPaused(false);
      auto.reset();
      stopCamera();
      setMsg("Amostras apagadas. Marque o consentimento e toque em Começar.");
      setRunToken((t) => t + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao apagar amostras");
    } finally {
      setClearBusy(false);
    }
  }

  async function manualCapture() {
    if (!videoRef.current || !videoLive) {
      setError("Abra a câmera antes.");
      return;
    }
    setManualBusy(true);
    setAutoPaused(true);
    setError("");
    try {
      const imageBase64 = captureFrame(videoRef.current);
      const res = await api<{ faceSamples: number; tip?: string }>("/api/portal/enroll", {
        method: "POST",
        body: JSON.stringify({ imageBase64 }),
      });
      setInitialSamples(res.faceSamples);
      setRunToken((t) => t + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no enroll");
    } finally {
      setManualBusy(false);
      setAutoPaused(false);
    }
  }

  const samples = Math.max(auto.faceSamples, initialSamples);
  const done = auto.completed || samples >= maxSamples;

  return (
    <div className="shell shell--ambient page-in" ref={setRef}>
      <OfflineBanner />
      <BrandHeader size="sm" />
      <h1 className="display display--md" style={{ marginBottom: "0.35rem" }}>
        Cadastro facial
      </h1>
      <p className="lead">Posicione o rosto no oval — capturamos automaticamente a cada pose.</p>
      <div className="nav page-in-cta">
        <Link className="btn ghost prox" to="/dashboard">
          Voltar
        </Link>
      </div>

      {error ? (
        <div className="banner">
          {error}
          <div className="row" style={{ marginTop: "0.65rem" }}>
            <button className="btn prox" type="button" disabled={camBusy || !consent} onClick={onStart}>
              {camBusy ? "Abrindo…" : "Tentar de novo"}
            </button>
          </div>
        </div>
      ) : null}
      {msg ? <div className="banner ok">{msg}</div> : null}

      {done ? (
        <div className="card card--highlight reveal">
          <p className="section-label">Pronto</p>
          <h2>GeekLock liberado</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            {samples}/{maxSamples} amostras salvas. Vá à lan house Geeks, sente no PC e o sistema
            reconhece você.
          </p>
          <div className="row">
            <Link className="btn prox" to="/dashboard">
              Minha conta
            </Link>
            <button className="btn accent2 prox" type="button" disabled={clearBusy} onClick={clearAndRestart}>
              {clearBusy ? "Apagando…" : "Refazer cadastro facial"}
            </button>
            <a className="btn ghost prox" href={WA_LAN} target="_blank" rel="noreferrer">
              Ajuda no WhatsApp
            </a>
          </div>
        </div>
      ) : null}

      {done ? <GoogleReviewCta title="Cadastro facial ok — avalie a Geeks" /> : null}

      {!done ? (
        <div className="card reveal">
          <p className="section-label">Enroll</p>
          <h2>Captura facial</h2>
          <div className="enroll-progress">
            {ENROLL_STEPS.map((s, i) => (
              <span
                key={s.id}
                className={`enroll-step ${
                  i < samples ? "done" : i === auto.step && started ? "active" : "pending"
                }`}
              >
                {i + 1}. {s.label}
              </span>
            ))}
          </div>
          <p className="enroll-msg">
            {!started
              ? `${samples}/${maxSamples} amostras`
              : camBusy && !videoLive
                ? "Abrindo câmera…"
                : auto.message || `${samples}/${maxSamples} amostras`}
          </p>

          {/* Sempre em tamanho real (nunca 1px) — browsers mobile não entregam frame se o vídeo estiver clipado. */}
          <div
            className={`video-wrap ${videoLive ? "ready" : ""} overlay-${started ? auto.overlay : "idle"}`}
          >
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              controls={false}
              disablePictureInPicture
            />
            <div className="face-oval" aria-hidden />
            {started ? (
              <div className={`enroll-overlay ${auto.overlay}`}>
                {auto.overlay === "saved"
                  ? "Salvo!"
                  : auto.overlay === "ready"
                    ? "Bom!"
                    : auto.overlay === "detecting"
                      ? "…"
                      : auto.overlay === "error"
                        ? "Ajuste"
                        : ""}
              </div>
            ) : (
              <div className="video-placeholder">Câmera aparece aqui</div>
            )}
          </div>

          {!started ? (
            <>
              <label className="check">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>
                  Autorizo o uso da minha imagem para reconhecimento facial na loja (LGPD).
                </span>
              </label>
              <p className="muted" style={{ marginTop: 0 }}>
                Ao tocar em Começar, o navegador pede acesso à câmera. Use boa luz no rosto.
              </p>
              <div className="row">
                <button
                  className={`btn prox${camBusy ? " loading" : ""}`}
                  type="button"
                  onClick={onStart}
                  disabled={!consent || camBusy}
                >
                  {camBusy ? "Abrindo câmera…" : "Começar cadastro"}
                </button>
                {samples > 0 ? (
                  <button
                    className="btn ghost prox"
                    type="button"
                    disabled={clearBusy}
                    onClick={clearAndRestart}
                  >
                    {clearBusy ? "Apagando…" : "Apagar e recomeçar"}
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <div className="row">
                {!videoLive ? (
                  <button className="btn prox" type="button" disabled={camBusy} onClick={onStart}>
                    {camBusy ? "Abrindo…" : "Tentar abrir câmera"}
                  </button>
                ) : null}
                <button
                  className="btn ghost prox"
                  type="button"
                  disabled={manualBusy || auto.busy || !videoLive}
                  onClick={manualCapture}
                >
                  {manualBusy ? "Enviando…" : "Capturar agora"}
                </button>
                {samples > 0 ? (
                  <button
                    className="btn ghost prox"
                    type="button"
                    disabled={clearBusy}
                    onClick={clearAndRestart}
                  >
                    Apagar e recomeçar
                  </button>
                ) : null}
              </div>
              <p className="muted" style={{ marginTop: "0.75rem" }}>
                Siga as poses (frente, esquerda, direita, cima, sorriso). A foto é salva sozinha
                quando a pose estiver certa.
              </p>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
