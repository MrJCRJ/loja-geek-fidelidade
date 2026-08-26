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
import { ConfigTab } from "../admin/tabs/ConfigTab";
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
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("feed");
  const [live, setLive] = useState<LiveFeedItem[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);

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
      setError("Sessão expirada. Entre novamente com a senha admin.");
    };
    window.addEventListener("lg-auth-expired", onAuthExpired);
    return () => window.removeEventListener("lg-auth-expired", onAuthExpired);
  }, []);

  useEffect(() => {
    if (!token) return;
    api<{ role: string }>("/api/admin/me")
      .then(() => data.refreshNow())
      .catch((err) => setError(err instanceof Error ? err.message : "Falha ao validar sessão"));
  }, [token, data.refreshNow]);

  const login = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const res = await api<{ token: string }>("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password }),
        token: null,
      });
      setAdminToken(res.token);
      setToken(res.token);
      toast.push("Login ok", "ok");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no login");
    }
  };

  const logout = () => {
    setAdminToken(null);
    setToken(null);
  };

  if (!token) {
    return (
      <div className="shell" style={{ maxWidth: 420 }}>
        <h1 className="brand">GeekCentral</h1>
        <p className="muted">PC controle — geeks · Celular e Game</p>
        <form className="panel" onSubmit={login}>
          <div className="field">
            <label>Senha admin</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              data-testid="admin-password"
            />
          </div>
          {error && <p style={{ color: "crimson" }}>{error}</p>}
          <button className="btn" type="submit" data-testid="admin-login">
            Entrar
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="shell">
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
          <p className="muted" style={{ margin: 0 }}>
            geeks · Celular e Game · {data.settings.unitName}
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
        </div>
        <div className="admin-topbar-actions">
          <button className="btn ghost" type="button" onClick={() => data.refreshNow()}>
            Atualizar
          </button>
          <button className="btn danger" type="button" onClick={logout}>
            Sair
          </button>
        </div>
      </div>

      <AdminTabs tab={tab} onChange={setTab} />

      {error && <div className="banner">{error}</div>}

      {tab === "feed" && <FeedTab live={live} events={data.events} />}
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
        />
      )}
      {tab === "sessoes" && <SessoesTab sessions={data.sessions} sessionStats={data.sessionStats} />}
      {tab === "recompensas" && (
        <RecompensasTab
          rewards={data.rewards}
          refresh={data.refreshNow}
          onError={setError}
          onToast={toast.push}
          askConfirm={askConfirm}
        />
      )}
      {tab === "saude" && <SaudeTab onError={setError} />}
      {tab === "config" && (
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
