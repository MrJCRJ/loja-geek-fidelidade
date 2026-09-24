import { useEffect, useRef, useState } from "react";
import { pairStationLan, checkHealth, openUserCamera, attachCameraStream } from "./api";
import type { DiscoveryPeer, GeekLockConfig } from "./vite-env";

type Props = {
  onDone: (cfg: GeekLockConfig) => void;
};

export function SetupWizard({ onDone }: Props) {
  const [peers, setPeers] = useState<DiscoveryPeer[]>([]);
  const [serverUrl, setServerUrl] = useState("");
  const [stationName, setStationName] = useState("PC-01");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(true);
  const [camOk, setCamOk] = useState(false);
  const [camMsg, setCamMsg] = useState("Teste a câmera (DroidCam ou webcam USB) antes de conectar.");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const autoPicked = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    (async () => {
      await window.geeklock.startDiscovery();
      const tick = async () => {
        if (cancelled) return;
        const list = await window.geeklock.getDiscoveryPeers();
        setPeers(list);
        if (!autoPicked.current && list.length > 0) {
          autoPicked.current = true;
          setServerUrl(list[0].serverUrl);
        }
        timer = window.setTimeout(tick, 1500);
      };
      tick();
    })();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      window.geeklock.stopDiscovery().catch(() => undefined);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const testCamera = async () => {
    setCamMsg("Abrindo câmera…");
    setCamOk(false);
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const stream = await openUserCamera();
      streamRef.current = stream;
      if (videoRef.current) await attachCameraStream(videoRef.current, stream);
      setCamOk(true);
      setCamMsg("Câmera ok — luz de frente, sem contraluz forte.");
    } catch (err) {
      setCamOk(false);
      setCamMsg(err instanceof Error ? err.message : "Falha na câmera");
      window.geeklock.writeLastFailure({
        kind: "camera",
        message: err instanceof Error ? err.message : "Falha no teste de câmera",
      });
    }
  };

  const submit = async () => {
    setError("");
    const url = serverUrl.trim().replace(/\/$/, "");
    const name = stationName.trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      setError("Espere achar o GeekCentral na rede, ou informe http://192.168.3.70:8787");
      return;
    }
    if (!name) {
      setError("Informe o nome da estação (ex.: PC-01)");
      return;
    }
    setBusy(true);
    try {
      let cfg = await window.geeklock.saveConfig({
        serverUrl: url,
        stationName: name,
        sharedSecret: "",
        setupComplete: false,
        stationToken: "",
      });
      await checkHealth(cfg);
      const claimed = await pairStationLan(cfg);
      cfg = await window.geeklock.saveToken(claimed.token);
      cfg = await window.geeklock.saveConfig({ setupComplete: true });
      await window.geeklock.stopDiscovery();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      setScanning(false);
      onDone(cfg);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao conectar";
      setError(msg);
      window.geeklock.writeLastFailure({ kind: "setup", message: msg });
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
        <p className="muted">Na rede da loja o Central aparece sozinho. Só confirme o nome deste PC.</p>

        <div className="field">
          <label>Teste de câmera</label>
          <div className="video-wrap" style={{ maxHeight: 180, marginBottom: 8 }}>
            <video ref={videoRef} muted playsInline />
            {!camOk && <div className="video-placeholder">{camMsg}</div>}
          </div>
          <button className="btn ghost" type="button" onClick={testCamera}>
            {camOk ? "Testar de novo" : "Abrir webcam"}
          </button>
        </div>

        <div className="field">
          <label>GeekCentral na rede</label>
          {peers.length === 0 ? (
            <p className="muted">{scanning ? "Procurando…" : "Nenhum Central na LAN"}</p>
          ) : (
            <div className="row" style={{ flexDirection: "column", alignItems: "stretch" }}>
              {peers.map((p) => (
                <button
                  key={p.serverUrl}
                  type="button"
                  className={`btn ${p.serverUrl === serverUrl ? "" : "ghost"}`}
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
          <label>Nome desta estação</label>
          <input value={stationName} onChange={(e) => setStationName(e.target.value)} placeholder="PC-01" />
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="row">
          <button className="btn" type="button" disabled={busy || !serverUrl} onClick={submit}>
            {busy ? "Conectando…" : "Conectar"}
          </button>
        </div>
      </div>
    </div>
  );
}
