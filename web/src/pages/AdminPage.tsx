import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, getAdminToken, setAdminToken, type Customer } from "../api";
import { AdminTabs } from "../admin/components/AdminTabs";
import { ConfirmModal } from "../admin/components/ConfirmModal";
import { ToastStack } from "../admin/components/Toast";
import { useAdminData } from "../admin/hooks/useAdminData";
import { useAdminEnrollCamera } from "../admin/hooks/useAdminEnrollCamera";
import { useAdminSocket } from "../admin/hooks/useAdminSocket";
import { useToast } from "../admin/hooks/useToast";
import { CaixaTab } from "../admin/tabs/CaixaTab";
import { ClientesTab } from "../admin/tabs/ClientesTab";
import { AjudaTab } from "../admin/tabs/AjudaTab";
import { EquipeTab } from "../admin/tabs/EquipeTab";
import { ConfigTab } from "../admin/tabs/ConfigTab";
import { DashboardTab } from "../admin/tabs/DashboardTab";
import { EstacoesTab } from "../admin/tabs/EstacoesTab";
import { FeedTab } from "../admin/tabs/FeedTab";
import { RecompensasTab } from "../admin/tabs/RecompensasTab";
import { SaudeTab } from "../admin/tabs/SaudeTab";
import { SessoesTab } from "../admin/tabs/SessoesTab";
import type { LiveFeedItem, Tab } from "../admin/types";

type ConfirmState = {
  title: string;
  message: string;
  danger?: boolean;
  confirmLabel?: string;
  resolve: (ok: boolean) => void;
} | null;

