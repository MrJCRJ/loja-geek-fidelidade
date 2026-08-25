import type { FormEvent } from "react";
import type { Customer } from "../../api";
import { formatHours } from "../format";

type CreateForm = {
  name: string;
  phone: string;
  level: string;
  notes: string;
  consent: boolean;
};

type Props = {
  customers: Customer[];
  query: string;
  onQueryChange: (q: string) => void;
  form: CreateForm;
  onFormChange: (form: CreateForm) => void;
  onSubmit: (e: FormEvent) => void;
  onSelect: (c: Customer) => void;
};

export function ClientesListPanel({
  customers,
  query,
  onQueryChange,
  form,
  onFormChange,
  onSubmit,
  onSelect,
}: Props) {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? customers.filter((c) => {
        const hay = `${c.name} ${c.phone || ""} ${c.email || ""} ${c.level}`.toLowerCase();
        return hay.includes(q);
      })
    : customers;

  return (
    <section className="panel">
      <h2>Novo VIP</h2>
      <form onSubmit={onSubmit}>
        <div className="field">
          <label>Nome</label>
          <input required value={form.name} onChange={(e) => onFormChange({ ...form, name: e.target.value })} />
        </div>
        <div className="field">
          <label>WhatsApp</label>
          <input value={form.phone} onChange={(e) => onFormChange({ ...form, phone: e.target.value })} />
        </div>
        <div className="field">
          <label>Nível</label>
          <select value={form.level} onChange={(e) => onFormChange({ ...form, level: e.target.value })}>
            <option value="bronze">Bronze</option>
            <option value="prata">Prata</option>
            <option value="ouro">Ouro</option>
          </select>
        </div>
        <div className="field">
          <label>Notas</label>
          <textarea value={form.notes} onChange={(e) => onFormChange({ ...form, notes: e.target.value })} />
        </div>
        <label className="row">
          <input
            type="checkbox"
            checked={form.consent}
            onChange={(e) => onFormChange({ ...form, consent: e.target.checked })}
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
        <input placeholder="Nome, WhatsApp, e-mail…" value={query} onChange={(e) => onQueryChange(e.target.value)} />
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
            <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => onSelect(c)}>
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
              <td colSpan={5}>
                <div className="empty-state">
                  <strong>Nenhum VIP aqui</strong>
                  <p>Cadastre um cliente ao lado ou ajuste a busca.</p>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

export type { CreateForm };
