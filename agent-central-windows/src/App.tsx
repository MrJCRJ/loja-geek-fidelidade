import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { CentralStatus } from "./vite-env";

const empty: CentralStatus = {
  phase: "boot",
  api: false,
  face: false,
  lanIp: "...",
  apiPort: 8787,
  facePort: 8100,
  adminPassword: "",
  needsSetup: true,
  setupComplete: false,
  unitName: "Unidade 1",
  startedAt: null,
  uptimeMs: 0,
  faceError: "",
  lastFaceCheck: "",
  error: "",
  logs: [],
};

function formatUptime(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(r).padStart(2, "0")}s`;
  return `${r}s`;
}

export default function App() {
  const [status, setStatus] = useState<CentralStatus>(empty);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPassword2, setAdminPassword2] = useState("");
  const [unitName, setUnitName] = useState("Unidade 1");
  const [jwtSecret, setJwtSecret] = useState("");
  const [stationSecret, setStationSecret] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    window.geekcentral.getStatus().then(setStatus).catch(() => undefined);
    window.geekcentral
      .peekSetup()
      .then((peek) => {
        setStatus(peek);
        if (peek.suggestedJwt) setJwtSecret(peek.suggestedJwt);
        if (peek.suggestedStation) setStationSecret(peek.suggestedStation);
        if (peek.unitName) setUnitName(peek.unitName);
      })
      .catch(() => undefined);
    return window.geekcentral.onStatus(setStatus);
  }, []);

  useEffect(() => {
    if (status.phase !== "running" || !status.startedAt) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [status.phase, status.startedAt]);

  const uptimeLabel = useMemo(() => {
    void tick;
    if (!status.startedAt) return "—";
    return formatUptime(Date.now() - status.startedAt);
  }, [status.startedAt, tick]);

  const adminUrl = `http://${status.lanIp}:${status.apiPort}/admin`;
  const stationUrl = `http://${status.lanIp}:${status.apiPort}/station?name=PC-01`;
  const localAdmin = `http://127.0.0.1:${status.apiPort}/admin`;

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      setCopied("falha ao copiar");
    }
  };

  const restart = async () => {
    setBusy(true);
    try {
      const res = await window.geekcentral.restart();
      if (res.status) setStatus(res.status);
    } finally {
      setBusy(false);
    }
  };

  const submitSetup = async (e: FormEvent) => {
    e.preventDefault();
    setSetupError("");
    if (adminPassword.length < 8) {
      setSetupError("Senha com pelo menos 8 caracteres");
      return;
    }
    if (adminPassword !== adminPassword2) {
      setSetupError("As senhas não coincidem");
      return;
    }
    setBusy(true);
    try {
      const res = await window.geekcentral.completeSetup({
        adminPassword,
        jwtSecret,
        stationSharedSecret: stationSecret,
        unitName,
      });
      if (!res.ok) {
        setSetupError(res.error || "Falha no setup");
        return;
      }
      if (res.status) setStatus(res.status);
    } finally {
      setBusy(false);
    }
  };

  if (status.phase === "setup" || status.needsSetup) {
    return (
      <div className="shell">
        <h1 className="brand">GeekCentral</h1>
        <p className="muted">Primeiro boot — defina senha e segredos da loja (obrigatório).</p>
        <form className="panel" onSubmit={submitSetup}>
          <div className="field">
            <label>Nome da unidade</label>
            <input value={unitName} onChange={(e) => setUnitName(e.target.value)} required />
          </div>
          <div className="field">
            <label>Nova senha admin</label>
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              minLength={8}
              required
              autoFocus
            />
          </div>
          <div className="field">
            <label>Confirmar senha</label>
            <input
              type="password"
              value={adminPassword2}
              onChange={(e) => setAdminPassword2(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <div className="field">
            <label>JWT secret (gerado)</label>
            <input value={jwtSecret} onChange={(e) => setJwtSecret(e.target.value)} required />
          </div>
          <div className="field">
            <label>Station shared secret (gerado)</label>
            <input value={stationSecret} onChange={(e) => setStationSecret(e.target.value)} required />
          </div>
          {setupError && <p style={{ color: "var(--danger)" }}>{setupError}</p>}
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Salvando…" : "Salvar e iniciar"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="shell">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 className="brand">GeekCentral</h1>
          <p className="muted" style={{ margin: "0.25rem 0 0" }}>
            {status.unitName || "Unidade"} — API, facial e admin no PC controle
          </p>
        </div>
        <span
          className={`pill ${
            status.phase === "running" ? "ok" : status.phase === "error" ? "bad" : "warn"
          }`}
        >
          {status.phase === "running"
            ? "Online"
            : status.phase === "starting"
              ? "Subindo..."
              : status.phase === "error"
                ? "Erro"
                : status.phase}
        </span>
      </div>

      {status.error && (
        <div className="panel" style={{ borderColor: "var(--danger)" }}>
          <strong>Erro:</strong> {status.error}
        </div>
      )}

      <div className="grid">
        <section className="panel">
          <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Serviços</h2>
          <div className="row">
            <span className={`pill ${status.api ? "ok" : "bad"}`}>API {status.api ? "ok" : "off"}</span>
            <span className={`pill ${status.face ? "ok" : "warn"}`}>
              Face {status.face ? "ok" : "off"}
            </span>
          </div>
          <p className="muted">
            IP da LAN: <span className="mono">{status.lanIp}</span>
          </p>
          <p className="muted">
            Uptime: <span className="mono">{uptimeLabel}</span>
          </p>
          {!status.face && status.faceError ? (
            <p className="muted" style={{ color: "var(--warn)" }}>
              Face: {status.faceError}
            </p>
          ) : null}
          {status.lastFaceCheck ? (
            <p className="muted">Último check face: {new Date(status.lastFaceCheck).toLocaleString("pt-BR")}</p>
          ) : null}
          <div className="row" style={{ alignItems: "center" }}>
            <span className="muted">Senha admin:</span>
            <span className="mono">{showPassword ? status.adminPassword || "—" : "••••••••"}</span>
            <button className="btn ghost" type="button" onClick={() => setShowPassword((v) => !v)}>
              {showPassword ? "Ocultar" : "Revelar"}
            </button>
            <button
              className="btn ghost"
              type="button"
              disabled={!status.adminPassword}
              onClick={() => copy(status.adminPassword, "senha")}
            >
              Copiar
            </button>
          </div>
          <div className="row">
            <button className="btn" type="button" disabled={!status.api} onClick={() => window.geekcentral.openAdmin()}>
              Abrir admin
            </button>
            <button className="btn ghost" type="button" disabled={busy} onClick={restart}>
              Reiniciar serviços
            </button>
          </div>
        </section>

        <section className="panel">
          <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Para as estações</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            No GeekLock de cada PC, use este <code>serverUrl</code>:
          </p>
          <p className="mono">
            http://{status.lanIp}:{status.apiPort}
          </p>
          <div className="row">
            <button
              className="btn ghost"
              type="button"
              onClick={() => copy(`http://${status.lanIp}:${status.apiPort}`, "serverUrl")}
            >
              Copiar serverUrl
            </button>
            <button className="btn ghost" type="button" onClick={() => copy(stationUrl, "estação")}>
              Copiar URL estação
            </button>
          </div>
          {copied && <p className="muted">Copiado: {copied}</p>}
          <p className="muted" style={{ marginBottom: 0 }}>
            Admin na rede: <span className="mono">{adminUrl}</span>
            <br />
            Neste PC: <span className="mono">{localAdmin}</span>
          </p>
        </section>
      </div>

      <section className="panel">
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Log</h2>
        <div className="logs">{status.logs.join("\n") || "Aguardando..."}</div>
      </section>
    </div>
  );
}
