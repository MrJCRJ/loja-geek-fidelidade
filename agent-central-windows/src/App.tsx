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
  uiCompact: false,
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

function formatPairCode(code: string) {
  const d = code.replace(/\D/g, "").slice(0, 6);
  if (d.length <= 3) return d;
  return `${d.slice(0, 3)} ${d.slice(3)}`;
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
  const [openAtLogin, setOpenAtLogin] = useState(true);
  const [uiCompact, setUiCompact] = useState(false);
  const [fwMsg, setFwMsg] = useState("");
  const [tunnelMode, setTunnelMode] = useState<"off" | "quick" | "named">("off");
  const [tunnelName, setTunnelName] = useState("");
  const [publicApiUrl, setPublicApiUrl] = useState("");
  const [portalOrigin, setPortalOrigin] = useState("https://loja-geek-portal.vercel.app");
  const [tunnelBusy, setTunnelBusy] = useState(false);
  const [tunnelMsg, setTunnelMsg] = useState("");
  const [stationQr, setStationQr] = useState("");
  const [installMsg, setInstallMsg] = useState("");
  const [pairCode, setPairCode] = useState("");
  const [pairExpiresAt, setPairExpiresAt] = useState(0);
  const [pairMsg, setPairMsg] = useState("");
  const [appVersion, setAppVersion] = useState("");
  const [ghToken, setGhToken] = useState("");
  const [updateMsg, setUpdateMsg] = useState("");
  const [updateBusy, setUpdateBusy] = useState(false);
  const [latestVersion, setLatestVersion] = useState("");
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    window.geekcentral.getStatus().then(setStatus).catch(() => undefined);
    window.geekcentral
      .peekSetup()
      .then((peek) => {
        setStatus(peek);
        if (peek.suggestedJwt) setJwtSecret(peek.suggestedJwt);
        if (peek.suggestedStation) setStationSecret(peek.suggestedStation);
        if (peek.unitName) setUnitName(peek.unitName);
        if (typeof peek.openAtLogin === "boolean") setOpenAtLogin(peek.openAtLogin);
        if (typeof peek.uiCompact === "boolean") setUiCompact(peek.uiCompact);
        if (peek.tunnelMode === "quick" || peek.tunnelMode === "named" || peek.tunnelMode === "off") {
          setTunnelMode(peek.tunnelMode);
        }
        if (peek.tunnelNamed) setTunnelName(peek.tunnelNamed);
        if (peek.tunnelPublicUrl) setPublicApiUrl(peek.tunnelPublicUrl);
        if (peek.portalOrigin) setPortalOrigin(peek.portalOrigin);
      })
      .catch(() => undefined);
    window.geekcentral
      .getAutostart()
      .then((a) => setOpenAtLogin(a.openAtLogin))
      .catch(() => undefined);
    window.geekcentral
      .getUiCompact()
      .then((r) => setUiCompact(r.uiCompact))
      .catch(() => undefined);
    window.geekcentral
      .getUpdateInfo()
      .then((r) => {
        setAppVersion(r.currentVersion || "");
      })
      .catch(() => undefined);
    return window.geekcentral.onStatus((s) => {
      setStatus(s);
      if (typeof s.openAtLogin === "boolean") setOpenAtLogin(s.openAtLogin);
      if (typeof s.uiCompact === "boolean") setUiCompact(s.uiCompact);
      if (s.tunnelMode === "quick" || s.tunnelMode === "named" || s.tunnelMode === "off") {
        setTunnelMode(s.tunnelMode);
      }
      if (s.tunnelNamed) setTunnelName(s.tunnelNamed);
      if (s.tunnelPublicUrl) setPublicApiUrl(s.tunnelPublicUrl);
      if (s.portalOrigin) setPortalOrigin(s.portalOrigin);
    });
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("compact", uiCompact);
  }, [uiCompact]);

  useEffect(() => {
    const url = `http://${status.lanIp}:${status.apiPort}`;
    if (!status.lanIp || status.lanIp === "...") return;
    window.geekcentral
      .qr(url)
      .then((r) => {
        if (r.ok && r.dataUrl) setStationQr(r.dataUrl);
      })
      .catch(() => undefined);
  }, [status.lanIp, status.apiPort]);

  useEffect(() => {
    if (status.phase !== "running" || !status.startedAt) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [status.phase, status.startedAt]);

  const refreshPairCode = async () => {
    if (!status.api) {
      setPairCode("");
      return;
    }
    try {
      const res = await fetch(`http://127.0.0.1:${status.apiPort}/api/local/pair-code`, {
        signal: AbortSignal.timeout(5000),
      });
      const data = (await res.json()) as { code?: string; expiresAt?: number; error?: string };
      if (!res.ok) {
        setPairMsg(data.error || "Falha ao obter código");
        return;
      }
      setPairCode(data.code || "");
      setPairExpiresAt(Number(data.expiresAt || 0));
      setPairMsg("");
    } catch {
      setPairMsg("API local sem resposta");
    }
  };

  const rotatePairCode = async () => {
    setPairMsg("Gerando…");
    try {
      const res = await fetch(`http://127.0.0.1:${status.apiPort}/api/local/pair-code/rotate`, {
        method: "POST",
        signal: AbortSignal.timeout(5000),
      });
      const data = (await res.json()) as { code?: string; expiresAt?: number; error?: string };
      if (!res.ok) {
        setPairMsg(data.error || "Falha");
        return;
      }
      setPairCode(data.code || "");
      setPairExpiresAt(Number(data.expiresAt || 0));
      setPairMsg("Novo código gerado");
    } catch {
      setPairMsg("Falha ao gerar");
    }
  };

  useEffect(() => {
    if (!status.api) return;
    void refreshPairCode();
    const id = window.setInterval(() => void refreshPairCode(), 20_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.api, status.apiPort]);

  const pairTtlLabel = useMemo(() => {
    void tick;
    if (!pairExpiresAt) return "";
    const left = Math.max(0, Math.floor((pairExpiresAt - Date.now()) / 1000));
    const m = Math.floor(left / 60);
    const s = left % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }, [pairExpiresAt, tick]);

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
            <label>Station shared secret (gerado — interno)</label>
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

      {/* 1) Status */}
      <section className="panel">
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Serviços</h2>
        <div className="row">
          <span className={`pill ${status.api ? "ok" : "bad"}`}>API {status.api ? "ok" : "off"}</span>
          <span className={`pill ${status.face ? "ok" : "warn"}`}>Face {status.face ? "ok" : "off"}</span>
        </div>
        <p className="muted">
          Celular na loja: <span className="mono">http://geek.local:{status.apiPort || 8787}/admin</span>
          {status.lanIp ? (
            <>
              {" "}
              · se o nome falhar:{" "}
              <span className="mono">
                http://{status.lanIp}:{status.apiPort || 8787}/admin
              </span>
            </>
          ) : null}
        </p>
        <p className="muted">
          De casa (só ver): <span className="mono">https://admin.geekloja.com.br</span>
        </p>
        <p className="muted">
          IP LAN: <span className="mono">{status.lanIp}</span> · Uptime:{" "}
          <span className="mono">{uptimeLabel}</span>
        </p>
        {!status.face && status.faceError ? (
          <p className="muted" style={{ color: "var(--warn)" }}>
            Face: {status.faceError}
          </p>
        ) : null}
        <div className="row">
          <button className="btn" type="button" disabled={!status.api} onClick={() => window.geekcentral.openAdmin()}>
            Abrir admin
          </button>
          <button className="btn ghost" type="button" disabled={busy} onClick={restart}>
            Reiniciar serviços
          </button>
        </div>
        <div className="row" style={{ marginTop: "0.65rem", alignItems: "center" }}>
          <label className="row" style={{ gap: "0.45rem", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={openAtLogin}
              onChange={(e) => {
                const on = e.target.checked;
                setOpenAtLogin(on);
                window.geekcentral
                  .setAutostart(on)
                  .then((r) => setOpenAtLogin(r.openAtLogin))
                  .catch(() => undefined);
              }}
            />
            <span>Iniciar com o Windows</span>
          </label>
          <label className="row" style={{ gap: "0.45rem", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={uiCompact}
              onChange={(e) => {
                const on = e.target.checked;
                setUiCompact(on);
                window.geekcentral
                  .setUiCompact(on)
                  .then((r) => setUiCompact(r.uiCompact))
                  .catch(() => undefined);
              }}
            />
            <span>Modo compacto</span>
          </label>
        </div>
      </section>

      {/* 2) Código de pareamento */}
      <section className="panel pair-panel">
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Código para estações</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          No GeekLock: escolha este Central na LAN → nome da estação → digite o código abaixo.
        </p>
        <div className="pair-code" aria-live="polite">
          {status.api && pairCode ? formatPairCode(pairCode) : status.api ? "······" : "— — —"}
        </div>
        <p className="muted" style={{ margin: "0.35rem 0 0", textAlign: "center" }}>
          {pairExpiresAt ? `Expira em ${pairTtlLabel} · uso único` : "Aguardando API…"}
        </p>
        <div className="row" style={{ justifyContent: "center", marginTop: "0.65rem" }}>
          <button className="btn ghost" type="button" disabled={!status.api} onClick={() => void rotatePairCode()}>
            Gerar novo
          </button>
          <button
            className="btn ghost"
            type="button"
            disabled={!pairCode}
            onClick={() => copy(pairCode, "código")}
          >
            Copiar
          </button>
        </div>
        {pairMsg && <p className="muted">{pairMsg}</p>}
        {copied && <p className="muted">Copiado: {copied}</p>}
      </section>

      {/* 3) Túnel resumido */}
      <section className="panel">
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Portal / Túnel</h2>
        <div className="row">
          <span className={`pill ${status.tunnelRunning ? "ok" : "warn"}`}>
            Túnel {status.tunnelRunning ? "ativo" : "parado"}
          </span>
          <span
            className={`pill ${
              status.tunnelPublicHealthy ? "ok" : status.tunnelPublicUrl ? "bad" : "warn"
            }`}
          >
            Público {status.tunnelPublicHealthy ? "ok" : status.tunnelPublicUrl ? "falhou" : "—"}
          </span>
        </div>
        {status.tunnelPublicUrl ? (
          <p className="mono" style={{ wordBreak: "break-all" }}>
            {status.tunnelPublicUrl}
          </p>
        ) : (
          <p className="muted">Sem URL pública ainda.</p>
        )}
        <div className="field">
          <label>Modo</label>
          <select
            value={tunnelMode}
            onChange={(e) => setTunnelMode(e.target.value as "off" | "quick" | "named")}
          >
            <option value="off">Desligado</option>
            <option value="quick">Rápido (URL muda)</option>
            <option value="named">Nomeado (URL fixa)</option>
          </select>
        </div>
        {tunnelMode === "named" && (
          <>
            <div className="field">
              <label>Nome do túnel</label>
              <input value={tunnelName} onChange={(e) => setTunnelName(e.target.value)} placeholder="loja-geek-api" />
            </div>
            <div className="field">
              <label>URL pública</label>
              <input
                value={publicApiUrl}
                onChange={(e) => setPublicApiUrl(e.target.value)}
                placeholder="https://api.geekloja.com.br"
              />
            </div>
          </>
        )}
        <div className="field">
          <label>PORTAL_ORIGIN</label>
          <input value={portalOrigin} onChange={(e) => setPortalOrigin(e.target.value)} />
        </div>
        <div className="row">
          <button
            className="btn"
            type="button"
            disabled={tunnelBusy || !status.api}
            onClick={() => {
              setTunnelBusy(true);
              setTunnelMsg("Aplicando…");
              window.geekcentral
                .setTunnel({ tunnelMode, tunnelName, publicApiUrl, portalOrigin })
                .then((r) => {
                  if (r.status) setStatus(r.status);
                  setTunnelMsg(r.ok ? (tunnelMode === "off" ? "Desligado" : "Aplicado") : r.error || "Falhou");
                })
                .catch((e) => setTunnelMsg(e instanceof Error ? e.message : "Falhou"))
                .finally(() => setTunnelBusy(false));
            }}
          >
            {tunnelBusy ? "…" : "Aplicar túnel"}
          </button>
          <button
            className="btn ghost"
            type="button"
            disabled={!status.tunnelPublicUrl}
            onClick={() => copy(status.tunnelPublicUrl || "", "VITE_API_URL")}
          >
            Copiar URL
          </button>
          <button
            className="btn ghost"
            type="button"
            disabled={!status.webhookUrl}
            onClick={() => copy(status.webhookUrl || "", "webhook")}
          >
            Webhook Pix
          </button>
        </div>
        {tunnelMsg && <p className="muted">{tunnelMsg}</p>}
        {status.tunnelError && (
          <p className="muted" style={{ color: "var(--warn)" }}>
            {status.tunnelError}
          </p>
        )}
      </section>

      {/* Atualizar do GitHub */}
      <section className="panel">
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Atualizar</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Versão instalada: <span className="mono">{appVersion || "—"}</span>
          {latestVersion ? (
            <>
              {" "}
              · GitHub: <span className="mono">{latestVersion}</span>
              {updateAvailable ? " (nova disponível)" : ""}
            </>
          ) : null}
        </p>
        <div className="field">
          <label>Token GitHub (classic, contents:read no repo privado)</label>
          <input
            type="password"
            value={ghToken}
            onChange={(e) => setGhToken(e.target.value)}
            placeholder="ghp_… (salvo só neste PC em data\\config.json)"
            autoComplete="off"
          />
        </div>
        <div className="row">
          <button
            className="btn ghost"
            type="button"
            disabled={updateBusy || !ghToken.trim()}
            onClick={() => {
              setUpdateBusy(true);
              setUpdateMsg("Salvando token…");
              window.geekcentral
                .setGithubToken(ghToken.trim())
                .then(() => window.geekcentral.checkUpdate())
                .then((r) => {
                  if (!r.ok) {
                    setUpdateMsg(r.error || "Falha");
                    setUpdateAvailable(false);
                    return;
                  }
                  setLatestVersion(r.latestVersion || "");
                  setUpdateAvailable(Boolean(r.updateAvailable));
                  setAppVersion(r.currentVersion || appVersion);
                  setUpdateMsg(
                    r.updateAvailable
                      ? `Atualização ${r.latestVersion} disponível`
                      : `Já está em ${r.currentVersion}`,
                  );
                })
                .catch((e) => setUpdateMsg(e instanceof Error ? e.message : "Falha"))
                .finally(() => setUpdateBusy(false));
            }}
          >
            Verificar
          </button>
          <button
            className="btn"
            type="button"
            disabled={updateBusy || !updateAvailable}
            onClick={() => {
              if (!window.confirm("Baixar e instalar atualização? A pasta data\\ é mantida. O app vai reiniciar.")) {
                return;
              }
              setUpdateBusy(true);
              setUpdateMsg("Baixando e preparando… (pode demorar)");
              window.geekcentral
                .installUpdate()
                .then((r) => {
                  if (!r.ok) {
                    setUpdateMsg(r.error || "Falha na instalação");
                    setUpdateBusy(false);
                    return;
                  }
                  setUpdateMsg(`Instalando ${r.version}… o app vai fechar e reabrir.`);
                })
                .catch((e) => {
                  setUpdateMsg(e instanceof Error ? e.message : "Falha");
                  setUpdateBusy(false);
                });
            }}
          >
            {updateBusy ? "…" : "Baixar e instalar"}
          </button>
        </div>
        {updateMsg && <p className="muted">{updateMsg}</p>}
        <p className="muted" style={{ fontSize: "0.85rem", marginBottom: 0 }}>
          Releases: tag <code>central-v*</code>, asset <code>GeekCentral-win-x64.zip</code>. Ver{" "}
          <code>docs/UPDATE-GEEKCENTRAL.md</code>.
        </p>
      </section>

      {/* 4) Resto */}
      <div className="grid">
        <section className="panel">
          <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Admin / estações</h2>
          <div className="row" style={{ alignItems: "center" }}>
            <span className="muted">Senha:</span>
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
          <p className="mono" style={{ wordBreak: "break-all" }}>
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
              URL estação
            </button>
          </div>
          <p className="muted" style={{ fontSize: "0.85rem" }}>
            Admin: <span className="mono">{adminUrl}</span>
            <br />
            Local: <span className="mono">{localAdmin}</span>
          </p>
          {stationQr ? (
            <div style={{ marginTop: "0.5rem", textAlign: "center" }}>
              <img src={stationQr} alt="QR serverUrl" width={120} height={120} style={{ borderRadius: 8 }} />
            </div>
          ) : null}
          <div className="row" style={{ marginTop: "0.65rem" }}>
            <button
              className="btn ghost"
              type="button"
              disabled={busy}
              onClick={() => {
                setFwMsg("Aplicando…");
                window.geekcentral
                  .ensureFirewall()
                  .then((r) => setFwMsg(r.ok ? "Firewall OK" : r.error || "Falhou"))
                  .catch((e) => setFwMsg(e instanceof Error ? e.message : "Falhou"));
              }}
            >
              Liberar firewall
            </button>
          </div>
          {fwMsg && <p className="muted">{fwMsg}</p>}
        </section>

        <section className="panel">
          <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Checklist</h2>
          <ul className="muted" style={{ margin: "0 0 0.75rem", paddingLeft: "1.2rem", lineHeight: 1.6 }}>
            <li>{status.api ? "✓" : "○"} API online</li>
            <li>{status.face ? "✓" : "○"} Face online</li>
            <li>{openAtLogin ? "✓" : "○"} Autostart Windows</li>
            <li>{status.firewallOk ? "✓" : "○"} Firewall</li>
            <li>{status.tunnelRunning || status.tunnelPublicUrl ? "✓" : "○"} Túnel / URL</li>
            <li>○ GeekLock com código de 6 dígitos</li>
          </ul>
          <div className="row">
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                setInstallMsg("Criando…");
                window.geekcentral
                  .createShortcuts()
                  .then((r) => setInstallMsg(r.ok ? "Atalhos OK" : r.error || "Falhou"))
                  .catch((e) => setInstallMsg(e instanceof Error ? e.message : "Falhou"));
              }}
            >
              Criar atalhos
            </button>
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                if (!window.confirm("Remover autostart e atalhos?")) return;
                const wipeData = window.confirm("Apagar também data\\ ?");
                window.geekcentral
                  .uninstallLocal({ wipeData })
                  .then((r) =>
                    setInstallMsg(r.ok ? `Removido${r.dataDeleted ? " (+dados)" : ""}` : r.error || "Falhou"),
                  )
                  .catch((e) => setInstallMsg(e instanceof Error ? e.message : "Falhou"));
              }}
            >
              Remover local
            </button>
          </div>
          {installMsg && <p className="muted">{installMsg}</p>}
          <p className="muted" style={{ fontSize: "0.85rem", marginBottom: 0 }}>
            Fecha a janela → bandeja. “Sair” só no menu da bandeja.
            {status.bootDelayMs ? ` Boot delay: ${Math.round(status.bootDelayMs / 1000)}s.` : ""}
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
