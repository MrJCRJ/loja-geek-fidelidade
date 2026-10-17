import { useState } from "react";
import { TimeDurationPicker, durationToSeconds } from "./TimeDurationPicker";

type Props = {
  hourPrice: number;
  subscriber?: boolean;
  packs?: Array<{ amountReais: number; label: string }>;
  busy?: boolean;
  onSellHours: (hours: number) => void;
  onSellReais: (amountReais: number) => void;
};

export function VendaHora({ hourPrice, subscriber, packs, busy, onSellHours, onSellReais }: Props) {
  const [saleBy, setSaleBy] = useState<"hours" | "reais">("hours");
  const [unlockH, setUnlockH] = useState(0);
  const [unlockM, setUnlockM] = useState(30);
  const [reais, setReais] = useState("10");
  const seconds = durationToSeconds(unlockH, unlockM);
  const estimated = Math.round((seconds / 3600) * hourPrice * 100) / 100;

  return (
    <div>
      <div className="row" style={{ flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.5rem" }}>
        <button
          className={`btn ${saleBy === "hours" ? "" : "ghost"}`}
          type="button"
          onClick={() => setSaleBy("hours")}
        >
          Por horário
        </button>
        <button
          className={`btn ${saleBy === "reais" ? "" : "ghost"}`}
          type="button"
          onClick={() => setSaleBy("reais")}
        >
          Por dinheiro
        </button>
      </div>
      {saleBy === "hours" ? (
        <div className="field">
          <label>Tempo a vender (mín. 5 min)</label>
          <TimeDurationPicker
            hours={unlockH}
            minutes={unlockM}
            onChange={(h, m) => {
              setUnlockH(h);
              setUnlockM(m);
            }}
          />
          <p style={{ margin: "0.5rem 0 0", fontWeight: 600 }}>
            {unlockH}h {String(unlockM).padStart(2, "0")}min · R$ {estimated.toFixed(2)}
          </p>
          <p className="muted" style={{ margin: "0.25rem 0 0.75rem", fontSize: "0.85rem" }}>
            Tarifa R$ {hourPrice.toFixed(2)}/h{subscriber ? " (assinante)" : ""}
          </p>
          <button
            className="btn"
            type="button"
            disabled={busy}
            onClick={() => onSellHours(seconds / 3600)}
          >
            Vender horário
          </button>
        </div>
      ) : (
        <div className="field">
          <label>Valor (R$)</label>
          <input type="number" min="1" step="1" value={reais} onChange={(e) => setReais(e.target.value)} />
          {(packs || []).length > 0 && (
            <div className="row" style={{ flexWrap: "wrap", gap: "0.35rem", marginTop: "0.35rem" }}>
              {packs!.map((p) => (
                <button
                  key={`${p.label}-${p.amountReais}`}
                  className="btn ghost"
                  type="button"
                  onClick={() => setReais(String(p.amountReais))}
                >
                  {p.label || `R$ ${p.amountReais}`}
                </button>
              ))}
            </div>
          )}
          <button
            className="btn"
            type="button"
            disabled={busy}
            style={{ marginTop: "0.75rem" }}
            onClick={() => onSellReais(Number(reais))}
          >
            Vender R$
          </button>
        </div>
      )}
    </div>
  );
}
