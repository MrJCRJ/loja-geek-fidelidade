import { useCallback, useEffect, useRef, useState } from "react";
import {
  captureFrame,
  checkHealth,
  claimStation,
  endSession,
  formatDuration,
  heartbeat,
  openUserCamera,
  recognize,
  sessionHeartbeat,
  startSession,
} from "./api";
import type { Customer, GeekLockConfig, Session } from "./vite-env";

type Phase = "boot" | "offline" | "locked" | "unlocked" | "staff";

export default function App() {
  const [config, setConfig] = useState<GeekLockConfig | null>(null);
  const [phase, setPhase] = useState<Phase>("boot");
  const [status, setStatus] = useState("Iniciando...");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [pin, setPin] = useState("");
  const [pinMode, setPinMode] = useState<"unlock" | "quit" | null>(null);
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);
  const absentSinceRef = useRef<number | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const customerRef = useRef<Customer | null>(null);
  const configRef = useRef<GeekLockConfig | null>(null);
  const phaseRef = useRef<Phase>("boot");

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
    const stream = await openUserCamera();
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }
  }, []);

  const lockUi = useCallback(async () => {
    await window.geeklock.lock();
    setPhase("locked");
    setStatus("Aguardando VIP...");
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
  }, []);

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
      absentSinceRef.current = null;
      await lockUi();
    },
    [lockUi],
  );

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

  // Tray events
  useEffect(() => {
    const offEnd = window.geeklock.onRequestEndSession(() => {
      if (phaseRef.current === "unlocked") {
        doEndSession("tray_end").catch(() => undefined);
      }
    });
    const offQuit = window.geeklock.onRequestQuit(() => {
      setPinMode("quit");
      setPin("");
    });
    return () => {
      offEnd();
      offQuit();
    };
  }, [doEndSession]);

  // Recognize loop when locked
  useEffect(() => {
    if (phase !== "locked" || !config?.stationToken) return;
    const timer = setInterval(async () => {
      if (scanningRef.current) return;
      if (!videoRef.current || videoRef.current.readyState < 2) return;
      scanningRef.current = true;
      try {
        const imageBase64 = captureFrame(videoRef.current);
        const res = await recognize(config, imageBase64);
        if (res.matched && res.customer) {
          setCustomer(res.customer);
          setScore(res.score ?? null);
          setStatus(`VIP ${res.customer.name}`);
          const started = await startSession(config, res.customer.id);
          setSession(started.session);
          setElapsed(started.session.seconds_total);
          absentSinceRef.current = null;
          await unlockUi();
        } else {
          setStatus(res.reason === "no_face" ? "Posicione o rosto" : "Não reconhecido");
        }
      } catch (err) {
        setStatus(err instanceof Error ? err.message : "Erro no reconhecimento");
      } finally {
        scanningRef.current = false;
      }
    }, 2200);
    return () => clearInterval(timer);
  }, [phase, config, unlockUi]);

  // Presence while unlocked: keep cam + heartbeat session + relock if absent
  useEffect(() => {
    if (phase !== "unlocked" || !config?.stationToken || !session) return;

    startCam().catch(() => undefined);

    const timer = setInterval(async () => {
      const cfg = configRef.current;
      const sess = sessionRef.current;
      const vip = customerRef.current;
      if (!cfg || !sess || !vip) return;

      try {
        const hb = await sessionHeartbeat(cfg, sess.id);
        setSession(hb.session);
        setElapsed(hb.session.seconds_total);
      } catch {
        /* sessão pode ter expirado */
      }

      if (!videoRef.current || videoRef.current.readyState < 2) return;
      try {
        const imageBase64 = captureFrame(videoRef.current, 0.55);
        const res = await recognize(cfg, imageBase64);
        const sameVip = res.matched && res.customer?.id === vip.id;
        const limit = (cfg.absentSecondsToLock || 60) * 1000;
        if (sameVip) {
          absentSinceRef.current = null;
        } else {
          if (absentSinceRef.current == null) absentSinceRef.current = Date.now();
          else if (Date.now() - absentSinceRef.current >= limit) {
            await doEndSession("absent");
          }
        }
      } catch {
        if (absentSinceRef.current == null) absentSinceRef.current = Date.now();
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [phase, config, session, startCam, doEndSession]);

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
      setPhase("unlocked");
      setStatus("Desbloqueio staff");
      setCustomer({ id: "staff", name: "Staff", level: "ouro", points: 0 });
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

  if (phase === "boot") {
    return (
      <div className="screen">
        <div className="card">
          <h1 className="brand">GeekLock</h1>
          <p className="muted">{status}</p>
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
          <p>PC bloqueado. Conecte-se ao servidor da loja (PC controle).</p>
          <p className="muted">{status}</p>
          {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
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
              PIN staff
            </button>
          </div>
          {pinMode && (
            <div className="field">
              <label>PIN staff</label>
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
      <>
        <div className="unlocked-bar">
          <strong>{customer?.name || "Sessão"}</strong>
          <span className="pill ok">{formatDuration(elapsed)}</span>
          <button className="btn danger" type="button" onClick={() => doEndSession("manual")}>
            Encerrar / Travar
          </button>
        </div>
        {/* câmera oculta para presença */}
        <video ref={videoRef} muted playsInline style={{ position: "fixed", width: 1, height: 1, opacity: 0 }} />
      </>
    );
  }

  // locked
  return (
    <div className="screen">
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h1 className="brand">GeekLock</h1>
            <p className="muted" style={{ margin: 0 }}>
              {config?.stationName} · só VIP libera a máquina
            </p>
          </div>
          <span className="pill warn">{status}</span>
        </div>

        <div className="grid" style={{ marginTop: "1rem" }}>
          <div className="video-wrap">
            <video ref={videoRef} muted playsInline />
          </div>
          <div>
            <p>Olhe para a câmera. O PC só destrava se o servidor confirmar que você é VIP.</p>
            {customer && (
              <p>
                Último match: <strong>{customer.name}</strong>{" "}
                {score != null && <span className="muted">({(score * 100).toFixed(0)}%)</span>}
              </p>
            )}
            {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
            <div className="row">
              <button
                className="btn ghost"
                type="button"
                onClick={() => {
                  setPinMode("unlock");
                  setPin("");
                }}
              >
                PIN staff
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
                <label>PIN staff ({pinMode === "quit" ? "sair" : "desbloquear"})</label>
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
