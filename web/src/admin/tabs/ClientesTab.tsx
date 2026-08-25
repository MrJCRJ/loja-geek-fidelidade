import { useMemo, useState, type FormEvent, type RefObject } from "react";
import {
  api,
  type Customer,
} from "../../api";
import { ENROLL_STEPS } from "../../enrollSteps";
import { formatHours } from "../format";
import type { PointsLedgerRow } from "../types";

type AutoEnrollApi = {
  step: number;
  busy: boolean;
  overlay: string;
  message: string;
  completed: boolean;
  reset: () => void;
  restart: () => void;
};

type Props = {
  customers: Customer[];
  selected: Customer | null;
  setSelected: (c: Customer | null) => void;
  videoRef: RefObject<HTMLVideoElement | null>;
  camLoading: boolean;
  camReady: boolean;
  enrollStep: number;
  setEnrollStep: (n: number) => void;
  enrollBusy: boolean;
  enrollMsg: string;
  setEnrollMsg: (s: string) => void;
  autoEnrollActive: boolean;
  setAutoEnrollActive: (v: boolean) => void;
  autoEnrollPaused: boolean;
  setAutoEnrollPaused: (v: boolean | ((p: boolean) => boolean)) => void;
  setAutoEnrollToken: (fn: (t: number) => number) => void;
  autoEnroll: AutoEnrollApi;
  startCam: () => void;
  stopCam: () => void;
  enrollFace: () => void;
  beginAutoEnroll: (c: Customer) => void;
  refresh: () => Promise<void>;
  loadTimeForCustomer: (id: string) => Promise<void>;
  pointsLedger: PointsLedgerRow[];
  onError: (msg: string) => void;
  onToast: (msg: string, kind?: "ok" | "error" | "info") => void;
  askConfirm: (opts: {
    title: string;
    message: string;
    danger?: boolean;
    confirmLabel?: string;
  }) => Promise<boolean>;
};

