import { useState } from "react";
import { api, type Reward } from "../../api";

type Props = {
  rewards: Reward[];
  refresh: () => Promise<void>;
  onError: (msg: string) => void;
  onToast: (msg: string, kind?: "ok" | "error" | "info") => void;
  askConfirm: (opts: {
    title: string;
    message: string;
    danger?: boolean;
    confirmLabel?: string;
  }) => Promise<boolean>;
};

export function RecompensasTab({ rewards, refresh, onError, onToast, askConfirm }: Props) {
  const [rewardForm, setRewardForm] = useState({ title: "", description: "", costPoints: 50 });

  return (
    <div className="grid-2" role="tabpanel" id="panel-recompensas" aria-labelledby="tab-recompensas">
      <section className="panel">
        <h2>Nova recompensa</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            api("/api/rewards", {
              method: "POST",
              body: JSON.stringify(rewardForm),
            })
              .then(() => {
                setRewardForm({ title: "", description: "", costPoints: 50 });
                onToast("Recompensa criada", "ok");
                return refresh();
              })
              .catch((err) => onError(err.message));
          }}
        >
          <div className="field">
            <label>Título</label>
            <input
              required
              value={rewardForm.title}
              onChange={(e) => setRewardForm({ ...rewardForm, title: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Descrição</label>
            <input
              value={rewardForm.description}
              onChange={(e) => setRewardForm({ ...rewardForm, description: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Custo em pontos</label>
            <input
              type="number"
              min={1}
              value={rewardForm.costPoints}
              onChange={(e) => setRewardForm({ ...rewardForm, costPoints: Number(e.target.value) })}
            />
          </div>
          <button className="btn" type="submit">
            Salvar
          </button>
        </form>
      </section>
      <section className="panel">
        <h2>Catálogo</h2>
        {rewards.length === 0 ? (
          <div className="empty-state">
            <strong>Nenhuma recompensa</strong>
            <p>Crie a primeira no formulário ao lado para o VIP resgatar pontos.</p>
          </div>
        ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Título</th>
              <th>Pontos</th>
              <th>Ativa</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rewards.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.title}</strong>
                  <div className="muted">{r.description}</div>
                </td>
                <td>{r.cost_points}</td>
                <td>{r.active ? "sim" : "não"}</td>
                <td className="row">
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() =>
                      api(`/api/rewards/${r.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ active: !r.active }),
                      })
                        .then(refresh)
                        .catch((e) => onError(e.message))
                    }
                  >
                    {r.active ? "Desativar" : "Ativar"}
                  </button>
                  <button
                    className="btn danger"
                    type="button"
                    onClick={async () => {
                      const ok = await askConfirm({
                        title: "Excluir recompensa",
                        message: `Excluir “${r.title}”?`,
                        danger: true,
                      });
                      if (!ok) return;
                      api(`/api/rewards/${r.id}`, { method: "DELETE" })
                        .then(() => {
                          onToast("Recompensa removida", "ok");
                          return refresh();
                        })
                        .catch((e) => onError(e.message));
                    }}
                  >
                    Del
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </section>
    </div>
  );
}
