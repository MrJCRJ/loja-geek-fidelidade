import type { Tab } from "../types";

const ALL_TABS: Array<[Tab, string, string]> = [
  ["dashboard", "Dashboard", "Dash"],
  ["feed", "Feed VIP", "Feed"],
  ["clientes", "Clientes", "VIPs"],
  ["caixa", "Caixa", "Caixa"],
  ["estacoes", "Estações", "PCs"],
  ["sessoes", "Sessões / Horas", "Horas"],
  ["recompensas", "Recompensas", "Prêmios"],
  ["saude", "Saúde", "Saúde"],
  ["ajuda", "Ajuda", "Ajuda"],
  ["equipe", "Equipe", "Equipe"],
  ["config", "Config", "Config"],
];

type Props = {
  tab: Tab;
  onChange: (tab: Tab) => void;
  clerk?: boolean;
};

export function AdminTabs({ tab, onChange, clerk }: Props) {
  const TABS = clerk
    ? ALL_TABS.filter(([id]) => id !== "config" && id !== "recompensas" && id !== "equipe")
    : ALL_TABS;
  return (
    <div className="tabs" role="tablist" aria-label="GeekCentral">
      {TABS.map(([id, label, short]) => {
        const selected = tab === id;
        return (
          <button
            key={id}
            role="tab"
            id={`tab-${id}`}
            aria-selected={selected}
            aria-controls={`panel-${id}`}
            aria-label={label}
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
            <span className="tab-label-full">{label}</span>
            <span className="tab-label-short">{short}</span>
          </button>
        );
      })}
    </div>
  );
}