export function ClientesTab(props: Props) {
  const {
    customers,
    selected,
    setSelected,
    videoRef,
    camLoading,
    camReady,
    enrollStep,
    setEnrollStep,
    enrollBusy,
    enrollMsg,
    setEnrollMsg,
    autoEnrollActive,
    setAutoEnrollActive,
    autoEnrollPaused,
    setAutoEnrollPaused,
    setAutoEnrollToken,
    autoEnroll,
    startCam,
    stopCam,
    enrollFace,
    beginAutoEnroll,
    refresh,
    loadTimeForCustomer,
    pointsLedger,
    onError,
    onToast,
    askConfirm,
  } = props;

  const [query, setQuery] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", level: "bronze", notes: "", consent: true });
  const [editForm, setEditForm] = useState({ name: "", phone: "", level: "bronze" as Customer["level"], notes: "" });
  const [resetTokenMsg, setResetTokenMsg] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => {
      const hay = `${c.name} ${c.phone || ""} ${c.email || ""} ${c.level}`.toLowerCase();
      return hay.includes(q);
    });
  }, [customers, query]);

  const createCustomer = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.consent) {
      onError("Marque o consentimento LGPD para cadastrar VIP com reconhecimento facial.");
      return;
    }
    try {
      const created = await api<Customer>("/api/customers", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm({ name: "", phone: "", level: "bronze", notes: "", consent: true });
      onToast(`VIP ${created.name} cadastrado`, "ok");
      await refresh();
      await beginAutoEnroll(created);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Falha ao cadastrar cliente");
    }
  };

  const selectCustomer = (c: Customer) => {
    setSelected(c);
    setEditForm({
      name: c.name,
      phone: c.phone || "",
      level: c.level,
      notes: c.notes || "",
    });
    setResetTokenMsg("");
    setEnrollStep(0);
    setEnrollMsg("");
    setAutoEnrollActive(false);
    autoEnroll.reset();
    loadTimeForCustomer(c.id).catch(() => undefined);
  };

  const exportLgpd = async () => {
    if (!selected) return;
    try {
      const data = await api<unknown>(`/api/customers/${selected.id}/export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lgpd-${selected.name.replace(/\s+/g, "-").toLowerCase()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      onToast("Exportação LGPD baixada", "ok");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Falha na exportação");
    }
  };

  return (
    <div className="grid-2" role="tabpanel" id="panel-clientes" aria-labelledby="tab-clientes">
      <section className="panel">
        <h2>Novo VIP</h2>
        <form onSubmit={createCustomer}>
          <div className="field">
            <label>Nome</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label>WhatsApp</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="field">
            <label>Nível</label>
            <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
              <option value="bronze">Bronze</option>
              <option value="prata">Prata</option>
              <option value="ouro">Ouro</option>
            </select>
          </div>
          <div className="field">
            <label>Notas</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <label className="row">
            <input
              type="checkbox"
              checked={form.consent}
              onChange={(e) => setForm({ ...form, consent: e.target.checked })}
            />
            Consentimento LGPD (biometria)
          </label>
          <div style={{ marginTop: "0.75rem" }}>
            <button className="btn" type="submit">
              Cadastrar
            </button>
          </div>
        </form>

        <h3 style={{ marginTop: "1.5rem" }}>Lista</h3>
        <div className="field">
          <label>Buscar</label>
          <input
            placeholder="Nome, WhatsApp, e-mail…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Nível</th>
              <th>Saldo</th>
              <th>Pts</th>
              <th>Faces</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => selectCustomer(c)}>
                <td>
                  {c.name}
                  {c.email ? (
                    <span className="tag web" style={{ marginLeft: 6 }} title={c.email}>
                      Web
                    </span>
                  ) : null}
                  {(c.face_samples ?? 0) === 0 ? (
                    <span className="tag noface" style={{ marginLeft: 6 }}>
                      Sem face
                    </span>
                  ) : null}
                  {c.subscription_status === "active" && (
                    <span className="tag ouro" style={{ marginLeft: 6 }}>
                      Assinante
                    </span>
                  )}
                </td>
                <td>
                  <span className={`tag ${c.level}`}>{c.level}</span>
                </td>
                <td>{formatHours(c.time_balance_seconds ?? 0)}</td>
                <td>{c.points}</td>
                <td>{c.face_samples ?? 0}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  Nenhum cliente encontrado
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>Enroll facial</h2>
        {!selected && <p className="muted">Selecione um cliente na lista.</p>}
        {selected && (
          <>
            <p>
              <strong>{selected.name}</strong>{" "}
              <span className={`tag ${selected.level}`}>{selected.level}</span>
              {(selected.face_samples ?? 0) === 0 ? (
                <span className="tag noface" style={{ marginLeft: 6 }}>
                  Sem face
                </span>
              ) : null}{" "}
              · {selected.points} pts · {selected.face_samples ?? 0} amostras
            </p>
            <div className="enroll-progress">
              {ENROLL_STEPS.map((s, i) => {
                const currentStep = autoEnrollActive ? autoEnroll.step : enrollStep;
                const stepState =
                  autoEnroll.overlay === "saved" && i === currentStep
                    ? "done"
                    : i === currentStep
                      ? autoEnroll.busy
                        ? "capturing"
                        : "active"
                      : i < currentStep
                        ? "done"
                        : "pending";
                return (
                  <span key={s.id} className={`enroll-step ${stepState}`}>
                    {i + 1}. {s.label}
                  </span>
                );
              })}
            </div>
            <p className="muted">
              {autoEnrollActive ? ENROLL_STEPS[autoEnroll.step]?.hint : ENROLL_STEPS[enrollStep]?.hint}
            </p>
            <div className="video-wrap">
              <video ref={videoRef} muted playsInline autoPlay />
              <div
                className={`face-guide enroll-overlay-${autoEnrollActive ? autoEnroll.overlay : "idle"}`}
                aria-hidden
              />
              <p className="face-guide-label">
                {autoEnrollActive ? "Captura automática" : "Centralize o rosto"}
              </p>
            </div>
            <div className="row" style={{ marginTop: "0.75rem" }}>
              <button className="btn" type="button" disabled={camLoading} onClick={() => startCam()}>
                {camLoading ? "Abrindo câmera…" : "Ligar câmera"}
              </button>
              {autoEnrollActive && (
                <button
                  className="btn"
                  type="button"
                  onClick={() => setAutoEnrollPaused((p) => !p)}
                  disabled={autoEnroll.completed}
                >
                  {autoEnrollPaused ? "Retomar automático" : "Pausar automático"}
                </button>
              )}
              {!autoEnrollActive && (
                <button
                  className="btn"
                  type="button"
                  disabled={!camReady || camLoading}
                  onClick={() => {
                    setAutoEnrollPaused(false);
                    setAutoEnrollActive(true);
                    setAutoEnrollToken((t) => t + 1);
                  }}
                >
                  Iniciar captura automática
                </button>
              )}
              <button
                className="btn ghost"
                type="button"
                disabled={enrollBusy || camLoading || autoEnroll.busy}
                onClick={() => enrollFace()}
              >
                {enrollBusy ? "Capturando…" : `Captura manual: ${ENROLL_STEPS[enrollStep]?.label ?? "amostra"}`}
              </button>
              <button
                className="btn ghost"
                type="button"
                onClick={() => {
                  autoEnroll.reset();
                  setAutoEnrollActive(false);
                  setAutoEnrollPaused(false);
                  setEnrollStep(0);
                  setEnrollMsg("Progresso reiniciado.");
                }}
              >
                Reiniciar progresso
              </button>
              <button
                className="btn ghost"
                type="button"
                disabled={!selected || (selected.face_samples ?? 0) === 0}
                onClick={async () => {
                  const ok = await askConfirm({
                    title: "Zerar amostras",
                    message: `Apagar as ${selected.face_samples ?? 0} amostras faciais de ${selected.name}?`,
                    danger: true,
                    confirmLabel: "Apagar",
                  });
                  if (!ok) return;
                  try {
                    const res = await api<{ customer?: Customer; removed?: number }>(
                      `/api/customers/${selected.id}/enroll`,
                      { method: "DELETE" },
                    );
                    if (res.customer) setSelected(res.customer);
                    await refresh();
                    autoEnroll.reset();
                    setAutoEnrollActive(false);
                    setEnrollStep(0);
                    setEnrollMsg(`Amostras apagadas (${res.removed ?? 0}).`);
                    onToast("Amostras apagadas", "ok");
                  } catch (e) {
                    onError(e instanceof Error ? e.message : "Falha ao zerar");
                  }
                }}
              >
                Zerar amostras
              </button>
              {autoEnroll.completed && (
                <button
                  className="btn ghost"
                  type="button"
                  onClick={async () => {
                    if ((selected.face_samples ?? 0) > 0) {
                      const ok = await askConfirm({
                        title: "Refazer enroll",
                        message: "Apagar amostras atuais e refazer o enroll do zero?",
                        danger: true,
                      });
                      if (!ok) return;
                      await api(`/api/customers/${selected.id}/enroll`, { method: "DELETE" });
                      await refresh();
                      const updated = await api<Customer>(`/api/customers/${selected.id}`);
                      setSelected(updated);
                    }
                    autoEnroll.restart();
                    setAutoEnrollPaused(false);
                    setAutoEnrollActive(true);
                    setAutoEnrollToken((t) => t + 1);
                    setEnrollStep(0);
                    setEnrollMsg("Recomeçando enroll…");
                  }}
                >
                  Refazer enroll
                </button>
              )}
              <button className="btn ghost" type="button" onClick={stopCam}>
                Parar
              </button>
            </div>
            {(autoEnrollActive ? autoEnroll.message : enrollMsg) && (
              <p>{autoEnrollActive ? autoEnroll.message : enrollMsg}</p>
            )}
            <div className="row" style={{ marginTop: "0.75rem" }}>
              <button
                className="btn"
                type="button"
                onClick={() =>
                  api(`/api/customers/${selected.id}/points`, {
                    method: "POST",
                    body: JSON.stringify({ amountReais: 50, reason: "Ajuste admin R$50" }),
                  })
                    .then(() => {
                      onToast("+50 pts", "ok");
                      refresh();
                      return loadTimeForCustomer(selected.id);
                    })
                    .catch((e) => onError(e.message))
                }
              >
                +50 pts (R$50)
              </button>
              <button
                className="btn ghost"
                type="button"
                disabled={!selected.email}
                onClick={() => {
                  setResetTokenMsg("");
                  api<{ resetToken: string; expiresAt?: string }>(
                    `/api/customers/${selected.id}/password-reset`,
                    { method: "POST" },
                  )
                    .then((r) => {
                      setResetTokenMsg(
                        `Código (1h): ${r.resetToken}${r.expiresAt ? ` · expira ${new Date(r.expiresAt).toLocaleString("pt-BR")}` : ""}`,
                      );
                      onToast("Código de reset gerado", "ok");
                    })
                    .catch((e) => onError(e.message));
                }}
              >
                Reset senha portal
              </button>
              <button className="btn ghost" type="button" onClick={exportLgpd}>
                Exportar LGPD
              </button>
              <button
                className="btn danger"
                type="button"
                onClick={async () => {
                  const ok = await askConfirm({
                    title: "Excluir cliente",
                    message: "Excluir cliente e embeddings?",
                    danger: true,
                    confirmLabel: "Excluir",
                  });
                  if (!ok) return;
                  api(`/api/customers/${selected.id}`, { method: "DELETE" })
                    .then(() => {
                      setSelected(null);
                      setEnrollStep(0);
                      onToast("Cliente excluído", "ok");
                      return refresh();
                    })
                    .catch((e) => onError(e.message));
                }}
              >
                Excluir
              </button>
            </div>
            {resetTokenMsg ? <p className="banner ok">{resetTokenMsg}</p> : null}

            <div className="panel" style={{ marginTop: "1rem", boxShadow: "none" }}>
              <h3 style={{ marginTop: 0 }}>Editar cliente</h3>
              <div className="field">
                <label>Nome</label>
                <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div className="field">
                <label>Telefone</label>
                <input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
              </div>
              <div className="field">
                <label>Nível</label>
                <select
                  value={editForm.level}
                  onChange={(e) => setEditForm({ ...editForm, level: e.target.value as Customer["level"] })}
                >
                  <option value="bronze">bronze</option>
                  <option value="prata">prata</option>
                  <option value="ouro">ouro</option>
                </select>
              </div>
              <div className="field">
                <label>Notas</label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                />
              </div>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  api<Customer>(`/api/customers/${selected.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({
                      name: editForm.name,
                      phone: editForm.phone || undefined,
                      level: editForm.level,
                      notes: editForm.notes || undefined,
                    }),
                  })
                    .then((c) => {
                      setSelected(c);
                      onToast("Cliente atualizado", "ok");
                      return refresh();
                    })
                    .catch((e) => onError(e.message));
                }}
              >
                Salvar alterações
              </button>
            </div>

            {pointsLedger.length > 0 ? (
              <div style={{ marginTop: "1rem" }}>
                <h3>Extrato de pontos</h3>
                <ul className="feed">
                  {pointsLedger.slice(0, 12).map((p) => (
                    <li key={p.id}>
                      <strong>
                        {p.delta >= 0 ? "+" : ""}
                        {p.delta} pts
                      </strong>{" "}
                      · {p.reason} ·{" "}
                      <span className="muted">{new Date(p.created_at).toLocaleString("pt-BR")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
