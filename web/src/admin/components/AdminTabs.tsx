import type { Tab } from "../types";

const TABS: Array<[Tab, string]> = [
  ["feed", "Feed VIP"],
  ["clientes", "Clientes"],
  ["caixa", "Caixa"],
  ["estacoes", "Estações"],
  ["sessoes", "Sessões / Horas"],
  ["recompensas", "Recompensas"],
  ["saude", "Saúde"],
  ["config", "Config"],
];

type Props = {
  tab: Tab;
  onChange: (tab: Tab) => void;
};

export function AdminTabs({ tab, onChange }: Props) {
  return (
    <div className="tabs" role="tablist" aria-label="GeekCentral">
      {TABS.map(([id, label]) => {
        const selected = tab === id;
        return (
          <button
            key={id}
            role="tab"
            id={`tab-${id}`}
            aria-selected={selected}
            aria-controls={`panel-${id}`}
            tabIndex={selected ? 0 : -1}
            className={`btn ${selected ? "active" : "ghost"}`}
            type="button"
            onClick={() => onChange(id)}
            onKeyDown={(e) => {
              const idx = TABS.findIndex(([t]) => t === tab);
              if (e.key === "ArrowRight") {
                e.preventDefault();
                onChange(TABS[(idx + 1) % TABS.length][0]);
              } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                onChange(TABS[(idx - 1 + TABS.length) % TABS.length][0]);
              } else if (e.key === "Home") {
                e.preventDefault();
                onChange(TABS[0][0]);
              } else if (e.key === "End") {
                e.preventDefault();
                onChange(TABS[TABS.length - 1][0]);
              }
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
