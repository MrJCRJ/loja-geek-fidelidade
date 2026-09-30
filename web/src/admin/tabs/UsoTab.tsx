import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";

type UsageSummary = {
  hours: number;
  kwh: number;
  costReais: number;
  tariffReaisPerKwh: number;
  topApps: Array<{ process: string; minutes: number }>;
  stations: Array<{
    stationId: string;
    kwh: number;
    costReais: number;
    minutes: number;
    peakCpu: number;
    hardware: {
      cpuName?: string | null;
      gpus?: Array<{ vendor: string; model: string }>;
      tdpCpuW?: number;
      tdpGpuW?: number;
      idleW?: number;
    } | null;
  }>;
  occupants: Array<{
    kind: string;
    label: string;
    customerId: string | null;
    minutes: number;
    kwh: number;
    costReais: number;
    topApps: Array<{ process: string; minutes: number }>;
  }>;
  recent: Array<{
    stationId: string;
    minuteTs: string;
    kind: string;
    label?: string | null;
    app?: string | null;
    title?: string | null;
    cpu?: number | null;
    gpu?: number | null;
    watts?: number | null;
  }>;
  settings?: {
    usageDetailedTitles?: boolean;
    energyTariffReaisPerKwh?: number;
    staffTimedMaxMinutes?: number;
  };
};

type Props = {
  stationNames: Record<string, string>;
  onError: (msg: string) => void;
  onToast: (msg: string, kind?: "ok" | "error" | "info") => void;
};

function money(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function kindLabel(k: string) {
  if (k === "vip") return "VIP";
  if (k === "staff_timed") return "Staff (tempo)";
  if (k === "staff_open") return "Staff (aberto)";
  if (k === "guest_named") return "Convidado";
  return k;
}

export function UsoTab({ stationNames, onError, onToast }: Props) {
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<UsageSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await api<UsageSummary>(`/api/admin/usage?hours=${hours}`);
      setData(res);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Falha ao carregar uso");
    } finally {
      setBusy(false);
    }
  }, [hours, onError]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  const saveEnergy = async (
    stationId: string,
    patch: { tdpCpuW?: number; tdpGpuW?: number; idleW?: number },
  ) => {
    try {
      await api(`/api/admin/stations/${stationId}/energy`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      onToast("Calibração salva", "ok");
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Falha ao salvar energia");
    }
  };

  return (
    <div className="grid-2" role="tabpanel" id="panel-uso" aria-labelledby="tab-uso">
      <section className="panel">
        <h2>Uso das estações</h2>
        <p className="muted">
          Energia estimada · apps em foco · amarrado a VIP / staff / convidado. Só o dono vê esta aba.
          {busy ? " · atualizando…" : ""}
        </p>
        <div className="row">
          {[24, 72, 168].map((h) => (
            <button
              key={h}
              type="button"
              className={`btn ${hours === h ? "active" : "ghost"}`}
              onClick={() => setHours(h)}
            >
              {h === 168 ? "7d" : `${h}h`}
            </button>
          ))}
          <button type="button" className="btn ghost" onClick={() => void load()}>
            Atualizar
          </button>
        </div>
        {data && (
          <div className="row" style={{ marginTop: "1rem", gap: "1.5rem", flexWrap: "wrap" }}>
            <div>
              <strong>{data.kwh.toFixed(2)} kWh</strong>
              <div className="muted">estimados</div>
            </div>
            <div>
              <strong>{money(data.costReais)}</strong>
              <div className="muted">@ {money(data.tariffReaisPerKwh)}/kWh</div>
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Top apps</h2>
        {!data?.topApps?.length && <p className="muted">Ainda sem amostras — libere um PC com GeekLock 1.1.6+.</p>}
        <ul>
          {(data?.topApps || []).map((a) => (
            <li key={a.process}>
              <code>{a.process}</code> · {a.minutes} min
            </li>
          ))}
        </ul>
      </section>

      <section className="panel" style={{ gridColumn: "1 / -1" }}>
        <h2>Por estação / hardware</h2>
        <table>
          <thead>
            <tr>
              <th>PC</th>
              <th>GPU</th>
              <th>kWh</th>
              <th>R$</th>
              <th>TDP CPU/GPU/idle</th>
            </tr>
          </thead>
          <tbody>
            {(data?.stations || []).map((s) => {
              const gpu = s.hardware?.gpus?.[0];
              return (
                <tr key={s.stationId}>
                  <td>{stationNames[s.stationId] || s.stationId.slice(0, 8)}</td>
                  <td>
                    {gpu ? (
                      <span className="status-pill ok">
                        {gpu.vendor.toUpperCase()} · {gpu.model}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{s.kwh.toFixed(3)}</td>
                  <td>{money(s.costReais)}</td>
                  <td>
                    <form
                      className="row"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const fd = new FormData(e.currentTarget);
                        void saveEnergy(s.stationId, {
                          tdpCpuW: Number(fd.get("cpu")),
                          tdpGpuW: Number(fd.get("gpu")),
                          idleW: Number(fd.get("idle")),
                        });
                      }}
                    >
                      <input name="cpu" type="number" defaultValue={s.hardware?.tdpCpuW ?? 65} style={{ width: 64 }} />
                      <input name="gpu" type="number" defaultValue={s.hardware?.tdpGpuW ?? 150} style={{ width: 64 }} />
                      <input name="idle" type="number" defaultValue={s.hardware?.idleW ?? 45} style={{ width: 64 }} />
                      <button className="btn ghost" type="submit">
                        OK
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>Por ocupante</h2>
        <ul>
          {(data?.occupants || []).map((o, i) => (
            <li key={`${o.kind}-${o.label}-${i}`}>
              <strong>{kindLabel(o.kind)}</strong> · {o.label} · {o.minutes} min · {money(o.costReais)}
              <div className="muted">
                {(o.topApps || []).map((a) => a.process).join(", ") || "—"}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Minutos recentes</h2>
        <ul style={{ maxHeight: 280, overflow: "auto" }}>
          {(data?.recent || []).map((r, i) => (
            <li key={`${r.minuteTs}-${i}`}>
              <code>{new Date(r.minuteTs).toLocaleString("pt-BR")}</code> ·{" "}
              {stationNames[r.stationId] || "PC"} · {kindLabel(r.kind)} · {r.app || "—"}
              {r.title ? ` · ${r.title}` : ""} · {r.watts != null ? `${r.watts} W` : ""}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
