import { useEffect, useMemo, useState } from "react";
import {
  getApiBase,
  listCachedCentrals,
  setApiBase,
  type CatalogCentral,
} from "../api";

type Props = {
  centrals?: CatalogCentral[];
  className?: string;
};

export function CentralPicker({ centrals, className }: Props) {
  const [base, setBase] = useState(getApiBase);
  const options = useMemo(() => {
    const merged = new Map<string, CatalogCentral>();
    for (const c of [...listCachedCentrals(), ...(centrals || [])]) {
      if (!c.publicApiUrl) continue;
      merged.set(c.unitId, c);
    }
    // Garante o base atual na lista
    if (![...merged.values()].some((c) => c.publicApiUrl === base)) {
      merged.set("_current", {
        unitId: "_current",
        unitName: "Central atual",
        publicApiUrl: base,
        self: true,
      });
    }
    return [...merged.values()];
  }, [centrals, base]);

  useEffect(() => {
    const onChange = () => setBase(getApiBase());
    window.addEventListener("lg-central-changed", onChange);
    return () => window.removeEventListener("lg-central-changed", onChange);
  }, []);

  if (options.length < 2) return null;

  return (
    <div className={className || "central-picker"}>
      <label className="muted" htmlFor="central-select" style={{ display: "block", marginBottom: 4 }}>
        Loja / Central
      </label>
      <select
        id="central-select"
        value={base}
        onChange={(e) => {
          const url = e.target.value;
          if (url === base) return;
          setApiBase(url);
          setBase(url);
        }}
      >
        {options.map((c) => (
          <option key={`${c.unitId}-${c.publicApiUrl}`} value={c.publicApiUrl}>
            {c.unitName}
            {c.self ? " (esta)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