export default function AdminPage() {
  const [token, setToken] = useState(getAdminToken());
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("dashboard");
  const [live, setLive] = useState<LiveFeedItem[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [role, setRole] = useState<"admin" | "clerk">("admin");
  const [displayName, setDisplayName] = useState("");
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [bootUser, setBootUser] = useState("");
  const [bootName, setBootName] = useState("");
  const [bootPass, setBootPass] = useState("");
  const [remoteReadOnly, setRemoteReadOnly] = useState(false);
  const [offStoreWifi, setOffStoreWifi] = useState<boolean | null>(null);
  const [shopUrl, setShopUrl] = useState("https://loja.geekloja.com.br/admin");
  const [pairCode, setPairCode] = useState("");
  const [sysAlerts, setSysAlerts] = useState<Array<{ severity: string; message: string }>>([]);
  const [installHint, setInstallHint] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<{ prompt: () => Promise<void> } | null>(null);

  const toast = useToast();
  const data = useAdminData(token);
  const enroll = useAdminEnrollCamera({
    tab,
    setTab,
    selected,
    setSelected,
    refreshNow: data.refreshNow,
    setError,
    toast: toast.push,
  });

  const askConfirm = useCallback(
    (opts: { title: string; message: string; danger?: boolean; confirmLabel?: string }) =>
      new Promise<boolean>((resolve) => {
        setConfirmState({ ...opts, resolve });
      }),
    [],
  );

  useAdminSocket({
    token,
    onLive: setLive,
    onLiveStatus: data.setLiveStatus,
    scheduleRefresh: data.scheduleRefresh,
  });

  useEffect(() => {
    const onAuthExpired = () => {
      setToken(null);
      setError("Sessão expirada. Entre de novo com usuário e senha.");
    };
    window.addEventListener("lg-auth-expired", onAuthExpired);
    return () => window.removeEventListener("lg-auth-expired", onAuthExpired);
  }, []);

  useEffect(() => {
    if (!token) {
      setOffStoreWifi(null);
      return;
    }
    setOffStoreWifi(null);
    api<{
      role: string;
      displayName?: string | null;
      needsBootstrap?: boolean;
      remoteReadOnly?: boolean;
      offStoreWifi?: boolean;
      shopUrl?: string;
    }>("/api/admin/me")
      .then((me) => {
        setRole(me.role === "clerk" ? "clerk" : "admin");
        setDisplayName(me.displayName || "");
        setNeedsBootstrap(Boolean(me.needsBootstrap));
        setRemoteReadOnly(Boolean(me.remoteReadOnly));
        setOffStoreWifi(Boolean(me.offStoreWifi));
        if (me.shopUrl) setShopUrl(me.shopUrl);
        if (me.offStoreWifi) return;
        if (me.role === "clerk") setTab("estacoes");
        if (!me.remoteReadOnly) {
          api<{ code: string }>("/api/admin/pair-code")
            .then((p) => setPairCode(p.code || ""))
            .catch(() => undefined);
        }
        return data.refreshNow();
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Falha ao validar sessão"));
  }, [token, data.refreshNow]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    setInstallHint(!standalone);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      const ev = e as Event & { prompt: () => Promise<void> };
      setInstallPrompt({ prompt: () => ev.prompt() });
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  useEffect(() => {
    if (!token || role === "clerk") return;
    const loadAlerts = () => {
      api<{ alerts?: Array<{ severity: string; message: string }> }>("/api/admin/diagnostics")
        .then((d) => setSysAlerts(d.alerts || []))
        .catch(() => undefined);
    };
    loadAlerts();
    const t = setInterval(loadAlerts, 20_000);
    return () => clearInterval(t);
  }, [token, role]);

  const login = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const res = await api<{
        token: string;
        role?: "admin" | "clerk";
        displayName?: string;
        needsBootstrap?: boolean;
      }>("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ username: username.trim() || undefined, password }),
        token: null,
      });
      setAdminToken(res.token);
      setToken(res.token);
      setRole(res.role === "clerk" ? "clerk" : "admin");
      setDisplayName(res.displayName || "");
      setNeedsBootstrap(Boolean(res.needsBootstrap));
      if (res.role === "clerk") setTab("estacoes");
      toast.push(res.role === "clerk" ? "Modo equipe" : "Login ok", "ok");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no login");
    }
  };

  const logout = () => {
    setAdminToken(null);
    setToken(null);
    setOffStoreWifi(null);
  };

  if (token && offStoreWifi) {
    return (
      <div className="shell" style={{ maxWidth: 420 }}>
        <h1 className="brand">Loja</h1>
        <div className="panel off-wifi">
          <strong>Fora do Wi‑Fi da loja</strong>
          <p>
            O controle das máquinas só funciona na rede da loja. Conecte no Wi‑Fi da loja e abra de novo este
            link.
          </p>
          <p className="muted">O dono pode operar de casa. A equipe, não.</p>
          <button className="btn danger" type="button" onClick={logout}>
            Sair
          </button>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="shell" style={{ maxWidth: 420 }}>
        <h1 className="brand">GeekCentral</h1>
        <p className="muted">Acesso só da equipe — geeks · Celular e Game</p>
        <form className="panel" onSubmit={login}>
          <div className="field">
            <label>Usuário</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              data-testid="admin-username"
              placeholder="dono (vazio só no 1º acesso)"
            />
          </div>
          <div className="field">
            <label>Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              data-testid="admin-password"
            />
          </div>
          {error && <p style={{ color: "crimson" }}>{error}</p>}
          <button className="btn" type="submit" data-testid="admin-login">
            Entrar
          </button>
          <p className="muted" style={{ marginTop: "0.75rem" }}>
            Loja: <code>https://loja.geekloja.com.br</code> · Casa: <code>https://admin.geekloja.com.br</code>
          </p>
        </form>
      </div>
    );
  }

  const clerk = role === "clerk";

  return (
    <div className={`shell ${clerk ? "clerk-shell" : ""}`}>
      <ToastStack items={toast.toasts} onDismiss={toast.dismiss} />
      <ConfirmModal
        open={Boolean(confirmState)}
        title={confirmState?.title || ""}
        message={confirmState?.message || ""}
        danger={confirmState?.danger}
        confirmLabel={confirmState?.confirmLabel}
        onCancel={() => {
          confirmState?.resolve(false);
          setConfirmState(null);
        }}
        onConfirm={() => {
          confirmState?.resolve(true);
          setConfirmState(null);
        }}
      />

      <div className="admin-topbar">
        <div>
          {clerk ? (
            <>
              <h1 className="brand">Loja</h1>
              <p className="muted" style={{ margin: 0 }}>
                {displayName || "Equipe"}
              </p>
            </>
          ) : (
            <>
              <p className="muted" style={{ margin: 0 }}>
                geeks · Celular e Game · {data.settings.unitName}
                {displayName ? ` · ${displayName}` : ""}
                {remoteReadOnly ? " · só leitura (casa)" : ""}
              </p>
              <h1 className="brand">GeekCentral</h1>
              {data.health ? (
                <p className="muted" style={{ margin: "0.35rem 0 0" }}>
                  API {data.health.ok ? "ok" : "falha"} · Face{" "}
                  <span className={data.health.faceService ? "tag ouro" : "tag noface"}>
                    {data.health.faceService ? "online" : "offline"}
                  </span>
                </p>
              ) : (
                <p className="muted" style={{ margin: "0.35rem 0 0" }}>
                  Health: —
                </p>
              )}
            </>
          )}
        </div>
        <div className="admin-topbar-actions">
          {installHint && (
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                if (installPrompt) {
                  void installPrompt.prompt().then(() => setInstallPrompt(null));
                  return;
                }
                toast.push("No celular: menu → Adicionar à tela inicial", "info");
              }}
            >
              App
            </button>
          )}
          {!clerk && (
            <button className="btn ghost" type="button" onClick={() => data.refreshNow()}>
              Atualizar
            </button>
          )}
          <button className="btn danger" type="button" onClick={logout}>
            Sair
          </button>
        </div>
      </div>

      <AdminTabs
        tab={tab}
        clerk={clerk}
        onChange={(id) => {
          if (clerk && id !== "estacoes" && id !== "caixa" && id !== "clientes") return;
          setTab(id);
        }}
      />

      {needsBootstrap && role === "admin" && (
        <form
          className="panel"
          style={{ marginBottom: "1rem" }}
          onSubmit={(e) => {
            e.preventDefault();
            api<{ token: string; displayName?: string }>("/api/admin/bootstrap-owner", {
              method: "POST",
              body: JSON.stringify({
                username: bootUser,
                password: bootPass,
                displayName: bootName || bootUser,
              }),
            })
              .then((res) => {
                setAdminToken(res.token);
                setToken(res.token);
                setNeedsBootstrap(false);
                setDisplayName(res.displayName || bootName);
                toast.push("Conta dono criada", "ok");
              })
              .catch((err) => setError(err instanceof Error ? err.message : "Falha ao criar dono"));
          }}
        >
          <h2 style={{ marginTop: 0 }}>Crie sua conta de dono</h2>
          <p className="muted">A senha compartilhada deixa de funcionar depois disso.</p>
          <div className="field">
            <label>Usuário</label>
            <input value={bootUser} onChange={(e) => setBootUser(e.target.value)} required />
          </div>
          <div className="field">
            <label>Seu nome</label>
            <input value={bootName} onChange={(e) => setBootName(e.target.value)} />
          </div>
          <div className="field">
            <label>Senha</label>
            <input type="password" value={bootPass} onChange={(e) => setBootPass(e.target.value)} required minLength={6} />
          </div>
          <button className="btn" type="submit">
            Criar conta dono
          </button>
        </form>
      )}

      {remoteReadOnly && (
        <div className="banner warn">De casa só dá para ver. Controle dos PCs e caixa: {shopUrl}</div>
      )}
      {installHint && !remoteReadOnly && !clerk && (
        <div className="banner warn">
          No celular: menu do navegador → Adicionar à tela inicial. Link da loja: {shopUrl}
        </div>
      )}
      {!remoteReadOnly && !clerk && pairCode && tab !== "estacoes" && (
        <p className="muted" style={{ margin: "0 0 0.75rem" }}>
          Pareamento GeekLock: <strong className="mono">{pairCode}</strong>
        </p>
      )}

      {sysAlerts.length > 0 && !clerk && (
        <div className={`banner ${sysAlerts.some((a) => a.severity === "error") ? "" : "warn"}`}>
          {sysAlerts[0].message}
          {sysAlerts.length > 1 ? ` · +${sysAlerts.length - 1}` : ""}
        </div>
      )}

      {error && <div className="banner">{error}</div>}

      {tab === "dashboard" && !clerk && <DashboardTab onError={setError} />}
      {tab === "feed" && !clerk && <FeedTab live={live} events={data.events} />}
      {tab === "clientes" && (
        <ClientesTab
          customers={data.customers}
          selected={selected}
          setSelected={setSelected}
          videoRef={enroll.videoRef}
          camLoading={enroll.camLoading}
          camReady={enroll.camReady}
          enrollStep={enroll.enrollStep}
          setEnrollStep={enroll.setEnrollStep}
          enrollBusy={enroll.enrollBusy}
          enrollMsg={enroll.enrollMsg}
          setEnrollMsg={enroll.setEnrollMsg}
          autoEnrollActive={enroll.autoEnrollActive}
          setAutoEnrollActive={enroll.setAutoEnrollActive}
          autoEnrollPaused={enroll.autoEnrollPaused}
          setAutoEnrollPaused={enroll.setAutoEnrollPaused}
          setAutoEnrollToken={enroll.setAutoEnrollToken}
          autoEnroll={enroll.autoEnroll}
          startCam={enroll.startCam}
          stopCam={enroll.stopCam}
          enrollFace={enroll.enrollFace}
          beginAutoEnroll={enroll.beginAutoEnroll}
          refresh={data.refreshNow}
          loadTimeForCustomer={data.loadTimeForCustomer}
          pointsLedger={data.pointsLedger}
          onError={setError}
          onToast={toast.push}
          askConfirm={askConfirm}
        />
      )}
      {tab === "caixa" && (
        <CaixaTab
          customers={data.customers}
          selected={selected}
          setSelected={setSelected}
          settings={data.settings}
          timeLedger={data.timeLedger}
          refresh={data.refreshNow}
          loadTimeForCustomer={data.loadTimeForCustomer}
          onError={setError}
          onToast={toast.push}
          remoteReadOnly={remoteReadOnly}
        />
      )}
      {tab === "estacoes" && (
        <EstacoesTab
          stations={data.stations}
          connected={data.connected}
          liveStatus={data.liveStatus}
          refresh={data.refreshNow}
          onError={setError}
          onToast={toast.push}
          askConfirm={askConfirm}
          remoteReadOnly={remoteReadOnly}
          pairCode={pairCode}
          compact={clerk}
        />
      )}
      {tab === "sessoes" && !clerk && <SessoesTab sessions={data.sessions} sessionStats={data.sessionStats} />}
      {tab === "recompensas" && !clerk && (
        <RecompensasTab
          rewards={data.rewards}
          refresh={data.refreshNow}
          onError={setError}
          onToast={toast.push}
          askConfirm={askConfirm}
        />
      )}
      {tab === "saude" && !clerk && <SaudeTab onError={setError} />}
      {tab === "ajuda" && !clerk && <AjudaTab clerk={false} />}
      {tab === "equipe" && !clerk && (
        <EquipeTab remoteReadOnly={remoteReadOnly} onError={setError} onToast={toast.push} />
      )}
      {tab === "config" && !clerk && (
        <ConfigTab
          settings={data.settings}
          setSettings={data.setSettings}
          onError={setError}
          onToast={toast.push}
        />
      )}
    </div>
  );
}
