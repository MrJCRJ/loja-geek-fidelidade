import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "../../api";

export type StaffRow = {
  id: string;
  username: string;
  displayName: string;
  role: "admin" | "clerk";
  active: boolean;
};

type Props = {
  remoteReadOnly?: boolean;
  onError: (msg: string) => void;
  onToast: (msg: string, kind?: "ok" | "error" | "info") => void;
};

export function EquipeTab({ remoteReadOnly, onError, onToast }: Props) {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"clerk" | "admin">("clerk");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ staff: StaffRow[] }>("/api/admin/staff")
      .then((r) => setStaff(r.staff || []))
      .catch((e) => onError(e instanceof Error ? e.message : "Falha ao listar equipe"));
  }, [onError]);

  useEffect(() => {
    load();
  }, [load]);

  const create = (e: FormEvent) => {
    e.preventDefault();
    if (remoteReadOnly) return;
    setBusy(true);
    api<StaffRow>("/api/admin/staff", {
      method: "POST",
      body: JSON.stringify({
        username,
        password,
        displayName: displayName || username,
        role,
      }),
    })
      .then((user) => {
        onToast(`${user.displayName} criado`, "ok");
        setUsername("");
        setDisplayName("");
        setPassword("");
        setRole("clerk");
        load();
      })
      .catch((err) => onError(err instanceof Error ? err.message : "Falha ao criar"))
      .finally(() => setBusy(false));
  };

  const toggleActive = (row: StaffRow) => {
    if (remoteReadOnly) return;
    api<StaffRow>(`/api/admin/staff/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: !row.active }),
    })
      .then((user) => {
        onToast(user.active ? `${user.displayName} ativado` : `${user.displayName} desativado`, "ok");
        load();
      })
      .catch((err) => onError(err instanceof Error ? err.message : "Falha ao atualizar"));
  };

  return (
    <div className="grid-2" role="tabpanel" id="panel-equipe" aria-labelledby="tab-equipe">
      <section className="panel">
        <h2>Equipe</h2>
        <p className="muted">
          Cada um entra com usuário e senha. A auditoria na Ajuda grava o nome de quem vendeu hora ou
          liberou PC.
        </p>
        {remoteReadOnly && (
          <p className="muted">De casa só dá para ver a lista. Crie contas na loja.</p>
        )}
        {!remoteReadOnly && (
          <form onSubmit={create} className="stack">
            <div className="field">
              <label>Usuário</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="joao"
                required
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label>Nome (aparece na auditoria)</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="João"
              />
            </div>
            <div className="field">
              <label>Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <div className="field">
              <label>Papel</label>
              <select value={role} onChange={(e) => setRole(e.target.value as "clerk" | "admin")}>
                <option value="clerk">Funcionário (opera, sem config)</option>
                <option value="admin">Dono (tudo)</option>
              </select>
            </div>
            <button className="btn" type="submit" disabled={busy}>
              Criar conta
            </button>
          </form>
        )}
      </section>
      <section className="panel">
        <h2>Contas</h2>
        {staff.length === 0 ? (
          <div className="empty-state">
            <strong>Nenhuma conta ainda</strong>
            <p>Crie a primeira na loja (bootstrap do dono).</p>
          </div>
        ) : (
          <ul className="feed">
            {staff.map((row) => (
              <li key={row.id}>
                <strong>{row.displayName}</strong> · @{row.username} ·{" "}
                {row.role === "admin" ? "dono" : "funcionário"}
                <div className="muted">{row.active ? "ativo" : "desativado"}</div>
                {!remoteReadOnly && (
                  <button className="btn ghost" type="button" onClick={() => toggleActive(row)}>
                    {row.active ? "Desativar" : "Ativar"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
