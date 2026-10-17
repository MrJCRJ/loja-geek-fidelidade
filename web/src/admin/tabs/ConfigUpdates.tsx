import { api } from "../../api";
import type { Dispatch, SetStateAction } from "react";

export type Readiness = {
  faceService?: boolean;
  secretsOk: boolean;
  strictSecrets: boolean;
  portalCheckoutMode: string;
  mpConfigured: boolean;
  tunnelHint: string;
  checklist: Array<{ id: string; ok: boolean; label: string }>;
  unit: { unitName: string; unitId: string };
  tunnel?: {
    running: boolean;
    mode: string;
    autoStart: boolean;
    publicUrl: string;
    publicHealthy: boolean;
    binaryFound: boolean;
  };
};

export type CentralUpdate = {
  ok: boolean;
  error?: string;
  updateAvailable?: boolean;
  currentVersion?: string;
  latestVersion?: string;
  hasGithub?: boolean;
  source?: string;
};

export type LockStationRow = {
  id: string;
  name: string;
  online: boolean;
  version: string;
  status: "current" | "outdated" | "unknown" | "offline_outdated" | "offline_unknown";
};

export type LockUpdate = {
  ok: boolean;
  error?: string;
  latestVersion?: string;
  hasGithub?: boolean;
  source?: string;
  packageReady?: boolean;
  stations?: LockStationRow[];
  outdatedCount?: number;
  offlineOutdated?: string[];
};

type Props = {
  readiness: Readiness | null;
  centralUpd: CentralUpdate | null;
  setCentralUpd: Dispatch<SetStateAction<CentralUpdate | null>>;
  lockUpd: LockUpdate | null;
  setLockUpd: Dispatch<SetStateAction<LockUpdate | null>>;
  updBusy: boolean;
  setUpdBusy: (v: boolean) => void;
  onError: (msg: string) => void;
  onToast: (msg: string, kind?: "ok" | "error" | "info") => void;
  askConfirm?: (opts: {
    title: string;
    message: string;
    danger?: boolean;
    confirmLabel?: string;
  }) => Promise<boolean>;
  loadMeta: () => void;
};

