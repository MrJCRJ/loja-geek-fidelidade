import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";

type AuditRow = {
  id: string;
  created_at: string;
  level: string;
  source: string;
  kind: string;
  message: string;
  station_id: string | null;
  meta?: { actor?: string } | null;
};

export function AjudaTab({ clerk }: { clerk?: boolean }) {
  const [audit, setAudit] = useState<AuditRow[]>([]);

  const load = useCallback(() => {
    api<{ events: AuditRow[] }>("/api/admin/audit")
      .then((r) => setAudit((r.events || []).slice(0, 15)))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="grid-2" role="tabpanel" id="panel-ajuda" aria-labelledby="tab-ajuda">
      <section className="panel">
        <h2>Treino rápido do balcão</h2>
        <ol style={{ lineHeight: 1.7, paddingLeft: "1.2rem" }}>
          <li>
            <strong>Liberar PC:</strong> o VIP senta; o GeekLock reconhece o rosto. Sem face, manda
            cadastrar no site ou nesta tela (Clientes).
          </li>
          <li>
            <strong>Vender horas:</strong> aba Caixa → busca o nome → atalho R$ 10/20/50 ou horas.
          </li>
          <li>
            <strong>Travar:</strong> no GeekLock, PIN Admin ou comando na aba Estações. Ausente some
            da cadeira → aviso e depois trava sozinho.
          </li>
          <li>
            <strong>Face-service caiu / PC offline:</strong> olhe o banner vermelho no topo e a aba
            Saúde.
          </li>
        </ol>
        {clerk ? (
          <p className="muted">Você está no modo balcão: sem Config, sem apagar VIP ou estação.</p>
        ) : (
          <p className="muted">Crie funcionários na aba Equipe (usuário + senha por pessoa).</p>
        )}
      </section>
      <section className="panel">
        <h2>Auditoria recente</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Vendas, PIN Admin e comandos — últimos 15, com o nome de quem fez.
        </p>
        {audit.length === 0 ? (
          <div className="empty-state">
            <strong>Nada registrado ainda</strong>
            <p>Venda uma hora ou use PIN Admin no GeekLock.</p>
          </div>
        ) : (
          <ul className="feed">
            {audit.map((e) => (
              <li key={e.id}>
                <strong>{e.kind}</strong>
                {e.meta?.actor ? ` · ${e.meta.actor}` : ""} · {e.message}
                <div className="muted">{new Date(e.created_at).toLocaleString("pt-BR")}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
