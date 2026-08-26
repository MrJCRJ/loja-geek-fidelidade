import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  attachCameraStream,
  checkHealth,
  claimStation,
  endSession,
  heartbeat,
  openUserCamera,
  reportStaffUnlock,
} from "./api";
import { StationSocket, type StationCommand } from "./ws";
import { SetupWizard } from "./SetupWizard";
import { reportTelemetry } from "./telemetry";
import { LockedScreen } from "./LockedScreen";
import { OfflineScreen } from "./OfflineScreen";
import { RemoteBannerOverlay } from "./RemoteBannerOverlay";
import { scanVisualFromReason, type Phase, type RemoteBanner, formatBalanceShort, DEFAULT_STAFF_UNLOCK_MAX_SEC, DEFAULT_PORTAL_URL, portalRegisterUrl, playLockWarnChime, playSoftLockBeep } from "./kiosk-helpers";
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
  const [balanceSeconds, setBalanceSeconds] = useState<number | null>(null);
  const [lowBalanceWarn, setLowBalanceWarn] = useState(false);
  const [billingPaused, setBillingPaused] = useState(false);
  const [pin, setPin] = useState("");
  const [pinMode, setPinMode] = useState<"unlock" | "quit" | null>(null);
  const [error, setError] = useState("");
  const [camReady, setCamReady] = useState(false);
  const [remoteBanner, setRemoteBanner] = useState<RemoteBanner | null>(null);
  const [lastFailure, setLastFailure] = useState<{ kind: string; message: string; at: string } | null>(
    null,
  );
  const [portalBaseUrl, setPortalBaseUrl] = useState(DEFAULT_PORTAL_URL);
  const [logoutNudge, setLogoutNudge] = useState(false);
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
  /** Evita reentrada de doEndSession (F11 / onLockState / ausência). */
  const endingSessionRef = useRef(false);
  const softLockArmedRef = useRef(false);
  const softLockTickRef = useRef<number | null>(null);
  const logoutNudgeTimerRef = useRef<number | null>(null);
  /** Epoch ms do início da sessão (timer local). */
  const sessionStartedAtRef = useRef<number | null>(null);
  const absentLeftRef = useRef<number | null>(null);
  const stationWsRef = useRef<StationSocket | null>(null);
  const sessionSafetyRef = useRef({
    lowBalanceWarnSeconds: 300,
    staffUnlockMaxSeconds: DEFAULT_STAFF_UNLOCK_MAX_SEC,
    presenceMinFaceRatio: 0.12,
  });

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
        setError("Webcam desconectada — tentando reconectar a Logitech C270…");
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

  /**
   * Trava a estação. Importante: pintar LockedScreen (reconhecimento) ANTES de
   * mostrar a janela fullscreen — na fase unlocked a UI é só um <video> 1px
   * (parece tela preta). flushSync garante o paint antes do Electron.show().
   */
  const lockUi = useCallback(async () => {
    flushSync(() => {
      setPhase("locked");
      phaseRef.current = "locked";
      setStatus("Aguardando VIP...");
      setScanReason(undefined);
      setWelcomeCustomer(null);
      setAbsentLeft(null);
      sessionStartedAtRef.current = null;
    });
    await window.geeklock.lock();
    try {
      await startCam();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na câmera");
    }
  }, [startCam]);

  const unlockUi = useCallback(async () => {
    await window.geeklock.unlock();
    setPhase("unlocked");
    phaseRef.current = "unlocked";
    setStatus("Sessão ativa");
    setWelcomeCustomer(null);
    // T7 — apps do Windows ficam logados; aviso curto no HUD overlay
    setRemoteBanner({
      title: "Sessão liberada",
      text: "Ao sair, faça logout do Steam/Discord se não for sua conta. Ausência trava o PC.",
      level: "info",
      until: Date.now() + 10_000,
    });
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
      if (endingSessionRef.current) return;
      endingSessionRef.current = true;
      try {
        const cfg = configRef.current;
        const sess = sessionRef.current;
        // Limpa refs já — evita onLockState/F11 reentrarem em doEndSession
        sessionRef.current = null;
        customerRef.current = null;

        // UI de reconhecimento na hora (não espera endSession na rede)
        flushSync(() => {
          setPhase("locked");
          phaseRef.current = "locked";
          setStatus(sess ? "Encerrando sessão…" : "Aguardando VIP...");
          setScanReason(undefined);
          setWelcomeCustomer(null);
          setSession(null);
          setCustomer(null);
          setScore(null);
          setAbsentLeft(null);
          setBalanceSeconds(null);
          setLowBalanceWarn(false);
          setBillingPaused(false);
          absentSinceRef.current = null;
          presenceMissStreakRef.current = 0;
          handoffStreakRef.current = null;
          handoffBusyRef.current = false;
          sessionStartedAtRef.current = null;
        });

        if (sess) {
          playLockWarnChime();
          setLogoutNudge(true);
          if (logoutNudgeTimerRef.current != null) window.clearTimeout(logoutNudgeTimerRef.current);
          logoutNudgeTimerRef.current = window.setTimeout(() => setLogoutNudge(false), 6500);
          setRemoteBanner({
            title: "Sessão encerrada",
            text: "Faça logout do Steam e do Discord se a conta não for sua — o próximo VIP herda o que ficar logado.",
            level: "warn",
            until: Date.now() + 14_000,
          });
        }

        await window.geeklock.lock();

        if (cfg && sess) {
          try {
            const res = await endSession(cfg, sess.id, reason);
            if (res.session) setElapsed(res.session.seconds_total);
          } catch {
            /* ignore */
          }
        }
        setStatus("Aguardando VIP...");
        try {
          await startCam();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Falha na câmera");
        }
      } finally {
        endingSessionRef.current = false;
      }
    },
    [startCam],
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
      const fail = await window.geeklock.getLastFailure();
      if (!cancelled) setLastFailure(fail);
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
        const msg = err instanceof Error ? err.message : "Sem conexão com o PC controle";
        window.geeklock.writeLastFailure({ kind: "boot", message: msg }).catch(() => undefined);
        setPhase("offline");
        setStatus(msg);
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
    const tick = () => {
      heartbeat(config)
        .then((res) => {
          if (res.sessionSafety) {
            sessionSafetyRef.current = {
              lowBalanceWarnSeconds: res.sessionSafety.lowBalanceWarnSeconds || 300,
              staffUnlockMaxSeconds:
                res.sessionSafety.staffUnlockMaxSeconds || DEFAULT_STAFF_UNLOCK_MAX_SEC,
              presenceMinFaceRatio: res.sessionSafety.presenceMinFaceRatio || 0.12,
            };
          }
          if (res.portalPublicUrl) {
            setPortalBaseUrl(res.portalPublicUrl.replace(/\/$/, ""));
          }
        })
        .catch(() => {
          if (phaseRef.current !== "unlocked") {
            setPhase("offline");
            setStatus("Perdeu conexão com o servidor");
          }
        });
    };
    tick();
    const t = setInterval(tick, 8000);
    return () => clearInterval(t);
  }, [config]);

  // Soft lock: som ao entrar nos últimos 15s + ticks 10/5/3/2/1
  useEffect(() => {
    if (phase !== "unlocked") {
      softLockArmedRef.current = false;
      softLockTickRef.current = null;
      return;
    }
    const left = absentLeft;
    if (left == null || left > 15) {
      softLockArmedRef.current = false;
      softLockTickRef.current = null;
      return;
    }
    if (!softLockArmedRef.current) {
      softLockArmedRef.current = true;
      playSoftLockBeep("enter");
      softLockTickRef.current = left;
      return;
    }
    if (left === 1) {
      if (softLockTickRef.current !== 1) {
        softLockTickRef.current = 1;
        playSoftLockBeep("final");
      }
      return;
    }
    if ([10, 5, 3, 2].includes(left) && softLockTickRef.current !== left) {
      softLockTickRef.current = left;
      playSoftLockBeep("tick");
    }
  }, [phase, absentLeft]);

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
        setRemoteBanner({
          title: command === "end_session" ? "Sessão encerrada" : "PC travado",
          text:
            command === "end_session"
              ? "A loja encerrou esta sessão pelo GeekCentral — não foi falta de horas."
              : "A loja pediu para travar este PC.",
          level: "warn",
          until: Date.now() + 12_000,
        });
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
      onOpen: () => {
        if (phaseRef.current === "offline") {
          setRemoteBanner({
            title: "Conexão restaurada",
            text: "Link com o GeekCentral voltou. Se a sessão travar de novo, avise o balcão.",
            level: "info",
            until: Date.now() + 8_000,
          });
        }
      },
      onClose: () => {
        reportTelemetry(config.serverUrl, config.stationToken, {
          level: "warn",
          kind: "ws.close",
          message: "WebSocket da estação fechou",
        });
        if (phaseRef.current === "unlocked") {
          setRemoteBanner({
            title: "Sem link com a central",
            text: "Rede oscilando — o saldo não deve consumir em lote; aguarde ou chame o balcão.",
            level: "warn",
            until: Date.now() + 10_000,
          });
        }
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
        balanceSeconds: isAdmin ? null : balanceSeconds,
        lowBalanceWarn: isAdmin ? false : lowBalanceWarn,
        billingPaused: isAdmin ? false : billingPaused,
      });
    };
    push();
    const t = window.setInterval(push, 1000);
    return () => clearInterval(t);
  }, [phase, elapsed, absentLeft, balanceSeconds, lowBalanceWarn, billingPaused, customer?.name, customer?.id]);

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
        balanceSeconds: isAdmin ? null : balanceSeconds,
        lowBalanceWarn: isAdmin ? false : lowBalanceWarn,
        billingPaused: isAdmin ? false : billingPaused,
      });
    };
    pushTray();
    const t = window.setInterval(pushTray, 1000);
    return () => clearInterval(t);
  }, [phase, elapsed, absentLeft, balanceSeconds, lowBalanceWarn, billingPaused, customer?.name, customer?.id]);

  // Tray + lock sync + comandos remotos
  useEffect(() => {
    const requestLockStation = () => {
      if (endingSessionRef.current) {
        window.geeklock.lock().catch(() => undefined);
        return;
      }
      if (phaseRef.current === "unlocked") {
        if (customerRef.current?.id === "staff" && !sessionRef.current) {
          sessionStartedAtRef.current = null;
          customerRef.current = null;
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
      setStatus("Modo Admin — auto-trava em alguns minutos");
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

  const showLowBalanceBanner = useCallback((bal: number) => {
    setRemoteBanner({
      title: "Saldo acabando",
      text: `Restam cerca de ${formatBalanceShort(bal)}. Recarregue no caixa ou no site.`,
      level: "warn",
      until: Date.now() + 20_000,
    });
  }, []);

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
    setBalanceSeconds,
    setLowBalanceWarn,
    setBillingPaused,
    onLowBalanceWarn: showLowBalanceBanner,
  });

  // T6 — modo staff não fica aberto para sempre
  useEffect(() => {
    if (phase !== "unlocked" || customer?.id !== "staff") return;
    const started = sessionStartedAtRef.current || Date.now();
    const tick = () => {
      const maxSec = sessionSafetyRef.current.staffUnlockMaxSeconds || DEFAULT_STAFF_UNLOCK_MAX_SEC;
      const left = maxSec - Math.floor((Date.now() - started) / 1000);
      if (left <= 0) {
        sessionStartedAtRef.current = null;
        setCustomer(null);
        setStatus("Admin auto-travado");
        lockUi().catch(() => undefined);
        return;
      }
      if (left <= 60) {
        setStatus(`Admin — trava em ${left}s`);
      }
    };
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [phase, customer?.id, lockUi]);

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
      setStatus("Modo Admin — auto-trava em alguns minutos");
      setAbsentLeft(null);
      absentSinceRef.current = null;
      presenceMissStreakRef.current = 0;
      if (config) reportStaffUnlock(config).catch(() => undefined);
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
        onClosePin={() => {
          setPinMode(null);
          setPin("");
        }}
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
      portalQrUrl={portalRegisterUrl(portalBaseUrl)}
      logoutNudge={logoutNudge}
      videoRef={videoRef}
      banner={remoteBannerEl}
      lastFailure={lastFailure}
      onClearFailure={() => {
        window.geeklock.clearLastFailure().then(() => setLastFailure(null));
      }}
      onRetryCam={() => {
        setError("");
        startCam().catch((err) => {
          setError(err instanceof Error ? err.message : "Falha na câmera");
        });
      }}
      onPinChange={setPin}
      onOpenPin={(mode) => {
        setPinMode(mode);
        setPin("");
      }}
      onSubmitPin={submitPin}
      onClosePin={() => {
        setPinMode(null);
        setPin("");
      }}
    />
  );
}
