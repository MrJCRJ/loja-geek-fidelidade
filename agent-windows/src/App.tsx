import { useCallback, useEffect, useRef, useState } from "react";
import {
  attachCameraStream,
  checkHealth,
  claimStation,
  endSession,
  heartbeat,
  openUserCamera,
} from "./api";
import { StationSocket, type StationCommand } from "./ws";
import { SetupWizard } from "./SetupWizard";
import { reportTelemetry } from "./telemetry";
import { LockedScreen } from "./LockedScreen";
import { OfflineScreen } from "./OfflineScreen";
import { RemoteBannerOverlay } from "./RemoteBannerOverlay";
import { scanVisualFromReason, type Phase, type RemoteBanner } from "./kiosk-helpers";
import { useRecognizeLoop } from "./hooks/useRecognizeLoop";
import { usePresenceLoop } from "./hooks/usePresenceLoop";
import type { Customer, GeekLockConfig, Session } from "./vite-env";

export default function App() {
  const [config, setConfig] = useState<GeekLockConfig | null>(null);
  const [phase, setPhase] = useState<Phase>("boot");
  const [status, setStatus] = useState("Iniciando...");
  const [scanReason, setScanReason] = useState<string | undefined>();
  const [scanning, setScanning] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [welcomeCustomer, setWelcomeCustomer] = useState<Customer | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [absentLeft, setAbsentLeft] = useState<number | null>(null);
  const [pin, setPin] = useState("");
  const [pinMode, setPinMode] = useState<"unlock" | "quit" | null>(null);
  const [error, setError] = useState("");
  const [camReady, setCamReady] = useState(false);
  const [remoteBanner, setRemoteBanner] = useState<RemoteBanner | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const absentSinceRef = useRef<number | null>(null);
  const presenceMissStreakRef = useRef(0);
  const handoffStreakRef = useRef<{ id: string; count: number } | null>(null);
  const handoffBusyRef = useRef(false);
  const sessionRef = useRef<Session | null>(null);
  const customerRef = useRef<Customer | null>(null);
  const configRef = useRef<GeekLockConfig | null>(null);
  const phaseRef = useRef<Phase>("boot");
  const camRetryRef = useRef<number | null>(null);
  /** Epoch ms do início da sessão (timer local). */
  const sessionStartedAtRef = useRef<number | null>(null);
  const absentLeftRef = useRef<number | null>(null);
  const stationWsRef = useRef<StationSocket | null>(null);

  useEffect(() => {
    absentLeftRef.current = absentLeft;
  }, [absentLeft]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  useEffect(() => {
    customerRef.current = customer;
  }, [customer]);
  useEffect(() => {
    configRef.current = config;
  }, [config]);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const stopCam = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const startCam = useCallback(async () => {
    stopCam();
    setCamReady(false);
    try {
      const stream = await openUserCamera();
      streamRef.current = stream;
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        streamRef.current = null;
        setCamReady(false);
        setError("Câmera desconectada — tentando reconectar…");
      });
      if (videoRef.current) {
        await attachCameraStream(videoRef.current, stream);
      }
      setCamReady(true);
      setError("");
    } catch (err) {
      setCamReady(false);
      setError(err instanceof Error ? err.message : "Falha na câmera");
      throw err;
    }
  }, []);

  const lockUi = useCallback(async () => {
    await window.geeklock.lock();
    setPhase("locked");
    setStatus("Aguardando VIP...");
    setScanReason(undefined);
    setWelcomeCustomer(null);
    setAbsentLeft(null);
    sessionStartedAtRef.current = null;
    try {
      await startCam();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na câmera");
    }
  }, [startCam]);

  const unlockUi = useCallback(async () => {
    await window.geeklock.unlock();
    setPhase("unlocked");
    setStatus("Sessão ativa");
    setWelcomeCustomer(null);
  }, []);

  // Reanexa stream ao <video> após trocar locked ↔ unlocked (remount)
  useEffect(() => {
    if (phase !== "unlocked" && phase !== "locked") return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream?.active) return;
    if (video.srcObject !== stream) {
      attachCameraStream(video, stream).catch(() => {
        startCam().catch(() => undefined);
      });
    }
  }, [phase, startCam]);

  const doEndSession = useCallback(
    async (reason: string) => {
      const cfg = configRef.current;
      const sess = sessionRef.current;
      if (cfg && sess) {
        try {
          const res = await endSession(cfg, sess.id, reason);
          if (res.session) setElapsed(res.session.seconds_total);
        } catch {
          /* ignore */
        }
      }
      setSession(null);
      setCustomer(null);
      setScore(null);
      setAbsentLeft(null);
      absentSinceRef.current = null;
      presenceMissStreakRef.current = 0;
      handoffStreakRef.current = null;
      handoffBusyRef.current = false;
      sessionStartedAtRef.current = null;
      await lockUi();
    },
    [lockUi],
  );

  const scheduleCamRetry = useCallback(() => {
    if (camRetryRef.current != null) return;
    camRetryRef.current = window.setInterval(() => {
      if (phaseRef.current !== "locked" && phaseRef.current !== "unlocked") return;
      if (streamRef.current?.active) return;
      startCam().catch((err) => {
        setError(err instanceof Error ? err.message : "Falha na câmera");
      });
    }, 5000);
  }, [startCam]);

  useEffect(() => {
    scheduleCamRetry();
    return () => {
      if (camRetryRef.current != null) {
        window.clearInterval(camRetryRef.current);
        camRetryRef.current = null;
      }
    };
  }, [scheduleCamRetry]);

  // Boot + claim
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cfg = await window.geeklock.getConfig();
      if (cancelled) return;
      setConfig(cfg);
      if (!cfg.setupComplete || !cfg.serverUrl || !cfg.stationName) {
        setPhase("setup");
        setStatus("Configure a estação");
        return;
      }
      try {
        await checkHealth(cfg);
        let next = cfg;
        if (!cfg.stationToken) {
          const claimed = await claimStation(cfg);
          next = await window.geeklock.saveToken(claimed.token);
          setConfig(next);
        }
        await heartbeat(next);
        setStatus("Conectado ao servidor");
        await lockUi();
      } catch (err) {
        setPhase("offline");
        setStatus(err instanceof Error ? err.message : "Sem conexão com o PC controle");
        reportTelemetry(cfg.serverUrl, cfg.stationToken, {
          level: "error",
          kind: "boot.offline",
          message: err instanceof Error ? err.message : "Sem conexão no boot",
        });
        await window.geeklock.lock();
      }
    })();
    return () => {
      cancelled = true;
      stopCam();
    };
  }, [lockUi]);

  // Heartbeat da estação
  useEffect(() => {
    if (!config?.stationToken) return;
    const t = setInterval(() => {
      heartbeat(config).catch(() => {
        if (phaseRef.current !== "unlocked") {
          setPhase("offline");
          setStatus("Perdeu conexão com o servidor");
        }
      });
    }, 8000);
    return () => clearInterval(t);
  }, [config]);

  // WebSocket → GeekCentral (comandos + status ao vivo)
  useEffect(() => {
    if (!config?.stationToken) return;

    const handleCommand = (
      command: StationCommand,
      payload?: { text?: string; title?: string; level?: string; durationSec?: number },
    ) => {
      if (command === "reload") {
        reportTelemetry(config.serverUrl, config.stationToken, {
          kind: "command.reload",
          message: "Reload remoto recebido",
        });
        location.reload();
        return;
      }
      if (command === "message" && payload?.text) {
        const level =
          payload.level === "warn" || payload.level === "urgent" ? payload.level : "info";
        const durationSec = payload.durationSec && payload.durationSec > 0 ? payload.durationSec : 12;
        setRemoteBanner({
          title: payload.title?.trim() || (level === "urgent" ? "Aviso urgente" : "Mensagem da central"),
          text: payload.text,
          level,
          until: Date.now() + durationSec * 1000,
        });
        setStatus(payload.text);
        reportTelemetry(config.serverUrl, config.stationToken, {
          kind: "command.message",
          message: "Mensagem remota exibida",
          meta: { level, durationSec },
        });
        return;
      }
      if (command === "lock_screen" || command === "end_session") {
        const lockFn = (window as unknown as { __geeklockRequestLock?: () => void }).__geeklockRequestLock;
        lockFn?.();
        return;
      }
      if (command === "unlock_screen") {
        if (phaseRef.current === "unlocked") return;
        const unlockFn = (window as unknown as { __geeklockUnlockAdmin?: () => Promise<void> })
          .__geeklockUnlockAdmin;
        unlockFn?.().catch(() => undefined);
      }
    };

    const sock = new StationSocket(config.serverUrl, config.stationToken, {
      onCommand: handleCommand,
      onClose: () => {
        reportTelemetry(config.serverUrl, config.stationToken, {
          level: "warn",
          kind: "ws.close",
          message: "WebSocket da estação fechou",
        });
      },
    });
    stationWsRef.current = sock;
    sock.connect();

    return () => {
      sock.disconnect();
      if (stationWsRef.current === sock) stationWsRef.current = null;
    };
  }, [config?.serverUrl, config?.stationToken]);

  // Empurra station_status para o central
  useEffect(() => {
    const push = () => {
      const sock = stationWsRef.current;
      if (!sock) return;
      const isAdmin = customerRef.current?.id === "staff";
      const phaseNow = phaseRef.current;
      sock.sendStatus({
        phase: phaseNow,
        customerName: customerRef.current?.name || null,
        mode: isAdmin
          ? "admin"
          : phaseNow === "unlocked"
            ? "vip"
            : phaseNow === "offline"
              ? "offline"
              : "locked",
        elapsed: isAdmin ? 0 : elapsed,
        present: isAdmin ? true : absentLeftRef.current == null,
        absentLeft: isAdmin ? null : absentLeftRef.current,
      });
    };
    push();
    const t = window.setInterval(push, 1000);
    return () => clearInterval(t);
  }, [phase, elapsed, absentLeft, customer?.name, customer?.id]);

  // Timer local 1s — fonte do display (não depende de heartbeat)
  useEffect(() => {
    if (phase !== "unlocked" || sessionStartedAtRef.current == null) return;
    const tick = () => {
      const start = sessionStartedAtRef.current;
      if (start == null) return;
      setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    };
    tick();
    const t = window.setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [phase, session?.id, customer?.id]);

  // Bandeja — atualiza tooltip/ícone a cada 1s
  useEffect(() => {
    const pushTray = () => {
      const isAdmin = customerRef.current?.id === "staff";
      const phaseNow = phaseRef.current;
      window.geeklock.updateTray({
        phase: phaseNow,
        name: customerRef.current?.name || "VIP",
        mode: isAdmin
          ? "admin"
          : phaseNow === "unlocked"
            ? "vip"
            : phaseNow === "offline"
              ? "offline"
              : "locked",
        elapsed: isAdmin ? 0 : elapsed,
        present: isAdmin ? true : absentLeftRef.current == null,
        absentLeft: isAdmin ? null : absentLeftRef.current,
      });
    };
    pushTray();
    const t = window.setInterval(pushTray, 1000);
    return () => clearInterval(t);
  }, [phase, elapsed, absentLeft, customer?.name, customer?.id]);

  // Tray + lock sync + comandos remotos
  useEffect(() => {
    const requestLockStation = () => {
      if (phaseRef.current === "unlocked") {
        if (customerRef.current?.id === "staff" && !sessionRef.current) {
          sessionStartedAtRef.current = null;
          setCustomer(null);
          setAbsentLeft(null);
          absentSinceRef.current = null;
          lockUi().catch(() => undefined);
        } else if (sessionRef.current) {
          doEndSession("tray_lock").catch(() => undefined);
        } else {
          lockUi().catch(() => undefined);
        }
      } else if (phaseRef.current !== "locked") {
        lockUi().catch(() => undefined);
      } else {
        window.geeklock.lock().catch(() => undefined);
      }
    };

    const unlockAsAdmin = async () => {
      sessionStartedAtRef.current = Date.now();
      setElapsed(0);
      setSession(null);
      setCustomer({ id: "staff", name: "Admin", level: "ouro", points: 0 });
      setStatus("Modo Admin — liberado sem limite");
      setAbsentLeft(null);
      absentSinceRef.current = null;
      presenceMissStreakRef.current = 0;
      await unlockUi();
    };

    const offEnd = window.geeklock.onRequestEndSession(() => {
      if (phaseRef.current === "unlocked") {
        if (customerRef.current?.id === "staff" && !sessionRef.current) {
          requestLockStation();
        } else {
          doEndSession("tray_end").catch(() => undefined);
        }
      }
    });
    const offQuit = window.geeklock.onRequestQuit(() => {
      setPinMode("quit");
      setPin("");
    });
    const offStaffPin = window.geeklock.onRequestStaffPin(() => {
      setPinMode("unlock");
      setPin("");
    });
    const offLockReq = window.geeklock.onRequestLock(() => {
      requestLockStation();
    });
    const offLockState = window.geeklock.onLockState((data) => {
      if (data.locked && phaseRef.current === "unlocked") {
        requestLockStation();
      }
    });

    (window as unknown as { __geeklockRequestLock?: () => void }).__geeklockRequestLock = requestLockStation;
    (window as unknown as { __geeklockUnlockAdmin?: () => Promise<void> }).__geeklockUnlockAdmin = unlockAsAdmin;

    return () => {
      offEnd();
      offQuit();
      offStaffPin();
      offLockReq();
      offLockState();
      delete (window as unknown as { __geeklockRequestLock?: () => void }).__geeklockRequestLock;
      delete (window as unknown as { __geeklockUnlockAdmin?: () => Promise<void> }).__geeklockUnlockAdmin;
    };
  }, [doEndSession, lockUi, unlockUi]);

  useRecognizeLoop({
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
  });

  usePresenceLoop({
    phase,
    config,
    session,
    customerId: customer?.id,
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
  });

  const submitPin = async () => {
    setError("");
    if (pinMode === "quit") {
      const res = await window.geeklock.quitWithPin(pin);
      if (!res.ok) setError(res.error || "PIN inválido");
      return;
    }
    if (pinMode === "unlock") {
      const res = await window.geeklock.staffUnlock(pin);
      if (!res.ok) {
        setError(res.error || "PIN inválido");
        return;
      }
      setPinMode(null);
      setPin("");
      sessionStartedAtRef.current = Date.now();
      setElapsed(0);
      setSession(null);
      setCustomer({ id: "staff", name: "Admin", level: "ouro", points: 0 });
      setStatus("Modo Admin — liberado sem limite");
      setAbsentLeft(null);
      absentSinceRef.current = null;
      presenceMissStreakRef.current = 0;
      await unlockUi();
      return;
    }
  };

  const retryOnline = async () => {
    if (!config) return;
    setError("");
    try {
      await checkHealth(config);
      await heartbeat(config);
      await lockUi();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ainda offline");
      setPhase("offline");
    }
  };

  useEffect(() => {
    if (!remoteBanner) return;
    const left = remoteBanner.until - Date.now();
    if (left <= 0) {
      setRemoteBanner(null);
      return;
    }
    const t = window.setTimeout(() => setRemoteBanner(null), left);
    return () => window.clearTimeout(t);
  }, [remoteBanner]);

  const remoteBannerEl = (
    <RemoteBannerOverlay banner={remoteBanner} onDismiss={() => setRemoteBanner(null)} />
  );

  const ovalClass = welcomeCustomer
    ? "success"
    : scanVisualFromReason(scanReason, scanning);

  const showScore =
    score != null &&
    (scanReason === "unknown" ||
      scanReason === "ambiguous" ||
      status.includes("Confirmando") ||
      (score > 0 && score < 0.55));

  if (phase === "boot") {
    return (
      <div className="screen">
        <div className="card">
          <h1 className="brand">GeekLock</h1>
          <p className="muted kiosk-status">{status}</p>
        </div>
      </div>
    );
  }

  if (phase === "setup") {
    return (
      <SetupWizard
        onDone={async (cfg) => {
          setConfig(cfg);
          setStatus("Conectado ao servidor");
          try {
            await heartbeat(cfg);
            await lockUi();
          } catch (err) {
            setPhase("offline");
            setStatus(err instanceof Error ? err.message : "Sem conexão com o PC controle");
            await window.geeklock.lock();
          }
        }}
      />
    );
  }

  if (phase === "offline") {
    return (
      <OfflineScreen
        status={status}
        error={error}
        pin={pin}
        pinMode={pinMode}
        banner={remoteBannerEl}
        onRetry={retryOnline}
        onPinChange={setPin}
        onOpenPin={() => {
          setPinMode("unlock");
          setPin("");
        }}
        onSubmitPin={submitPin}
      />
    );
  }

  if (phase === "unlocked") {
    return (
      <>
        {remoteBannerEl}
        <div className="session-hidden">
          <video ref={videoRef} muted playsInline className="session-hidden-cam" />
        </div>
      </>
    );
  }

  return (
    <LockedScreen
      config={config}
      status={status}
      scanReason={scanReason}
      scanning={scanning}
      ovalClass={ovalClass}
      showScore={showScore}
      score={score}
      error={error}
      camReady={camReady}
      welcomeCustomer={welcomeCustomer}
      pin={pin}
      pinMode={pinMode}
      videoRef={videoRef}
      banner={remoteBannerEl}
      onPinChange={setPin}
      onOpenPin={(mode) => {
        setPinMode(mode);
        setPin("");
      }}
      onSubmitPin={submitPin}
    />
  );
}
