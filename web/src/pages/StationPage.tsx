import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { api, attachCameraStream, captureFrame, openUserCamera, wsUrl, type Customer, type Reward } from "../api";

const TOKEN_KEY = "lg_station_token";
const NAME_KEY = "lg_station_name";

export default function StationPage() {
  const [params] = useSearchParams();
  const [token, setToken] = useState(localStorage.getItem(TOKEN_KEY) || "");
  const [draftToken, setDraftToken] = useState("");
  const [name, setName] = useState(params.get("name") || localStorage.getItem(NAME_KEY) || "");
  const [secret, setSecret] = useState("");
  const [setupError, setSetupError] = useState("");
  const [status, setStatus] = useState<"idle" | "scanning" | "matched" | "unknown">("idle");
  const [message, setMessage] = useState("");
  const [locked, setLocked] = useState(false);
  const [lockText, setLockText] = useState("Estação bloqueada pela central");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [amount, setAmount] = useState("50");
  const [busy, setBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);
  const cooldownRef = useRef(0);

  const claimStation = async (e: FormEvent) => {
    e.preventDefault();
    setSetupError("");
    try {
      if (draftToken.trim().length > 10) {
        localStorage.setItem(TOKEN_KEY, draftToken.trim());
        localStorage.setItem(NAME_KEY, name || "Estação");
        setToken(draftToken.trim());
        return;
      }
      const station = await api<{ id: string; name: string; token: string }>("/api/stations/claim", {
        method: "POST",
        body: JSON.stringify({ name: name || "Estação", sharedSecret: secret }),
        token: null,
      });
      localStorage.setItem(TOKEN_KEY, station.token);
      localStorage.setItem(NAME_KEY, station.name);
      setToken(station.token);
      setName(station.name);
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : "Falha ao registrar");
    }
  };

  const startCamera = useCallback(async () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    const stream = await openUserCamera();
    streamRef.current = stream;
    if (videoRef.current) {
      await attachCameraStream(videoRef.current, stream);
    }
    setStatus("scanning");
  }, []);

  useEffect(() => {
    if (!token) return;
    startCamera().catch((err) => setMessage(err.message));
    api<Reward[]>("/api/rewards", { stationToken: token, token: null })
      .then(setRewards)
      .catch(() => undefined);

    const hb = setInterval(() => {
      api("/api/stations/heartbeat", {
        method: "POST",
        body: JSON.stringify({ token }),
        token: null,
      }).catch(() => undefined);
    }, 8000);

    const ws = new WebSocket(wsUrl("station", token));
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "command") {
          if (msg.command === "reload") location.reload();
          if (msg.command === "message") {
            setMessage(String(msg.text || ""));
            setTimeout(() => setMessage(""), 6000);
          }
          if (msg.command === "lock_screen") {
            setLocked(true);
            setLockText(String(msg.text || "Estação bloqueada pela central"));
          }
          if (msg.command === "unlock_screen") setLocked(false);
        }
        if (msg.type === "vip_detected" && msg.customer) {
          setCustomer(msg.customer);
          setScore(msg.score ?? null);
          setStatus("matched");
          cooldownRef.current = Date.now() + 8000;
        }
        if (msg.type === "points_updated" || msg.type === "reward_redeemed") {
          if (msg.customer) setCustomer(msg.customer);
        }
      } catch {
        /* ignore */
      }
    };

    return () => {
      clearInterval(hb);
      ws.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [token, startCamera]);

  useEffect(() => {
    if (!token || status === "idle") return;
    const timer = setInterval(async () => {
      if (scanningRef.current || locked) return;
      if (Date.now() < cooldownRef.current) return;
      if (!videoRef.current || videoRef.current.readyState < 2) return;
      scanningRef.current = true;
      try {
        const imageBase64 = captureFrame(videoRef.current, 0.65);
        const res = await api<{
          matched: boolean;
          customer?: Customer;
          score?: number;
          reason?: string;
        }>("/api/recognize", {
          method: "POST",
          body: JSON.stringify({ imageBase64 }),
          stationToken: token,
          token: null,
        });
        if (res.matched && res.customer) {
          setCustomer(res.customer);
          setScore(res.score ?? null);
          setStatus("matched");
          cooldownRef.current = Date.now() + 8000;
        } else if (status !== "matched") {
          setStatus("unknown");
        }
      } catch {
        /* ignore transient */
      } finally {
        scanningRef.current = false;
      }
    }, 2200);
    return () => clearInterval(timer);
  }, [token, status, locked]);

  const addPoints = async () => {
    if (!customer) return;
    setBusy(true);
    try {
      const res = await api<{ customer: Customer }>(`/api/customers/${customer.id}/points`, {
        method: "POST",
        body: JSON.stringify({ amountReais: Number(amount), reason: "Compra na estação" }),
        stationToken: token,
        token: null,
      });
      setCustomer(res.customer);
      setMessage(`+pontos OK — saldo ${res.customer.points}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erro");
    } finally {
      setBusy(false);
    }
  };

  const redeem = async (rewardId: string) => {
    if (!customer) return;
    setBusy(true);
    try {
      const res = await api<{ customer: Customer; reward: Reward }>(
        `/api/customers/${customer.id}/redeem`,
        {
          method: "POST",
          body: JSON.stringify({ rewardId }),
          stationToken: token,
          token: null,
        },
      );
      setCustomer(res.customer);
      setMessage(`Resgatado: ${res.reward.title}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erro");
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <div className="shell" style={{ maxWidth: 480 }}>
        <h1 className="brand">Estação</h1>
        <form className="panel" onSubmit={claimStation}>
          <div className="field">
            <label>Nome da estação</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="PC-01" required />
          </div>
          <div className="field">
            <label>Token (se já criado no admin)</label>
            <input
              value={draftToken}
              onChange={(e) => setDraftToken(e.target.value)}
              placeholder="Cole o token ou deixe vazio para claim"
            />
          </div>
          <div className="field">
            <label>Segredo compartilhado (claim automático)</label>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Informe o segredo da loja (não fica salvo na tela)"
              autoComplete="off"
            />
          </div>
          {setupError && <p style={{ color: "crimson" }}>{setupError}</p>}
          <button className="btn" type="submit">
            Ativar estação
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="shell">
      {locked && (
        <div className="lock-overlay">
          <div>
            <h1 className="brand" style={{ color: "white" }}>
              LOCK
            </h1>
            <p>{lockText}</p>
          </div>
        </div>
      )}

      <div className="row" style={{ justifyContent: "space-between", marginBottom: "0.75rem" }}>
        <div>
          <p className="muted" style={{ margin: 0 }}>
            Estação
          </p>
          <h1 className="brand" style={{ fontSize: "2.2rem" }}>
            {name || "VIP Cam"}
          </h1>
        </div>
        <span
          className={`status-pill ${
            status === "matched" ? "ok" : status === "unknown" ? "warn" : status === "scanning" ? "" : "bad"
          }`}
        >
          {status === "matched"
            ? "VIP encontrado"
            : status === "unknown"
              ? "Desconhecido"
              : status === "scanning"
                ? "Procurando..."
                : "Parado"}
        </span>
      </div>

      {message && <div className="banner">{message}</div>}

      <div className="grid-2">
        <section className="panel">
          <div className="video-wrap">
            <video ref={videoRef} muted playsInline />
          </div>
          <div className="row" style={{ marginTop: "0.75rem" }}>
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                setCustomer(null);
                setScore(null);
                setStatus("scanning");
                cooldownRef.current = 0;
              }}
            >
              Limpar / continuar
            </button>
            <button
              className="btn danger"
              type="button"
              onClick={() => {
                localStorage.removeItem(TOKEN_KEY);
                localStorage.removeItem(NAME_KEY);
                location.reload();
              }}
            >
              Reset estação
            </button>
          </div>
        </section>

        <section className="panel">
          {!customer && (
            <p className="muted">Posicione o rosto do cliente VIP em frente à webcam.</p>
          )}
          {customer && (
            <>
              <h2 style={{ fontFamily: "var(--display)", marginTop: 0 }}>{customer.name}</h2>
              <div className="row">
                <span className={`tag ${customer.level}`}>{customer.level}</span>
                <strong>{customer.points} pontos</strong>
                {score !== null && <span className="muted">match {(score * 100).toFixed(0)}%</span>}
              </div>

              <div className="field" style={{ marginTop: "1rem" }}>
                <label>Valor da compra (R$)</label>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min={1} />
              </div>
              <button className="btn" disabled={busy} type="button" onClick={addPoints}>
                Somar pontos
              </button>

              <h3>Resgatar</h3>
              <div className="row">
                {rewards
                  .filter((r) => r.active)
                  .map((r) => (
                    <button
                      key={r.id}
                      className="btn ghost"
                      disabled={busy || customer.points < r.cost_points}
                      type="button"
                      onClick={() => redeem(r.id)}
                    >
                      {r.title} ({r.cost_points})
                    </button>
                  ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
