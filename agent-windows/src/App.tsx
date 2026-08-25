import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  attachCameraStream,
  captureFrame,
  checkHealth,
  claimStation,
  endSession,
  heartbeat,
  openUserCamera,
  checkPresence,
  recognize,
  sessionHeartbeat,
  startSession,
} from "./api";
import { StationSocket, type StationCommand } from "./ws";
import type { Customer, GeekLockConfig, Session } from "./vite-env";

type Phase = "boot" | "offline" | "locked" | "unlocked" | "staff";
type ScanVisual = "idle" | "scanning" | "warn" | "error" | "success";

const DEFAULT_ABSENT_SEC = 90;
const PRESENCE_MS = 1800;
const SESSION_HB_MS = 8000;
/** Match único forte libera; senão precisa de 2 frames. */
const STRONG_MATCH_SCORE = 0.55;
const KEEP_STREAK_MIN_SCORE = 0.4;

function scanVisualFromReason(reason?: string, scanning?: boolean): ScanVisual {
  if (scanning) return "scanning";
  if (reason === "no_face" || !reason) return "idle";
  if (reason === "low_quality") return "error";
  if (reason === "no_gallery") return "error";
  if (reason === "unknown" || reason === "ambiguous") return "warn";
  return "idle";
}

function statusIcon(reason?: string) {
  if (reason === "no_gallery") return "⚠";
  if (reason === "low_quality" || reason === "no_face") return "◎";
  if (reason === "unknown" || reason === "ambiguous") return "?";
  return "◉";
}

function playUnlockChime() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    osc.onended = () => {
      ctx.close().catch(() => undefined);
    };
  } catch {
    /* ignore */
  }
}


