import { useEffect, useState } from "react";
import type { CentralStatus } from "./vite-env";

const empty: CentralStatus = {
  phase: "boot",
  api: false,
  face: false,
  lanIp: "...",
  apiPort: 8787,
  facePort: 8100,
  adminPassword: "admin123",
  error: "",
  logs: [],
};

export default function App() {
  const [status, setStatus] = useState<CentralStatus>(empty);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    window.geekcentral.getStatus().then(setStatus).catch(() => undefined);
    return window.geekcentral.onStatus(setStatus);
  }, []);

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

  return (
    <div className="shell">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 className="brand">GeekCentral</h1>
          <p className="muted" style={{ margin: "0.25rem 0 0" }}>
            Servidor da loja — API, facial e admin no PC controle
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
            Senha admin: <span className="mono">{status.adminPassword}</span>
          </p>
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
          <p className="mono">http://{status.lanIp}:{status.apiPort}</p>
          <div className="row">
            <button className="btn ghost" type="button" onClick={() => copy(`http://${status.lanIp}:${status.apiPort}`, "serverUrl")}>
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
