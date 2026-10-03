import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  attachCameraStream,
  checkHealth,
  pairStationLan,
  endSession,
  heartbeat,
  openUserCamera,
  reportStaffUnlock,
  sessionHeartbeat,
  startSession,
} from "./api";
import { StationSocket, type StationCommand } from "./ws";
import { SetupWizard } from "./SetupWizard";
import { reportTelemetry } from "./telemetry";
import { LockedScreen } from "./LockedScreen";
import { OfflineScreen } from "./OfflineScreen";
import { RemoteBannerOverlay } from "./RemoteBannerOverlay";
import { scanVisualFromReason, type Phase, type RemoteBanner, formatBalanceShort, liveBalanceSeconds, staffUnlockLeftSeconds, DEFAULT_STAFF_UNLOCK_MAX_SEC, STAFF_UNLOCK_WARN_SEC, DEFAULT_PORTAL_URL, portalRegisterUrl, playLockWarnChime, playUnlockChime, sessionStartErrorMessage, FACE_GRACE_MS, DEFAULT_ABSENT_SEC, playSoftLockBeep } from "./kiosk-helpers";
import { useRecognizeLoop, type PendingLogin } from "./hooks/useRecognizeLoop";
import { usePresenceLoop } from "./hooks/usePresenceLoop";
import { startUsageLoop, type OccupantState } from "./usage-collector";
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
  const [error, setError] = useState("");
  const [camReady, setCamReady] = useState(false);
  const [remoteBanner, setRemoteBanner] = useState<RemoteBanner | null>(null);
  const [lastFailure, setLastFailure] = useState<{ kind: string; message: string; at: string } | null>(
    null,
  );
  const [portalBaseUrl, setPortalBaseUrl] = useState(DEFAULT_PORTAL_URL);
  const [loginPrompt, setLoginPrompt] = useState<PendingLogin | null>(null);
  /** Bump após show() — remonta LockedScreen com a janela já visível. */
  const [lockPaintNonce, setLockPaintNonce] = useState(0);
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
  const camReadyRef = useRef(false);
  /** Evita reentrada de doEndSession (F11 / onLockState / ausência). */
  const endingSessionRef = useRef(false);
  const declinedLoginRef = useRef<{ id: string; until: number } | null>(null);
  /** Janela de tolerância após abrir/travar — câmera estabiliza antes de penalizar rosto. */
  const faceGraceUntilRef = useRef(0);
  const balanceSyncedAtRef = useRef<number | null>(null);
  const softLockArmedRef = useRef(false);
  const softLockTickRef = useRef<number | null>(null);
  /** Epoch ms do início da sessão (timer local). */
  const sessionStartedAtRef = useRef<number | null>(null);
  const absentLeftRef = useRef<number | null>(null);
  const stationWsRef = useRef<StationSocket | null>(null);
  const sessionSafetyRef = useRef({
    lowBalanceWarnSeconds: 300,
    staffUnlockMaxSeconds: DEFAULT_STAFF_UNLOCK_MAX_SEC,
    presenceMinFaceRatio: 0.12,
  });
  const lockVersionRef = useRef("");
  const applyingLockUpdateRef = useRef(false);
  const usageFlagsRef = useRef({ detailedTitles: false, staffTimedMaxMinutes: 240 });
  const staffUnlockMetaRef = useRef<{
    kind?: OccupantState["kind"];
    label?: string | null;
    durationSec?: number | null;
  } | null>(null);
  const deskLiberarRef = useRef(false);

  const applyLockUpdateIfNeeded = useCallback((needed?: boolean | null) => {
    if (!needed || applyingLockUpdateRef.current) return;
    applyingLockUpdateRef.current = true;
    setStatus("Atualizando GeekLock…");
    window.geeklock
      .applyLockUpdate()
      .then((r) => {
        if (!r.ok) {
          applyingLockUpdateRef.current = false;
          setStatus(r.error || "Falha ao atualizar GeekLock");
        }
      })
      .catch(() => {
        applyingLockUpdateRef.current = false;
      });
  }, []);

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
  useEffect(() => {
    camReadyRef.current = camReady;
  }, [camReady]);

  const syncBalance = useCallback((bal: number | null) => {
    setBalanceSeconds(bal);
    balanceSyncedAtRef.current = bal != null ? Date.now() : null;
  }, []);

  async function waitForVideoElement(timeoutMs = 4000): Promise<HTMLVideoElement | null> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (videoRef.current) return videoRef.current;
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    }
    return videoRef.current;
  }

  const stopCam = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const startCam = useCallback(async () => {
    stopCam();
    setCamReady(false);
    camReadyRef.current = false;
    try {
      const stream = await openUserCamera();
      streamRef.current = stream;
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        streamRef.current = null;
        camReadyRef.current = false;
        setCamReady(false);
        setError("Câmera desconectada — tentando reconectar o DroidCam…");
      });
      const video = await waitForVideoElement();
      if (!video) {
        throw new Error("Interface de vídeo não montou — aguarde ou clique em Reconectar webcam.");
      }
      await attachCameraStream(video, stream);
      camReadyRef.current = true;
      setCamReady(true);
      setError("");
    } catch (err) {
      stopCam();
      camReadyRef.current = false;
      setCamReady(false);
      const msg = err instanceof Error ? err.message : "Falha na câmera";
      setError(msg);
      throw err;
    }
  }, []);

  /**
   * Trava a estação.
   * 1) flushSync → LockedScreen no DOM
   * 2) lock() → fullscreen (janela unlocked fica 1×1 opacity 0, sem hide)
   * 3) flushSync de novo + nonce → re-pinta com a janela já visível
   *    (evita tela vazia no auto-trava admin / fim de saldo)
   */
  const lockUi = useCallback(async () => {
    customerRef.current = null;
    sessionRef.current = null;
    staffUnlockMetaRef.current = null;
    deskLiberarRef.current = false;
    flushSync(() => {
      setPhase("locked");
      phaseRef.current = "locked";
      setStatus("Aguardando VIP...");
      setScanReason(undefined);
      setWelcomeCustomer(null);
      setLoginPrompt(null);
      setCustomer(null);
      setSession(null);
      setScore(null);
      setAbsentLeft(null);
      syncBalance(null);
      setLowBalanceWarn(false);
      setBillingPaused(false);
      absentSinceRef.current = null;
      presenceMissStreakRef.current = 0;
      handoffStreakRef.current = null;
      sessionStartedAtRef.current = null;
    });
    await window.geeklock.lock();
    flushSync(() => {
      setPhase("locked");
      phaseRef.current = "locked";
      setStatus("Aguardando VIP...");
      setLockPaintNonce((n) => n + 1);
    });
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    faceGraceUntilRef.current = Date.now() + FACE_GRACE_MS;
    void startCam().catch((err) => {
      setError(err instanceof Error ? err.message : "Falha na câmera");
    });
  }, [startCam, syncBalance]);

  const unlockUi = useCallback(async () => {
    await window.geeklock.unlock();
    faceGraceUntilRef.current = Date.now() + FACE_GRACE_MS;
    setPhase("unlocked");
    phaseRef.current = "unlocked";
    setStatus("Sessão ativa");
    setWelcomeCustomer(null);
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    void startCam().catch((err) => {
      setError(err instanceof Error ? err.message : "Falha na câmera");
    });
  }, [startCam]);

  // Reanexa stream ao <video> após trocar locked ↔ unlocked (remount)
  useEffect(() => {
    if (phase !== "unlocked" && phase !== "locked") return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream?.active) return;
    if (video.srcObject === stream && camReadyRef.current) return;
    attachCameraStream(video, stream)
      .then(() => {
        camReadyRef.current = true;
        setCamReady(true);
        setError("");
      })
      .catch(() => {
        startCam().catch(() => undefined);
      });
  }, [phase, lockPaintNonce, startCam]);

  // DroidCam: celular conecta depois — stream fica "live" sem frames até o vídeo chegar
  useEffect(() => {
    if (phase !== "locked" && phase !== "unlocked") return;
    const poll = window.setInterval(() => {
      if (camReadyRef.current) return;
      if (phaseRef.current !== "locked" && phaseRef.current !== "unlocked") return;
      const video = videoRef.current;
      const stream = streamRef.current;
      if (video && stream?.active) {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          camReadyRef.current = true;
          setCamReady(true);
          setError("");
          return;
        }
        attachCameraStream(video, stream)
          .then(() => {
            camReadyRef.current = true;
            setCamReady(true);
            setError("");
          })
          .catch(() => undefined);
        return;
      }
      startCam().catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(poll);
  }, [phase, startCam]);

  useEffect(() => {
    if (!navigator.mediaDevices?.addEventListener) return;
    const onDeviceChange = () => {
      if (phaseRef.current !== "locked" && phaseRef.current !== "unlocked") return;
      if (camReadyRef.current) return;
      startCam().catch(() => undefined);
    };
    navigator.mediaDevices.addEventListener("devicechange", onDeviceChange);
    return () => navigator.mediaDevices.removeEventListener("devicechange", onDeviceChange);
  }, [startCam]);

  const doEndSession = useCallback(
    async (reason: string) => {
      if (endingSessionRef.current) return;
      endingSessionRef.current = true;
      const cfg = configRef.current;
      const sess = sessionRef.current;

      sessionRef.current = null;
      customerRef.current = null;
      setLoginPrompt(null);

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
        syncBalance(null);
        setLowBalanceWarn(false);
        setBillingPaused(false);
        absentSinceRef.current = null;
        presenceMissStreakRef.current = 0;
        handoffStreakRef.current = null;
        handoffBusyRef.current = false;
        sessionStartedAtRef.current = null;
      });

      try {
        await window.geeklock.lock();
        flushSync(() => {
          setPhase("locked");
          phaseRef.current = "locked";
          setLockPaintNonce((n) => n + 1);
          setStatus("Aguardando VIP...");
        });
        // Não bloqueia encerrar sessão na câmera (DroidCam pode demorar).
        faceGraceUntilRef.current = Date.now() + FACE_GRACE_MS;
        void startCam().catch((err) => {
          setError(err instanceof Error ? err.message : "Falha na câmera");
        });

        if (cfg && sess) {
          endSession(cfg, sess.id, reason)
            .then((res) => {
              if (res.session) setElapsed(res.session.seconds_total);
            })
            .catch(() => undefined);
          playLockWarnChime();
        }
        setStatus("Aguardando VIP...");
      } finally {
        endingSessionRef.current = false;
      }
    },
    [startCam],
  );

  const confirmLogin = useCallback(async () => {
    if (!loginPrompt || !config) return;
    try {
      const h = await checkHealth(config);
      if (!h.ok || !h.faceService) {
        setStatus("GeekCentral offline — impossível liberar agora");
        return;
      }
    } catch {
      setPhase("offline");
      setStatus("GeekCentral offline — impossível liberar");
      return;
    }
    const pending = loginPrompt;
    setLoginPrompt(null);
    setStatus(`Entrando — ${pending.customer.name}…`);
    setWelcomeCustomer({
      ...pending.customer,
      timeBalanceSeconds: pending.timeBalanceSeconds ?? undefined,
    });
    try {
      const started = await startSession(config, pending.customer.id);
      setSession(started.session);
      if (started.customer) setCustomer(started.customer);
      const initialBal =
        typeof started.timeBalanceSeconds === "number"
          ? started.timeBalanceSeconds
          : typeof started.session.time_balance_seconds === "number"
            ? started.session.time_balance_seconds
            : pending.timeBalanceSeconds;
      if (initialBal != null) syncBalance(initialBal);
      void sessionHeartbeat(config, started.session.id)
        .then((hb) => {
          const bal =
            typeof hb.timeBalanceSeconds === "number"
              ? hb.timeBalanceSeconds
              : typeof hb.session?.time_balance_seconds === "number"
                ? hb.session.time_balance_seconds
                : null;
          if (bal != null) syncBalance(bal);
        })
        .catch(() => undefined);
      const startedAt = Date.parse(started.session.started_at);
      sessionStartedAtRef.current = Number.isFinite(startedAt) ? startedAt : Date.now();
      setElapsed(Math.max(0, Math.floor((Date.now() - sessionStartedAtRef.current) / 1000)));
      absentSinceRef.current = null;
      presenceMissStreakRef.current = 0;
      handoffStreakRef.current = null;
      playUnlockChime();
      await new Promise<void>((r) => window.setTimeout(r, 900));
      setWelcomeCustomer(null);
      await unlockUi();
    } catch (err) {
      setWelcomeCustomer(null);
      const mapped = sessionStartErrorMessage(err);
      setScanReason(mapped.reason);
      setStatus(mapped.status);
      if (mapped.reason === "no_credit") {
        setWelcomeCustomer({
          ...pending.customer,
          timeBalanceSeconds: 0,
        });
      }
    }
  }, [loginPrompt, config, unlockUi, syncBalance]);

  const cancelLogin = useCallback(() => {
    if (loginPrompt) {
      declinedLoginRef.current = {
        id: loginPrompt.customer.id,
        until: Date.now() + 30_000,
      };
    }
    setLoginPrompt(null);
    setWelcomeCustomer(null);
    setCustomer(null);
    setScore(null);
    setScanReason(undefined);
    setStatus("Aguardando VIP...");
  }, [loginPrompt]);

  // Prompt de login expira sozinho
  useEffect(() => {
    if (!loginPrompt) return;
    const t = window.setTimeout(() => {
      cancelLogin();
    }, 45_000);
    return () => window.clearTimeout(t);
  }, [loginPrompt, cancelLogin]);

  const handleMatchConfirmed = useCallback(async (pending: PendingLogin) => {
    const cfg = configRef.current;
    if (!cfg) return;
    try {
      const h = await checkHealth(cfg);
      if (!h.ok || !h.faceService) {
        setStatus("GeekCentral offline — impossível liberar agora");
        return;
      }
    } catch {
      setPhase("offline");
      setStatus("GeekCentral offline — impossível liberar");
      return;
    }
    setLoginPrompt(pending);
  }, []);

  const handleIntruder = useCallback(
    async (kind: "vip" | "stranger") => {
      await doEndSession(kind === "vip" ? "handoff_vip" : "handoff_stranger");
      if (kind === "stranger") {
        setScanReason("unknown");
        setStatus("Rosto não cadastrado — escaneie o QR para se registrar");
      }
    },
    [doEndSession],
  );

  const scheduleCamRetry = useCallback(() => {
    if (camRetryRef.current != null) return;
    camRetryRef.current = window.setInterval(() => {
      if (phaseRef.current !== "locked" && phaseRef.current !== "unlocked") return;
      if (streamRef.current?.active && camReadyRef.current) return;
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
      try {
        lockVersionRef.current = await window.geeklock.getAppVersion();
      } catch {
        lockVersionRef.current = "";
      }
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
          const claimed = await pairStationLan(cfg);
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
      heartbeat(config, lockVersionRef.current || undefined)
        .then((res) => {
          applyLockUpdateIfNeeded(res.lockUpdate?.needed);
          if (res.sessionSafety) {
            sessionSafetyRef.current = {
              lowBalanceWarnSeconds: res.sessionSafety.lowBalanceWarnSeconds || 300,
              staffUnlockMaxSeconds:
                res.sessionSafety.staffUnlockMaxSeconds || DEFAULT_STAFF_UNLOCK_MAX_SEC,
              presenceMinFaceRatio: res.sessionSafety.presenceMinFaceRatio || 0.12,
            };
          }
          if (res.usage) {
            usageFlagsRef.current = {
              detailedTitles: Boolean(res.usage.usageDetailedTitles),
              staffTimedMaxMinutes: res.usage.staffTimedMaxMinutes || 240,
            };
          }
          if (res.portalPublicUrl) {
            setPortalBaseUrl(res.portalPublicUrl.replace(/\/$/, ""));
          }
          if (phaseRef.current === "offline") {
            setStatus("Central voltou");
            lockUi().catch(() => undefined);
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
  }, [config, lockUi, applyLockUpdateIfNeeded]);

  // Uso: inventário + samples 15s (só unlocked; sem keylog)
  useEffect(() => {
    if (!config?.stationToken) return;
    return startUsageLoop({
      getConfig: () => configRef.current,
      getPhase: () => phaseRef.current,
      getFlags: () => ({ detailedTitles: usageFlagsRef.current.detailedTitles }),
      getOccupant: (): OccupantState | null => {
        const c = customerRef.current;
        if (!c) return null;
        const meta = staffUnlockMetaRef.current;
        if (meta?.kind === "vip_desk" && sessionRef.current) {
          return { kind: "vip_desk", customerId: c.id, label: meta.label || c.name };
        }
        if (c.id === "staff" || c.id === "guest") {
          return {
            kind: (meta?.kind as OccupantState["kind"]) || (c.id === "guest" ? "guest_named" : "staff_timed"),
            customerId: c.id,
            label: meta?.label || c.name,
          };
        }
        if (sessionRef.current) {
          return { kind: "vip", customerId: c.id, label: c.name };
        }
        return null;
      },
    });
  }, [config?.stationToken]);

  // Soft lock removido — câmera ruim não trava mais por ausência falsa.

  // WebSocket → GeekCentral (comandos + status ao vivo)
  useEffect(() => {
    if (!config?.stationToken) return;

    const handleCommand = (
      command: StationCommand,
      payload?: {
        text?: string;
        title?: string;
        level?: string;
        durationSec?: number;
        occupantKind?: string;
        guestLabel?: string;
      },
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
        if (payload?.occupantKind === "vip_desk" && payload.customerId) {
          const vipFn = (
            window as unknown as {
              __geeklockUnlockVipDesk?: (payload: {
                customerId: string;
                customerName?: string;
                sessionId?: string;
                timeBalanceSeconds?: number;
              }) => Promise<void>;
            }
          ).__geeklockUnlockVipDesk;
          vipFn?.({
            customerId: payload.customerId,
            customerName: payload.customerName,
            sessionId: payload.sessionId,
            timeBalanceSeconds: payload.timeBalanceSeconds,
          }).catch(() => undefined);
          return;
        }
        const unlocked = phaseRef.current === "unlocked";
        const isAdmin =
          customerRef.current?.id === "staff" || customerRef.current?.id === "guest";
        if (unlocked && !isAdmin) return;
        const unlockFn = (
          window as unknown as {
            __geeklockUnlockAdmin?: (payload?: {
              occupantKind?: string;
              durationSec?: number;
              guestLabel?: string;
              customerId?: string;
              customerName?: string;
            }) => Promise<void>;
          }
        ).__geeklockUnlockAdmin;
        unlockFn?.({
          occupantKind: payload?.occupantKind,
          durationSec: payload?.durationSec,
          guestLabel: payload?.guestLabel,
          customerId: payload?.customerId,
          customerName: payload?.customerName,
        }).catch(() => undefined);
        return;
      }
      if (command === "apply_update") {
        applyLockUpdateIfNeeded(true);
        return;
      }
      if (command === "quit_app") {
        setRemoteBanner({
          title: "Encerrando GeekLock",
          text: "A loja pediu para fechar o app nesta estação.",
          level: "warn",
          until: Date.now() + 4_000,
        });
        window.setTimeout(() => {
          window.geeklock.quitFromCentral().catch(() => undefined);
        }, 600);
      }
    };

    const sock = new StationSocket(config.serverUrl, config.stationToken, {
      onCommand: handleCommand,
      onOpen: () => {
        if (phaseRef.current === "offline") {
          setRemoteBanner({
            title: "Central voltou",
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
            title: "Central offline",
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
  }, [config?.serverUrl, config?.stationToken, applyLockUpdateIfNeeded]);

  // Contagem de ausência 1/s — bandeja, HUD e auto-trava
  useEffect(() => {
    if (phase !== "unlocked" || customer?.id === "staff") return;
    if (deskLiberarRef.current) return;
    const absentSec = config?.absentSecondsToLock ?? DEFAULT_ABSENT_SEC;
    const tick = () => {
      if (deskLiberarRef.current) return;
      const since = absentSinceRef.current;
      if (since == null) {
        setAbsentLeft(null);
        softLockArmedRef.current = false;
        return;
      }
      const left = Math.max(0, absentSec - Math.floor((Date.now() - since) / 1000));
      setAbsentLeft(left);
      if (left <= 15 && left > 0) {
        if (!softLockArmedRef.current) {
          softLockArmedRef.current = true;
          playSoftLockBeep("enter");
        } else if (left <= 5) {
          playSoftLockBeep("tick");
        }
      } else {
        softLockArmedRef.current = false;
      }
      if (left <= 0 && !endingSessionRef.current) {
        playSoftLockBeep("final");
        void doEndSession("absent");
      }
    };
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [phase, session?.id, config?.absentSecondsToLock, customer?.id, doEndSession]);

  // Empurra station_status para o central
  useEffect(() => {
    const push = () => {
      const sock = stationWsRef.current;
      if (!sock) return;
      const custId = customerRef.current?.id;
      const isStaffOrGuest = custId === "staff" || custId === "guest";
      const meta = staffUnlockMetaRef.current;
      const openUnlock =
        meta?.kind === "staff_open" ||
        (meta?.kind === "guest_named" && !(meta.durationSec != null && meta.durationSec > 0));
      const phaseNow = phaseRef.current;
      const liveBal = liveBalanceSeconds(balanceSeconds, balanceSyncedAtRef.current, false);
      const maxSec =
        meta?.durationSec && meta.durationSec > 0
          ? meta.durationSec
          : sessionSafetyRef.current.staffUnlockMaxSeconds;
      const staffLeft = staffUnlockLeftSeconds(sessionStartedAtRef.current, maxSec);
      const started = sessionStartedAtRef.current;
      const openElapsed =
        started != null ? Math.max(0, Math.floor((Date.now() - started) / 1000)) : elapsed;
      const since = absentSinceRef.current;
      const absentSec = configRef.current?.absentSecondsToLock ?? DEFAULT_ABSENT_SEC;
      const absentLeftNow =
        since != null ? Math.max(0, absentSec - Math.floor((Date.now() - since) / 1000)) : null;
      const present = since == null;
      const staffDisplay = openUnlock ? openElapsed : staffLeft;
      sock.sendStatus({
        phase: phaseNow,
        customerName: customerRef.current?.name || null,
        mode: custId === "guest"
          ? "guest"
          : custId === "staff"
            ? "admin"
            : phaseNow === "unlocked"
              ? "vip"
              : phaseNow === "offline"
                ? "offline"
                : "locked",
        elapsed: isStaffOrGuest ? staffDisplay : liveBal ?? elapsed,
        present,
        absentLeft: isStaffOrGuest ? null : absentLeftNow,
        // Hora livre: sem saldo regressivo — Central/HUD usam elapsed crescente.
        balanceSeconds: isStaffOrGuest ? (openUnlock ? null : staffLeft) : liveBal,
        lowBalanceWarn: isStaffOrGuest
          ? !openUnlock && staffLeft <= STAFF_UNLOCK_WARN_SEC
          : lowBalanceWarn,
        billingPaused: false,
        occupantKind: meta?.kind || (custId === "staff" ? "staff_timed" : null),
      });
    };
    push();
    const t = window.setInterval(push, 1000);
    return () => clearInterval(t);
  }, [phase, elapsed, balanceSeconds, lowBalanceWarn, customer?.name, customer?.id]);

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
      const isGuest = customerRef.current?.id === "guest";
      const meta = staffUnlockMetaRef.current;
      const openUnlock =
        meta?.kind === "staff_open" ||
        (meta?.kind === "guest_named" && !(meta.durationSec != null && meta.durationSec > 0));
      const phaseNow = phaseRef.current;
      const liveBal = liveBalanceSeconds(balanceSeconds, balanceSyncedAtRef.current, false);
      const maxSec =
        meta?.durationSec && meta.durationSec > 0
          ? meta.durationSec
          : sessionSafetyRef.current.staffUnlockMaxSeconds;
      const staffLeft = staffUnlockLeftSeconds(sessionStartedAtRef.current, maxSec);
      const started = sessionStartedAtRef.current;
      const openElapsed =
        started != null ? Math.max(0, Math.floor((Date.now() - started) / 1000)) : elapsed;
      const since = absentSinceRef.current;
      const absentSec = configRef.current?.absentSecondsToLock ?? DEFAULT_ABSENT_SEC;
      const absentLeftNow =
        since != null ? Math.max(0, absentSec - Math.floor((Date.now() - since) / 1000)) : null;
      const present = since == null;
      const staffOrGuest = isAdmin || isGuest;
      const staffDisplay = openUnlock ? openElapsed : staffLeft;
      window.geeklock.updateTray({
        phase: phaseNow,
        name: customerRef.current?.name || "VIP",
        mode: isGuest
          ? "guest"
          : isAdmin
            ? "admin"
            : phaseNow === "unlocked"
              ? "vip"
              : phaseNow === "offline"
                ? "offline"
                : "locked",
        elapsed: staffOrGuest ? staffDisplay : liveBal ?? elapsed,
        present,
        absentLeft: staffOrGuest ? null : absentLeftNow,
        balanceSeconds: staffOrGuest ? (openUnlock ? null : staffLeft) : liveBal,
        lowBalanceWarn: staffOrGuest
          ? !openUnlock && staffLeft <= STAFF_UNLOCK_WARN_SEC
          : lowBalanceWarn,
        billingPaused: false,
      });
    };
    pushTray();
    const t = window.setInterval(pushTray, 1000);
    return () => clearInterval(t);
  }, [phase, elapsed, balanceSeconds, lowBalanceWarn, customer?.name, customer?.id]);

  // Tray + lock sync + comandos remotos
  useEffect(() => {
    const requestLockStation = () => {
      if (endingSessionRef.current) {
        window.geeklock.lock().catch(() => undefined);
        return;
      }
      if (phaseRef.current === "unlocked") {
        if (sessionRef.current) {
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

    const unlockAsVipDesk = async (payload: {
      customerId: string;
      customerName?: string;
      sessionId?: string;
      timeBalanceSeconds?: number;
    }) => {
      if (!configRef.current) return;
      const name = (payload.customerName || "VIP").slice(0, 80);
      deskLiberarRef.current = true;
      staffUnlockMetaRef.current = { kind: "vip_desk", durationSec: null, label: name };
      try {
        let session = payload.sessionId
          ? ({
              id: payload.sessionId,
              customer_id: payload.customerId,
              station_id: "",
              started_at: new Date().toISOString(),
              last_seen_at: new Date().toISOString(),
              seconds_total: 0,
              status: "active",
              customer_name: name,
              time_balance_seconds: payload.timeBalanceSeconds,
            } as Session)
          : null;
        let bal = payload.timeBalanceSeconds;
        if (!session) {
          const started = await startSession(configRef.current, payload.customerId);
          session = started.session;
          if (typeof started.timeBalanceSeconds === "number") bal = started.timeBalanceSeconds;
          if (started.customer) {
            setCustomer({
              id: started.customer.id,
              name: started.customer.name,
              level: started.customer.level || "bronze",
              points: started.customer.points || 0,
              timeBalanceSeconds: bal,
            });
          }
        } else {
          setCustomer({
            id: payload.customerId,
            name,
            level: "bronze",
            points: 0,
            timeBalanceSeconds: bal,
          });
        }
        setSession(session);
        sessionRef.current = session;
        if (bal != null) syncBalance(bal);
        const startedAt = Date.parse(session.started_at);
        sessionStartedAtRef.current = Number.isFinite(startedAt) ? startedAt : Date.now();
        setElapsed(Math.max(0, Math.floor((Date.now() - sessionStartedAtRef.current) / 1000)));
        setAbsentLeft(null);
        absentSinceRef.current = null;
        presenceMissStreakRef.current = 0;
        setStatus(`VIP balcão · ${name}`);
        playUnlockChime();
        await unlockUi();
      } catch (err) {
        deskLiberarRef.current = false;
        staffUnlockMetaRef.current = null;
        const mapped = sessionStartErrorMessage(err);
        setStatus(mapped.status);
      }
    };

    const unlockAsAdmin = async (payload?: {
      occupantKind?: string;
      durationSec?: number;
      guestLabel?: string;
      customerId?: string;
      customerName?: string;
    }) => {
      const rawKind = payload?.occupantKind || "staff_timed";
      const kind: OccupantState["kind"] =
        rawKind === "staff_open" || rawKind === "guest_named" || rawKind === "staff_timed"
          ? rawKind
          : "staff_timed";
      const maxTimed = (usageFlagsRef.current.staffTimedMaxMinutes || 240) * 60;
      let durationSec: number | null = null;
      if (kind === "staff_timed") {
        durationSec = Math.min(maxTimed, Math.max(60, payload?.durationSec || 3600));
      } else if (kind === "guest_named") {
        durationSec =
          payload?.durationSec != null
            ? Math.min(maxTimed, Math.max(60, payload.durationSec))
            : null;
      }
      if (durationSec && durationSec >= 60) {
        sessionSafetyRef.current.staffUnlockMaxSeconds = durationSec;
      }
      deskLiberarRef.current = false;
      sessionStartedAtRef.current = Date.now();
      setElapsed(0);
      setSession(null);
      const deskName = (payload?.customerName || payload?.guestLabel || "").trim();
      if (kind === "guest_named") {
        const label = (payload?.guestLabel || "Convidado").slice(0, 40);
        staffUnlockMetaRef.current = { kind, durationSec, label };
        setCustomer({ id: "guest", name: label, level: "bronze", points: 0 });
        setStatus(
          durationSec
            ? `Convidado · ${label} · ${Math.round(durationSec / 60)} min`
            : `Convidado · ${label} · até travar`,
        );
      } else {
        staffUnlockMetaRef.current = {
          kind,
          durationSec,
          label: kind === "staff_open" && deskName ? deskName : null,
        };
        setCustomer({
          id: "staff",
          name:
            kind === "staff_open"
              ? deskName
                ? `Aberto · ${deskName}`
                : "Admin (aberto)"
              : "Admin",
          level: "ouro",
          points: 0,
        });
        setStatus(
          kind === "staff_open"
            ? deskName
              ? `Aberto · ${deskName} — trava só pelo Central`
              : "Modo Admin aberto — trava só pelo Central"
            : `Modo Admin — auto-trava em ${Math.round((durationSec || 0) / 60)} min`,
        );
      }
      setAbsentLeft(null);
      absentSinceRef.current = null;
      presenceMissStreakRef.current = 0;
      if (configRef.current) reportStaffUnlock(configRef.current, kind).catch(() => undefined);
      await unlockUi();
    };

    const offEnd = window.geeklock.onRequestEndSessionConfirmed(() => {
      if (phaseRef.current === "unlocked") {
        if (sessionRef.current) {
          doEndSession("tray_end").catch(() => undefined);
        } else {
          lockUi().catch(() => undefined);
        }
      }
    });
    const offLockReq = window.geeklock.onRequestLock(() => {
      requestLockStation();
    });
    const offLockState = window.geeklock.onLockState((data) => {
      if (data.locked && phaseRef.current === "unlocked") {
        requestLockStation();
        return;
      }
      if (data.locked && (data.paint || data.prepare)) {
        if (phaseRef.current !== "locked") {
          flushSync(() => {
            setPhase("locked");
            phaseRef.current = "locked";
            setStatus("Aguardando VIP...");
          });
        }
        flushSync(() => setLockPaintNonce((n) => n + 1));
      }
    });

    (window as unknown as { __geeklockRequestLock?: () => void }).__geeklockRequestLock = requestLockStation;
    (window as unknown as {
      __geeklockUnlockAdmin?: (payload?: {
        occupantKind?: string;
        durationSec?: number;
        guestLabel?: string;
      }) => Promise<void>;
    }).__geeklockUnlockAdmin = unlockAsAdmin;
    (
      window as unknown as {
        __geeklockUnlockVipDesk?: typeof unlockAsVipDesk;
      }
    ).__geeklockUnlockVipDesk = unlockAsVipDesk;

    return () => {
      offEnd();
      offLockReq();
      offLockState();
      delete (window as unknown as { __geeklockRequestLock?: () => void }).__geeklockRequestLock;
      delete (window as unknown as { __geeklockUnlockAdmin?: unknown }).__geeklockUnlockAdmin;
      delete (window as unknown as { __geeklockUnlockVipDesk?: unknown }).__geeklockUnlockVipDesk;
    };
  }, [doEndSession, lockUi, unlockUi]);

  useRecognizeLoop({
    phase,
    config,
    videoRef,
    configRef,
    faceGraceUntilRef,
    scanPaused: loginPrompt != null,
    declinedLoginRef,
    onMatchConfirmed: handleMatchConfirmed,
    setScanning,
    setScanReason,
    setCustomer,
    setScore,
    setStatus,
    setWelcomeCustomer,
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
    sessionId: session?.id,
    customerId: customer?.id,
    videoRef,
    streamRef,
    configRef,
    sessionRef,
    faceGraceUntilRef,
    absentSinceRef,
    presenceMissStreakRef,
    deskLiberarRef,
    startCam,
    doEndSession,
    onIntruder: handleIntruder,
    setBalanceSeconds: syncBalance,
    setLowBalanceWarn,
    onLowBalanceWarn: showLowBalanceBanner,
  });

  // T6 — staff_timed / guest timed: auto-trava + "resta".
  // Hora livre (staff_open / convidado sem tempo): tempo correndo para cima.
  useEffect(() => {
    if (phase !== "unlocked") return;
    const id = customer?.id;
    if (id !== "staff" && id !== "guest") return;
    const meta = staffUnlockMetaRef.current;
    const openUnlock =
      meta?.kind === "staff_open" ||
      (meta?.kind === "guest_named" && (meta.durationSec == null || meta.durationSec <= 0));
    if (sessionStartedAtRef.current == null) {
      sessionStartedAtRef.current = Date.now();
    }
    if (openUnlock) {
      const tick = () => {
        const start = sessionStartedAtRef.current;
        const sec = start != null ? Math.max(0, Math.floor((Date.now() - start) / 1000)) : 0;
        const label =
          meta?.label || (meta?.kind === "staff_open" ? "Admin (aberto)" : id === "guest" ? "Convidado" : "Equipe");
        setStatus(`${label} — ${formatBalanceShort(sec)}`);
      };
      tick();
      const t = window.setInterval(tick, 1000);
      return () => window.clearInterval(t);
    }
    const maxSec =
      meta?.durationSec && meta.durationSec > 0
        ? meta.durationSec
        : sessionSafetyRef.current.staffUnlockMaxSeconds || DEFAULT_STAFF_UNLOCK_MAX_SEC;
    const tick = () => {
      const left = staffUnlockLeftSeconds(sessionStartedAtRef.current, maxSec);
      if (left <= 0) {
        sessionStartedAtRef.current = null;
        customerRef.current = null;
        setCustomer(null);
        staffUnlockMetaRef.current = null;
        setStatus(id === "guest" ? "Convidado — tempo esgotado" : "Equipe — tempo esgotado");
        lockUi().catch(() => undefined);
        return;
      }
      const label = meta?.label || (id === "guest" ? "Convidado" : "Equipe");
      setStatus(`${label} — resta ${formatBalanceShort(left)}`);
    };
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [phase, customer?.id, lockUi]);

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
        initialConfig={config}
        onDone={async (cfg) => {
          setConfig(cfg);
          setStatus("Conectado ao servidor");
          try {
            await heartbeat(cfg);
            await lockUi();
          } catch (err) {
            setPhase("offline");
            setStatus(err instanceof Error ? err.message : "Sem conexão com o Central");
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
        banner={remoteBannerEl}
        onRetry={retryOnline}
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
      key={lockPaintNonce}
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
      portalQrUrl={portalRegisterUrl(portalBaseUrl)}
      loginPrompt={loginPrompt}
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
      onConfirmLogin={() => {
        confirmLogin().catch(() => undefined);
      }}
      onCancelLogin={cancelLogin}
    />
  );
}