function sessionStartErrorMessage(err: unknown): { reason: string; status: string } {
  if (err instanceof ApiError) {
    if (err.code === "no_consent") {
      return { reason: "no_consent", status: "Sem consentimento LGPD — cadastre de novo no portal" };
    }
    if (err.code === "no_credit" || /cr[eé]dito|caixa/i.test(err.message)) {
      return { reason: "no_credit", status: err.message || "Sem crédito — passe no caixa" };
    }
    return { reason: "error", status: err.message || "Não foi possível iniciar a sessão" };
  }
  if (err instanceof Error) {
    if (/consentimento|LGPD/i.test(err.message)) {
      return { reason: "no_consent", status: err.message };
    }
    if (/cr[eé]dito|caixa/i.test(err.message)) {
      return { reason: "no_credit", status: err.message };
    }
    return { reason: "error", status: err.message };
  }
  return { reason: "no_credit", status: "Sem crédito — passe no caixa" };
}

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);
  const absentSinceRef = useRef<number | null>(null);
  const noFaceStreakRef = useRef(0);
  const serviceDownStreakRef = useRef(0);
  const matchStreakRef = useRef<{ id: string; count: number } | null>(null);
  const presenceMissStreakRef = useRef(0);
  const handoffStreakRef = useRef<{ id: string; count: number } | null>(null);
  const handoffBusyRef = useRef(false);
  const sessionRef = useRef<Session | null>(null);
  const customerRef = useRef<Customer | null>(null);
  const configRef = useRef<GeekLockConfig | null>(null);
  const phaseRef = useRef<Phase>("boot");
  const scanTimerRef = useRef<number | null>(null);
  const presenceTimerRef = useRef<number | null>(null);
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

    const handleCommand = (command: StationCommand, text?: string) => {
      if (command === "reload") {
        location.reload();
        return;
      }
      if (command === "message" && text) {
        setStatus(text);
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

  // Recognize loop when locked
  useEffect(() => {
    if (phase !== "locked" || !config?.stationToken) return;

    let cancelled = false;
    matchStreakRef.current = null;

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
          const score = res.score ?? 0;
          const prev = matchStreakRef.current;
          if (prev && prev.id === res.customer.id) {
            matchStreakRef.current = { id: res.customer.id, count: prev.count + 1 };
          } else {
            matchStreakRef.current = { id: res.customer.id, count: 1 };
          }

          const streak = matchStreakRef.current.count;
          const strongEnough = score >= STRONG_MATCH_SCORE;
          const confirmed = strongEnough || streak >= 2;

          setScanReason(undefined);
          setCustomer(res.customer);
          setScore(score);
          if (!confirmed) {
            setStatus(`Confirmando ${res.customer.name}… (${streak}/2 · ${(score * 100).toFixed(0)}%)`);
            return;
          }

          const bal =
            typeof res.timeBalanceSeconds === "number" ? res.timeBalanceSeconds : null;
          if (bal != null && bal <= 0) {
            matchStreakRef.current = null;
            setWelcomeCustomer(null);
            setScanReason("no_credit");
            setStatus("Sem crédito — passe no caixa para liberar o PC");
            return;
          }

          setStatus(`VIP ${res.customer.name} reconhecido — liberando`);
          setWelcomeCustomer(res.customer);

          try {
            const started = await startSession(config, res.customer.id);
            if (cancelled) return;
            setSession(started.session);
            if (started.customer) setCustomer(started.customer);
            const startedAt = Date.parse(started.session.started_at);
            sessionStartedAtRef.current = Number.isFinite(startedAt) ? startedAt : Date.now();
            setElapsed(Math.max(0, Math.floor((Date.now() - sessionStartedAtRef.current) / 1000)));
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
              // Mantém streak se já tinha 1 match e o score ainda é alto
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

    scheduleNext();

    return () => {
      cancelled = true;
      if (scanTimerRef.current != null) {
        window.clearTimeout(scanTimerRef.current);
        scanTimerRef.current = null;
      }
    };
  }, [phase, config, unlockUi]);

  // Presença: só VIP (Admin não retrava por ausência)
  useEffect(() => {
    if (phase !== "unlocked" || !config?.stationToken) return;
    if (customer?.id === "staff") return;
    if (!session) return;

    if (!streamRef.current?.active) {
      startCam().catch(() => undefined);
    }

    let cancelled = false;
    let lastHb = 0;

    const tick = async () => {
      if (cancelled) return;
      const cfg = configRef.current;
      const sess = sessionRef.current;
      if (!cfg) return;

      const now = Date.now();
      if (sess && now - lastHb >= SESSION_HB_MS) {
        lastHb = now;
        try {
          const hb = await sessionHeartbeat(cfg, sess.id);
          setSession(hb.session);
          if (hb.timeDepleted || hb.session?.time_depleted) {
            await doEndSession("no_credit");
            return;
          }
        } catch {
          /* ledger pode falhar — timer local continua */
        }
      }

      const limitSec = cfg.absentSecondsToLock || DEFAULT_ABSENT_SEC;
      const limitMs = limitSec * 1000;

      if (!videoRef.current || videoRef.current.readyState < 2) {
        presenceMissStreakRef.current += 1;
        if (presenceMissStreakRef.current >= 3 && absentSinceRef.current == null) {
          absentSinceRef.current = Date.now();
        }
      } else {
        try {
          const imageBase64 = captureFrame(videoRef.current, 0.85);
          const vipId = sessionRef.current?.customer_id || customer?.id;
          const res = await checkPresence(cfg, imageBase64, vipId);
          if (res.reason === "service_down") {
            // Não avança ausência durante reinício do face-service
            presenceMissStreakRef.current = 0;
          } else if (res.present) {
            presenceMissStreakRef.current = 0;
            handoffStreakRef.current = null;
            absentSinceRef.current = null;
            setAbsentLeft(null);
          } else {
            const otherId = res.bestCustomerId || null;
            const otherScore = res.bestScore ?? 0;
            const canHandoff =
              !!otherId &&
              otherId !== vipId &&
              (res.reason === "other_vip" || otherScore >= STRONG_MATCH_SCORE);

            if (canHandoff && !handoffBusyRef.current) {
              const prev = handoffStreakRef.current;
              if (prev && prev.id === otherId) {
                handoffStreakRef.current = { id: otherId, count: prev.count + 1 };
              } else {
                handoffStreakRef.current = { id: otherId, count: 1 };
              }
              if (handoffStreakRef.current.count >= 2) {
                handoffBusyRef.current = true;
                try {
                  const started = await startSession(cfg, otherId);
                  if (cancelled) return;
                  setSession(started.session);
                  if (started.customer) {
                    setCustomer(started.customer);
                  } else {
                    setCustomer({
                      id: otherId,
                      name: started.session.customer_name || "VIP",
                      level: "bronze",
                      points: 0,
                    });
                  }
                  const startedAt = Date.parse(started.session.started_at);
                  sessionStartedAtRef.current = Number.isFinite(startedAt) ? startedAt : Date.now();
                  setElapsed(0);
                  presenceMissStreakRef.current = 0;
                  handoffStreakRef.current = null;
                  absentSinceRef.current = null;
                  setAbsentLeft(null);
                  setStatus(`Sessão: ${started.session.customer_name || "VIP"}`);
                  playUnlockChime();
                } catch (err) {
                  handoffStreakRef.current = null;
                  const mapped = sessionStartErrorMessage(err);
                  if (mapped.reason === "no_credit") {
                    setStatus("Outro VIP sem crédito — aguardando ausência");
                  }
                  presenceMissStreakRef.current += 1;
                  if (presenceMissStreakRef.current >= 3 && absentSinceRef.current == null) {
                    absentSinceRef.current = Date.now();
                  }
                } finally {
                  handoffBusyRef.current = false;
                }
              }
            } else {
              handoffStreakRef.current = null;
              // no_face, low_quality, unknown, ambiguous — conta como ausência
              presenceMissStreakRef.current += 1;
              if (presenceMissStreakRef.current >= 3 && absentSinceRef.current == null) {
                absentSinceRef.current = Date.now();
              }
            }
          }
        } catch {
          presenceMissStreakRef.current += 1;
          if (presenceMissStreakRef.current >= 3 && absentSinceRef.current == null) {
            absentSinceRef.current = Date.now();
          }
        }
      }

      if (absentSinceRef.current != null) {
        const left = Math.ceil((limitMs - (Date.now() - absentSinceRef.current)) / 1000);
        setAbsentLeft(Math.max(0, left));
        if (left <= 0) {
          await doEndSession("absent");
          return;
        }
      } else {
        setAbsentLeft(null);
      }

      if (!cancelled) {
        presenceTimerRef.current = window.setTimeout(() => {
          tick().catch(() => undefined);
        }, PRESENCE_MS);
      }
    };

    tick().catch(() => undefined);

    return () => {
      cancelled = true;
      if (presenceTimerRef.current != null) {
        window.clearTimeout(presenceTimerRef.current);
        presenceTimerRef.current = null;
      }
    };
  }, [phase, config, session, customer?.id, startCam, doEndSession]);

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

  if (phase === "offline") {
    return (
      <div className="screen">
        <div className="card">
          <h1 className="brand">GeekLock</h1>
          <span className="pill bad">Sem conexão</span>
          <p className="kiosk-lead">PC bloqueado. Conecte-se ao servidor da loja (PC controle).</p>
          <p className="muted kiosk-status">{status}</p>
          {error && <p className="error-text">{error}</p>}
          <div className="row">
            <button className="btn" type="button" onClick={retryOnline}>
              Tentar de novo
            </button>
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                setPinMode("unlock");
                setPin("");
              }}
            >
              PIN Admin
            </button>
          </div>
          {pinMode && (
            <div className="field">
              <label>PIN Admin</label>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitPin()}
              />
              <button className="btn" type="button" onClick={submitPin}>
                Confirmar
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (phase === "unlocked") {
    return (
      <div className="session-hidden">
        <video ref={videoRef} muted playsInline className="session-hidden-cam" />
      </div>
    );
  }

  return (
    <div className="screen screen-locked">
      <header className="locked-topbar">
        <div className="locked-topbar-brand">
          <strong>GeekLock</strong>
          <span className="muted locked-topbar-station">{config?.stationName}</span>
        </div>
        <span className={`pill ${scanReason === "no_gallery" ? "bad" : "warn"} kiosk-status-pill`}>
          {statusIcon(scanReason)} {status}
        </span>
        <button
          className="btn ghost locked-topbar-pin"
          type="button"
          onClick={() => {
            setPinMode("unlock");
            setPin("");
          }}
        >
          PIN Admin
        </button>
      </header>
      <p className="muted locked-conn-hint">
        Conectado ao PC controle
        {score != null && score > 0 ? ` · score ${(score * 100).toFixed(0)}%` : ""}
      </p>

      {welcomeCustomer && (
        <div className="welcome-splash">
          <p className="welcome-kicker">Bem-vindo</p>
          <h2 className="welcome-name">{welcomeCustomer.name}</h2>
          <span className={`level-badge lg ${welcomeCustomer.level}`}>{welcomeCustomer.level}</span>
          <p className="muted">Liberando máquina…</p>
        </div>
      )}

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h1 className="brand">GeekLock</h1>
            <p className="muted kiosk-sub" style={{ margin: 0 }}>
              {config?.stationName} · só VIP libera a máquina
            </p>
          </div>
          <span className={`pill ${scanReason === "no_gallery" ? "bad" : "warn"} kiosk-status-pill`}>
            {statusIcon(scanReason)} {status}
          </span>
        </div>

        <p className="muted kiosk-sub" style={{ margin: "0.35rem 0 0" }}>
          Conectado ao PC controle
          {showScore ? ` · score ${(score! * 100).toFixed(0)}%` : ""}
        </p>

        <div className="grid" style={{ marginTop: "1rem" }}>
          <div className="video-wrap">
            <video ref={videoRef} muted playsInline />
            {!camReady && (
              <div className="video-placeholder">
                <p>Câmera indisponível</p>
                <p className="muted">Use PIN Admin ou reconecte o DroidCam</p>
              </div>
            )}
            <div className={`face-guide scan-${ovalClass}`} aria-hidden />
            <p className="face-guide-label">
              {scanning ? "Analisando rosto…" : "Centralize o rosto"}
            </p>
          </div>
          <div>
            <p className="kiosk-lead">
              Olhe para a câmera. O PC só destrava se o servidor confirmar que você é VIP.
            </p>
            {showScore && (
              <p className="muted score-line">
                Score: <strong>{(score! * 100).toFixed(0)}%</strong>
              </p>
            )}
            {error && <p className="error-text">{error}</p>}
            <div className="row">
              <button
                className="btn ghost"
                type="button"
                onClick={() => {
                  setPinMode("unlock");
                  setPin("");
                }}
              >
                PIN Admin
              </button>
              <button
                className="btn ghost"
                type="button"
                onClick={() => {
                  setPinMode("quit");
                  setPin("");
                }}
              >
                Sair do app
              </button>
            </div>
            {pinMode && (
              <div className="field">
                <label>PIN Admin ({pinMode === "quit" ? "sair" : "desbloquear"})</label>
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitPin()}
                  autoFocus
                />
                <button className="btn" type="button" onClick={submitPin}>
                  Confirmar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
