import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  api,
  attachCameraStream,
  captureFrame,
  getAdminToken,
  openUserCamera,
  setAdminToken,
  type Customer,
} from "../api";
import { ENROLL_STEPS } from "../enrollSteps";
import { useAutoEnroll } from "../hooks/useAutoEnroll";
import { AdminTabs } from "../admin/components/AdminTabs";
import { ConfirmModal } from "../admin/components/ConfirmModal";
import { ToastStack } from "../admin/components/Toast";
import { useAdminData } from "../admin/hooks/useAdminData";
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
  const [enrollMsg, setEnrollMsg] = useState("");
  const [camLoading, setCamLoading] = useState(false);
  const [camReady, setCamReady] = useState(false);
  const [enrollStep, setEnrollStep] = useState(0);
  const [enrollBusy, setEnrollBusy] = useState(false);
  const [autoEnrollActive, setAutoEnrollActive] = useState(false);
  const [autoEnrollPaused, setAutoEnrollPaused] = useState(false);
  const [autoEnrollToken, setAutoEnrollToken] = useState(0);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const camBusyRef = useRef(false);

  const toast = useToast();
  const data = useAdminData(token);

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

  const autoEnroll = useAutoEnroll({
    customerId: selected?.id ?? null,
    videoRef,
    active: autoEnrollActive && camReady && tab === "clientes",
    paused: autoEnrollPaused,
    runToken: autoEnrollToken,
    refresh: data.refreshNow,
    onCustomerUpdated: setSelected,
    onComplete: () => setAutoEnrollActive(false),
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

  const startCamInternal = async () => {
    if (camBusyRef.current) return false;
    camBusyRef.current = true;
    setCamLoading(true);
    setError("");
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const stream = await openUserCamera();
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setCamReady(false);
        return false;
      }
      await attachCameraStream(video, stream);
      setCamReady(true);
      setEnrollMsg("Câmera ativa.");
      return true;
    } catch (err) {
      setCamReady(false);
      setError(err instanceof Error ? err.message : "Falha na câmera");
      return false;
    } finally {
      camBusyRef.current = false;
      setCamLoading(false);
    }
  };

  const stopCam = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamReady(false);
    setAutoEnrollActive(false);
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => () => stopCam(), [stopCam]);

  // Lazy: stop camera when leaving clientes tab
  useEffect(() => {
    if (tab !== "clientes") {
      stopCam();
    }
  }, [tab, stopCam]);

  const beginAutoEnroll = useCallback(async (customer: Customer) => {
    setSelected(customer);
    setTab("clientes");
    setEnrollStep(0);
    setEnrollMsg("");
    setAutoEnrollPaused(false);
    setAutoEnrollActive(true);
    await startCamInternal();
    setAutoEnrollToken((t) => t + 1);
  }, []);

  const enrollFace = async () => {
    if (!selected || !videoRef.current) return;
    if (videoRef.current.readyState < 2 || !videoRef.current.videoWidth) {
      setEnrollMsg("Aguarde a câmera estabilizar.");
      return;
    }
    setEnrollBusy(true);
    const step = ENROLL_STEPS[enrollStep] ?? ENROLL_STEPS[0];
    setEnrollMsg(`Capturando: ${step.label}…`);
    try {
      const imageBase64 = captureFrame(videoRef.current, 0.85);
      const res = await api<{ ok: boolean; quality?: number }>(`/api/customers/${selected.id}/enroll`, {
        method: "POST",
        body: JSON.stringify({ imageBase64 }),
      });
      const q = res.quality != null ? ` (qualidade ${(res.quality * 100).toFixed(0)}%)` : "";
      const next = enrollStep + 1;
      if (next < ENROLL_STEPS.length) {
        setEnrollStep(next);
        setEnrollMsg(`Amostra “${step.label}” salva${q}. Próximo: ${ENROLL_STEPS[next].hint}`);
      } else {
        setEnrollStep(0);
        setEnrollMsg(`Enroll completo (5 ângulos)${q}.`);
        toast.push("Enroll completo", "ok");
      }
      await data.refreshNow();
      const updated = await api<Customer>(`/api/customers/${selected.id}`);
      setSelected(updated);
    } catch (err) {
      setEnrollMsg(err instanceof Error ? err.message : "Falha no enroll");
    } finally {
      setEnrollBusy(false);
    }
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

      <div className="row" style={{ justifyContent: "space-between" }}>
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
        <div className="row">
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
          videoRef={videoRef}
          camLoading={camLoading}
          camReady={camReady}
          enrollStep={enrollStep}
          setEnrollStep={setEnrollStep}
          enrollBusy={enrollBusy}
          enrollMsg={enrollMsg}
          setEnrollMsg={setEnrollMsg}
          autoEnrollActive={autoEnrollActive}
          setAutoEnrollActive={setAutoEnrollActive}
          autoEnrollPaused={autoEnrollPaused}
          setAutoEnrollPaused={setAutoEnrollPaused}
          setAutoEnrollToken={setAutoEnrollToken}
          autoEnroll={autoEnroll}
          startCam={() => startCamInternal()}
          stopCam={stopCam}
          enrollFace={enrollFace}
          beginAutoEnroll={beginAutoEnroll}
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