export function ConfigUpdates({
  readiness,
  centralUpd,
  setCentralUpd,
  lockUpd,
  setLockUpd,
  updBusy,
  setUpdBusy,
  onError,
  onToast,
  askConfirm,
  loadMeta,
}: Props) {
  return (
    <>
      <section className="panel" style={{ maxWidth: 560, marginTop: "1rem" }}>
        <h2>Atualizar Central</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Versão neste PC: <span className="mono">{centralUpd?.currentVersion || "—"}</span>
          {centralUpd?.latestVersion ? (
            <>
              {" "}
              · GitHub: <span className="mono">{centralUpd.latestVersion}</span>
              {centralUpd.updateAvailable ? " (nova)" : ""}
            </>
          ) : null}
        </p>
        <p className="muted">
          GitHub neste PC:{" "}
          {centralUpd?.hasGithub
            ? `ok (${centralUpd.source === "gh" ? "gh já logado" : centralUpd.source || "token"})`
            : "não autenticado"}
        </p>
        {centralUpd?.error && <p className="muted">{centralUpd.error}</p>}
        <div className="row">
          <button
            className="btn ghost"
            type="button"
            disabled={updBusy}
            onClick={async () => {
              setUpdBusy(true);
              try {
                setCentralUpd(await api<CentralUpdate>("/api/admin/central-update"));
                onToast("Verificado no GitHub", "ok");
              } catch (e) {
                onError(e instanceof Error ? e.message : "Falha ao verificar");
              } finally {
                setUpdBusy(false);
              }
            }}
          >
            Verificar
          </button>
          <button
            className="btn"
            type="button"
            disabled={updBusy || !centralUpd?.updateAvailable}
            onClick={async () => {
              const ok = askConfirm
                ? await askConfirm({
                    title: "Atualizar o Central?",
                    message:
                      "A loja fica 1–2 minutos sem API. Os PCs mostram Central offline e voltam sozinhos. Só faça com a loja vazia.",
                    danger: true,
                    confirmLabel: "Atualizar agora",
                  })
                : true;
              if (!ok) return;
              setUpdBusy(true);
              try {
                await api("/api/admin/central-update/apply", { method: "POST", body: "{}" });
                onToast("Central vai reiniciar. Abra de novo em 2 minutos.", "info");
              } catch (e) {
                onError(e instanceof Error ? e.message : "Falha ao pedir update");
              } finally {
                setUpdBusy(false);
              }
            }}
          >
            {updBusy ? "…" : "Baixar e instalar"}
          </button>
        </div>
      </section>

      <section className="panel" style={{ maxWidth: 560, marginTop: "1rem" }}>
        <h2>Atualizar GeekLock</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Pacote: <span className="mono">{lockUpd?.latestVersion || "—"}</span>
          {lockUpd?.packageReady ? " · pronto na nuvem" : " · sem pacote"}
          {lockUpd?.outdatedCount ? ` · ${lockUpd.outdatedCount} desatualizado(s)` : ""}
        </p>
        <p className="muted">
          Só o dono. PCs online baixam agora; os desligados na próxima ligação. Pareamento preservado.
        </p>
        {lockUpd?.offlineOutdated && lockUpd.offlineOutdated.length > 0 && (
          <p className="muted">
            Desligados (atualizam sozinhos ao ligar): {lockUpd.offlineOutdated.join(", ")}
          </p>
        )}
        {lockUpd?.error && <p className="muted">{lockUpd.error}</p>}
        <ul className="feed">
          {(lockUpd?.stations || []).map((s) => (
            <li key={s.id}>
              <span
                className={`tag ${s.status === "current" ? "ouro" : s.online ? "noface" : "noface"}`}
              >
                {s.status === "current"
                  ? "ok"
                  : s.status === "outdated"
                    ? "desatualizado"
                    : s.status === "offline_outdated"
                      ? "desligado"
                      : "sem versão"}
              </span>{" "}
              {s.name} <span className="mono">{s.version || "—"}</span>
            </li>
          ))}
        </ul>
        <div className="row">
          <button
            className="btn ghost"
            type="button"
            disabled={updBusy}
            onClick={async () => {
              setUpdBusy(true);
              try {
                setLockUpd(await api<LockUpdate>("/api/admin/lock-update"));
                onToast("Locks verificados", "ok");
              } catch (e) {
                onError(e instanceof Error ? e.message : "Falha ao verificar Locks");
              } finally {
                setUpdBusy(false);
              }
            }}
          >
            Verificar
          </button>
          <button
            className="btn"
            type="button"
            disabled={updBusy || !lockUpd?.ok}
            onClick={async () => {
              const ok = askConfirm
                ? await askConfirm({
                    title: "Atualizar os GeekLocks?",
                    message:
                      "Os PCs ligados baixam agora. Os desligados atualizam sozinhos na próxima vez que ligarem. Preserva o pareamento.",
                    confirmLabel: "Atualizar Locks",
                  })
                : true;
              if (!ok) return;
              setUpdBusy(true);
              try {
                const r = await api<{ sent: string[]; waitingOffline: string[]; latestVersion?: string }>(
                  "/api/admin/lock-update/apply",
                  { method: "POST", body: "{}" },
                );
                onToast(
                  r.sent?.length
                    ? `Atualizando: ${r.sent.join(", ")}`
                    : "Nenhum PC ligado. Os desligados pegam ao ligar.",
                  "info",
                );
                setLockUpd(await api<LockUpdate>("/api/admin/lock-update"));
              } catch (e) {
                onError(e instanceof Error ? e.message : "Falha ao atualizar Locks");
              } finally {
                setUpdBusy(false);
              }
            }}
          >
            {updBusy ? "…" : "Atualizar Locks"}
          </button>
        </div>
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
    </>
  );
}
