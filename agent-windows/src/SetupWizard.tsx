import { useEffect, useState } from "react";
import { claimStation, checkHealth } from "./api";
import type { DiscoveryPeer, GeekLockConfig } from "./vite-env";

type Props = {
  onDone: (cfg: GeekLockConfig) => void;
};

export function SetupWizard({ onDone }: Props) {
  const [peers, setPeers] = useState<DiscoveryPeer[]>([]);
  const [serverUrl, setServerUrl] = useState("");
  const [stationName, setStationName] = useState("PC-01");
  const [sharedSecret, setSharedSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    (async () => {
      await window.geeklock.startDiscovery();
      const tick = async () => {
        if (cancelled) return;
        const list = await window.geeklock.getDiscoveryPeers();
        setPeers(list);
        timer = window.setTimeout(tick, 1500);
      };
      tick();
    })();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      window.geeklock.stopDiscovery().catch(() => undefined);
    };
  }, []);

  const submit = async () => {
    setError("");
    const url = serverUrl.trim().replace(/\/$/, "");
    const name = stationName.trim();
    const secret = sharedSecret.trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      setError("Informe a URL do GeekCentral (ex.: http://192.168.0.10:8787)");
      return;
    }
    if (!name) {
      setError("Informe o nome da estação (ex.: PC-01)");
      return;
    }
    if (!secret) {
      setError("Informe o segredo compartilhado (o mesmo do GeekCentral)");
      return;
    }
    setBusy(true);
    try {
      let cfg = await window.geeklock.saveConfig({
        serverUrl: url,
        stationName: name,
        sharedSecret: secret,
        setupComplete: false,
        stationToken: "",
      });
      await checkHealth(cfg);
      const claimed = await claimStation(cfg);
      cfg = await window.geeklock.saveToken(claimed.token);
      cfg = await window.geeklock.saveConfig({ setupComplete: true });
      await window.geeklock.stopDiscovery();
      setScanning(false);
      onDone(cfg);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao conectar / claim");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <div className="card" style={{ maxWidth: 520 }}>
        <h1 className="brand" style={{ fontSize: "2rem" }}>
          GeekLock
        </h1>
        <p className="muted">Assistente da 1ª vez — escolha o PC controle na rede.</p>

        <div className="field">
          <label>Centrais encontradas na LAN</label>
          {peers.length === 0 ? (
            <p className="muted">{scanning ? "Procurando GeekCentral…" : "Nenhuma encontrada"}</p>
          ) : (
            <div className="row" style={{ flexDirection: "column", alignItems: "stretch" }}>
              {peers.map((p) => (
                <button
                  key={p.serverUrl}
                  type="button"
                  className="btn ghost"
                  style={{ justifyContent: "flex-start", textAlign: "left" }}
                  onClick={() => setServerUrl(p.serverUrl)}
                >
                  <strong>{p.unitName || "GeekCentral"}</strong>
                  <span className="muted" style={{ marginLeft: 8 }}>
                    {p.serverUrl}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="field">
          <label>URL do servidor</label>
          <input
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="http://192.168.0.10:8787"
          />
        </div>
        <div className="field">
          <label>Nome desta estação</label>
          <input value={stationName} onChange={(e) => setStationName(e.target.value)} placeholder="PC-01" />
        </div>
        <div className="field">
          <label>Segredo compartilhado</label>
          <input
            type="password"
            value={sharedSecret}
            onChange={(e) => setSharedSecret(e.target.value)}
            placeholder="Mesmo do GeekCentral"
          />
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="row">
          <button className="btn" type="button" disabled={busy} onClick={submit}>
            {busy ? "Conectando…" : "Salvar e conectar"}
          </button>
        </div>
      </div>
    </div>
  );
}
