import { useEffect, useState } from "react";
import { api, getAdminToken } from "../../api";
import type { AdminSettings } from "../types";

type BackupRow = { fileName: string; size: number; createdAt: string };
type BackupSchedule = {
  enabled: boolean;
  intervalHours: number;
  keep: number;
  lastBackupAt: string | null;
  nextDueAt: string | null;
};
type Readiness = {
  faceService?: boolean;
  secretsOk: boolean;
  strictSecrets: boolean;
  portalCheckoutMode: string;
  mpConfigured: boolean;
  tunnelHint: string;
  checklist: Array<{ id: string; ok: boolean; label: string }>;
  unit: { unitName: string; unitId: string };
};

type Props = {
  settings: AdminSettings;
  setSettings: (s: AdminSettings) => void;
  onError: (msg: string) => void;
  onToast: (msg: string, kind?: "ok" | "error" | "info") => void;
};

export function ConfigTab({ settings, setSettings, onError, onToast }: Props) {
  const [backups, setBackups] = useState<BackupRow[]>([]);
  const [schedule, setSchedule] = useState<BackupSchedule | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [busy, setBusy] = useState(false);

  const loadMeta = async () => {
    try {
      const [b, r] = await Promise.all([
        api<{ backups: BackupRow[]; schedule?: BackupSchedule }>("/api/admin/backups"),
        api<Readiness>("/api/admin/readiness"),
      ]);
      setBackups(b.backups);
      setSchedule(b.schedule || null);
      setReadiness(r);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    loadMeta().catch(() => undefined);
  }, []);

  const downloadBackup = async (fileName: string) => {
    const token = getAdminToken();
    const res = await fetch(`/api/admin/backups/${encodeURIComponent(fileName)}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("Falha ao baixar backup");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div role="tabpanel" id="panel-config" aria-labelledby="tab-config">
      <section className="panel" style={{ maxWidth: 560 }}>
        <h2>Configurações</h2>
        <div className="field">
          <label>Nome da unidade</label>
          <input
            value={settings.unitName}
            onChange={(e) => setSettings({ ...settings, unitName: e.target.value })}
          />
        </div>
        <div className="field">
          <label>ID da unidade</label>
          <input
            value={settings.unitId}
            onChange={(e) => setSettings({ ...settings, unitId: e.target.value })}
          />
          <p className="muted" style={{ margin: "0.35rem 0 0" }}>
            Identifica esta loja no GeekCentral (base multi-unidade). Use um ID por PC controle.
            O portal lista as 3 unidades comerciais; só a lan aponta o GeekLock para este Central.
          </p>
        </div>
        <div className="field">
          <label>Limiar de match facial (0.1–0.99)</label>
          <input
            type="number"
            step="0.01"
            min={0.1}
            max={0.99}
            value={settings.faceMatchThreshold}
            onChange={(e) => setSettings({ ...settings, faceMatchThreshold: Number(e.target.value) })}
          />
        </div>
        <div className="field">
          <label>Pontos por R$ 1 (fidelidade)</label>
          <input
            type="number"
            step="0.1"
            min={0.01}
            value={settings.pointsPerReal}
            onChange={(e) => setSettings({ ...settings, pointsPerReal: Number(e.target.value) })}
          />
        </div>
        <div className="field">
          <label>Preço da hora no PC (R$)</label>
          <input
            type="number"
            step="0.5"
            min={0.5}
            value={settings.hourPriceReais}
            onChange={(e) => setSettings({ ...settings, hourPriceReais: Number(e.target.value) })}
          />
        </div>
        <div className="field">
          <label>Desconto assinante nas horas (%)</label>
          <input
            type="number"
            step="1"
            min={0}
            max={90}
            value={settings.subscriberHourDiscountPct}
            onChange={(e) =>
              setSettings({ ...settings, subscriberHourDiscountPct: Number(e.target.value) })
            }
          />
        </div>
        <button
          className="btn"
          type="button"
          onClick={() =>
            api<AdminSettings>("/api/settings", {
              method: "PUT",
              body: JSON.stringify(settings),
            })
              .then((s) => {
                setSettings({
                  faceMatchThreshold: s.faceMatchThreshold,
                  pointsPerReal: s.pointsPerReal,
                  hourPriceReais: s.hourPriceReais ?? 10,
                  subscriberHourDiscountPct: s.subscriberHourDiscountPct ?? 20,
                  unitName: s.unitName || "Unidade 1",
                  unitId: s.unitId || "unit-1",
                  backupAutoEnabled: s.backupAutoEnabled !== false,
                  backupIntervalHours: s.backupIntervalHours ?? 24,
                  backupKeep: s.backupKeep ?? 20,
                });
                onToast("Configurações salvas", "ok");
                return loadMeta();
              })
              .catch((e) => onError(e.message))
          }
        >
          Salvar
        </button>
      </section>

      <section className="panel" style={{ maxWidth: 560, marginTop: "1rem" }}>
        <h2>Backup SQLite</h2>
        <p className="muted">
          Cópias em <span className="mono">data/backups</span>. Agendado ligado por padrão (checa a cada
          15 min). Eventos aparecem na aba Saúde.
        </p>
        <label className="row" style={{ gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem" }}>
          <input
            type="checkbox"
            checked={settings.backupAutoEnabled}
            onChange={(e) => setSettings({ ...settings, backupAutoEnabled: e.target.checked })}
          />
          Backup automático
        </label>
        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label>Intervalo (horas)</label>
            <input
              type="number"
              min={1}
              max={168}
              value={settings.backupIntervalHours}
              onChange={(e) =>
                setSettings({ ...settings, backupIntervalHours: Number(e.target.value) || 24 })
              }
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Manter últimos</label>
            <input
              type="number"
              min={3}
              max={50}
              value={settings.backupKeep}
              onChange={(e) => setSettings({ ...settings, backupKeep: Number(e.target.value) || 20 })}
            />
          </div>
        </div>
        {schedule && (
          <p className="muted" style={{ marginTop: 0 }}>
            Último:{" "}
            {schedule.lastBackupAt
              ? new Date(schedule.lastBackupAt).toLocaleString("pt-BR")
              : "nenhum"}
            {schedule.enabled && schedule.nextDueAt
              ? ` · próximo: ${new Date(schedule.nextDueAt).toLocaleString("pt-BR")}`
              : ""}
          </p>
        )}
        <button
          className="btn"
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const res = await api<{ fileName: string }>("/api/admin/backup", { method: "POST" });
              onToast(`Backup ${res.fileName} criado`, "ok");
              await loadMeta();
            } catch (e) {
              onError(e instanceof Error ? e.message : "Falha no backup");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Gerando…" : "Criar backup agora"}
        </button>
        <table className="table" style={{ marginTop: "0.75rem" }}>
          <thead>
            <tr>
              <th>Arquivo</th>
              <th>Quando</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {backups.map((b) => (
              <tr key={b.fileName}>
                <td className="mono">{b.fileName}</td>
                <td>{new Date(b.createdAt).toLocaleString("pt-BR")}</td>
                <td>
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() =>
                      downloadBackup(b.fileName)
                        .then(() => onToast("Download iniciado", "ok"))
                        .catch((e) => onError(e.message))
                    }
                  >
                    Baixar
                  </button>
                </td>
              </tr>
            ))}
            {backups.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">
                  Nenhum backup ainda
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="panel" style={{ maxWidth: 560, marginTop: "1rem" }}>
        <h2>Pronto para loja (ops)</h2>
        <p className="muted">{readiness?.tunnelHint}</p>
        <ul className="feed">
          {(readiness?.checklist || []).map((c) => (
            <li key={c.id}>
              <span className={`tag ${c.ok ? "ouro" : "noface"}`}>{c.ok ? "ok" : "pendente"}</span>{" "}
              {c.label}
            </li>
          ))}
        </ul>
        {readiness && (
          <p className="muted">
            Face: {readiness.faceService ? "online" : "offline"} · Checkout: {readiness.portalCheckoutMode} ·
            MP: {readiness.mpConfigured ? "sim" : "não"} · Unidade: {readiness.unit.unitName} (
            {readiness.unit.unitId})
          </p>
        )}
        <button className="btn ghost" type="button" onClick={() => loadMeta()}>
          Atualizar checklist
        </button>
      </section>
    </div>
  );
}
