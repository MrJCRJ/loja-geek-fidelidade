import { api, type Customer } from "../../api";
import type { PointsLedgerRow } from "../types";

type EditForm = {
  name: string;
  phone: string;
  level: Customer["level"];
  notes: string;
};

type Props = {
  selected: Customer;
  editForm: EditForm;
  onEditFormChange: (form: EditForm) => void;
  resetTokenMsg: string;
  onResetTokenMsgChange: (msg: string) => void;
  pointsLedger: PointsLedgerRow[];
  setSelected: (c: Customer | null) => void;
  setEnrollStep: (n: number) => void;
  refresh: () => Promise<void>;
  loadTimeForCustomer: (id: string) => Promise<void>;
  onError: (msg: string) => void;
  onToast: (msg: string, kind?: "ok" | "error" | "info") => void;
  askConfirm: (opts: {
    title: string;
    message: string;
    danger?: boolean;
    confirmLabel?: string;
  }) => Promise<boolean>;
  onExportLgpd: () => void;
};

export function ClienteManagePanel({
  selected,
  editForm,
  onEditFormChange,
  resetTokenMsg,
  onResetTokenMsgChange,
  pointsLedger,
  setSelected,
  setEnrollStep,
  refresh,
  loadTimeForCustomer,
  onError,
  onToast,
  askConfirm,
  onExportLgpd,
}: Props) {
  return (
    <>
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
            onResetTokenMsgChange("");
            api<{ resetToken: string; expiresAt?: string }>(
              `/api/customers/${selected.id}/password-reset`,
              { method: "POST" },
            )
              .then((r) => {
                onResetTokenMsgChange(
                  `Código (1h): ${r.resetToken}${r.expiresAt ? ` · expira ${new Date(r.expiresAt).toLocaleString("pt-BR")}` : ""}`,
                );
                onToast("Código de reset gerado", "ok");
              })
              .catch((e) => onError(e.message));
          }}
        >
          Reset senha portal
        </button>
        <button className="btn ghost" type="button" onClick={onExportLgpd}>
          Exportar LGPD
        </button>
        <button
          className="btn ghost"
          type="button"
          onClick={async () => {
            const ok = await askConfirm({
              title: "Revogar biometria",
              message:
                "Apagar amostras faciais e revogar consentimento LGPD? A conta, pontos e horas permanecem.",
              danger: true,
              confirmLabel: "Revogar",
            });
            if (!ok) return;
            api<{ customer?: Customer; removed?: number }>(
              `/api/customers/${selected.id}/lgpd/revoke-biometrics`,
              { method: "POST" },
            )
              .then((res) => {
                if (res.customer) setSelected(res.customer);
                onToast(`Biometria revogada (${res.removed ?? 0} amostras)`, "ok");
                return refresh();
              })
              .catch((e) => onError(e.message));
          }}
        >
          Revogar biometria
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
          <input value={editForm.name} onChange={(e) => onEditFormChange({ ...editForm, name: e.target.value })} />
        </div>
        <div className="field">
          <label>Telefone</label>
          <input
            value={editForm.phone}
            onChange={(e) => onEditFormChange({ ...editForm, phone: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Nível</label>
          <select
            value={editForm.level}
            onChange={(e) => onEditFormChange({ ...editForm, level: e.target.value as Customer["level"] })}
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
            onChange={(e) => onEditFormChange({ ...editForm, notes: e.target.value })}
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
  );
}

export type { EditForm };
