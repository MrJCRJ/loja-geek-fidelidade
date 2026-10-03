import { useEffect, useRef, useState } from "react";
import { pairStationLan, checkHealth, openUserCamera, attachCameraStream } from "./api";
import type { DiscoveryPeer, GeekLockConfig } from "./vite-env";

const CLOUD_API = "https://api.geekloja.com.br";

type Props = {
  initialConfig?: GeekLockConfig | null;
  onDone: (cfg: GeekLockConfig) => void;
};

export function SetupWizard({ initialConfig, onDone }: Props) {
  const [peers, setPeers] = useState<DiscoveryPeer[]>([]);
  const [serverUrl, setServerUrl] = useState(() => {
    const fromCfg = (initialConfig?.serverUrl || "").trim().replace(/\/$/, "");
    return fromCfg || CLOUD_API;
  });
  const [stationName, setStationName] = useState(() => {
    const n = (initialConfig?.stationName || "").trim();
    return n || "PC-01";
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(true);
  const [camOk, setCamOk] = useState(false);
  const [camMsg, setCamMsg] = useState("Teste a câmera (DroidCam ou webcam USB) antes de conectar.");
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

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
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const url = serverUrl.trim().replace(/\/$/, "");
    if (!url || !/^https?:\/\//i.test(url)) {
      setHealthOk(null);
      return;
    }
    setHealthOk(null);
    const t = window.setTimeout(async () => {
      try {
        await checkHealth({ serverUrl: url, stationName: "", sharedSecret: "", absentSecondsToLock: 60 });
        if (!cancelled) setHealthOk(true);
      } catch {
        if (!cancelled) setHealthOk(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [serverUrl]);

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
      setError("Informe a URL do Central (ex.: https://api.geekloja.com.br)");
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
      <div className="card" style={{ maxWidth: 640, width: "min(640px, 92vw)" }}>
        <h1 className="brand" style={{ fontSize: "2.4rem" }}>
          GeekLock
        </h1>
        <p className="muted">
          Conecte este PC ao GeekCentral na nuvem. Confirme o nome da estação e clique em Conectar.
        </p>

        <div className="field">
          <label>Teste de câmera</label>
          <div className="video-wrap" style={{ maxHeight: 220, marginBottom: 8 }}>
            <video ref={videoRef} muted playsInline />
            {!camOk && <div className="video-placeholder">{camMsg}</div>}
          </div>
          <button className="btn ghost" type="button" onClick={testCamera}>
            {camOk ? "Testar de novo" : "Abrir webcam"}
          </button>
        </div>

        <div className="field">
          <label>URL do GeekCentral</label>
          <input
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder={CLOUD_API}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <p className="muted" style={{ marginTop: 6 }}>
            {healthOk === true && "API respondeu OK"}
            {healthOk === false && "Sem resposta — confira internet / URL"}
            {healthOk === null && "Testando conexão…"}
          </p>
          <div className="row" style={{ marginTop: 8, flexWrap: "wrap", gap: 8 }}>
            <button className="btn ghost" type="button" onClick={() => setServerUrl(CLOUD_API)}>
              Usar nuvem
            </button>
            {peers.map((p) => (
              <button
                key={p.serverUrl}
                type="button"
                className="btn ghost"
                onClick={() => setServerUrl(p.serverUrl)}
              >
                LAN: {p.unitName || p.serverUrl}
              </button>
            ))}
            {scanning && peers.length === 0 && (
              <span className="muted">Procurando Central na LAN (opcional)…</span>
            )}
          </div>
        </div>

        <div className="field">
          <label>Nome desta estação</label>
          <input value={stationName} onChange={(e) => setStationName(e.target.value)} placeholder="PC-01" />
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="row">
          <button className="btn" type="button" disabled={busy || !serverUrl.trim()} onClick={submit}>
            {busy ? "Conectando…" : "Conectar"}
          </button>
        </div>
      </div>
    </div>
  );
}
