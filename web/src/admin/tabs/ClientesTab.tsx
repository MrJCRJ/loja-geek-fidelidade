import { useState, type FormEvent, type RefObject } from "react";
import { api, type Customer } from "../../api";
import { ClienteEnrollPanel, type AutoEnrollApi } from "./ClienteEnrollPanel";
import { ClienteManagePanel } from "./ClienteManagePanel";
import { ClientesListPanel, type CreateForm } from "./ClientesListPanel";

type Props = {
  customers: Customer[];
  selected: Customer | null;
  setSelected: (c: Customer | null) => void;
  videoRef: RefObject<HTMLVideoElement | null>;
  camLoading: boolean;
  camReady: boolean;
  enrollStep: number;
  setEnrollStep: (n: number) => void;
  enrollBusy: boolean;
  enrollMsg: string;
  setEnrollMsg: (s: string) => void;
  autoEnrollActive: boolean;
  setAutoEnrollActive: (v: boolean) => void;
  autoEnrollPaused: boolean;
  setAutoEnrollPaused: (v: boolean | ((p: boolean) => boolean)) => void;
  setAutoEnrollToken: (fn: (t: number) => number) => void;
  autoEnroll: AutoEnrollApi;
  startCam: () => void;
  stopCam: () => void;
  enrollFace: () => void;
  beginAutoEnroll: (c: Customer) => void;
  refresh: () => Promise<void>;
  loadTimeForCustomer: (id: string) => Promise<void>;
  pointsLedger: import("../types").PointsLedgerRow[];
  onError: (msg: string) => void;
  onToast: (msg: string, kind?: "ok" | "error" | "info") => void;
  askConfirm: (opts: {
    title: string;
    message: string;
    danger?: boolean;
    confirmLabel?: string;
  }) => Promise<boolean>;
};

export function ClientesTab(props: Props) {
  const {
    customers,
    selected,
    setSelected,
    videoRef,
    camLoading,
    camReady,
    enrollStep,
    setEnrollStep,
    enrollBusy,
    enrollMsg,
    setEnrollMsg,
    autoEnrollActive,
    setAutoEnrollActive,
    autoEnrollPaused,
    setAutoEnrollPaused,
    setAutoEnrollToken,
    autoEnroll,
    startCam,
    stopCam,
    enrollFace,
    beginAutoEnroll,
    refresh,
    loadTimeForCustomer,
    pointsLedger,
    onError,
    onToast,
    askConfirm,
  } = props;

  const [query, setQuery] = useState("");
  const [form, setForm] = useState<CreateForm>({
    name: "",
    phone: "",
    level: "bronze",
    notes: "",
    consent: true,
  });
  const [editForm, setEditForm] = useState({
    name: "",
    phone: "",
    level: "bronze" as Customer["level"],
    notes: "",
  });
  const [resetTokenMsg, setResetTokenMsg] = useState("");

  const createCustomer = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.consent) {
      onError("Marque o consentimento LGPD para cadastrar VIP com reconhecimento facial.");
      return;
    }
    try {
      const created = await api<Customer>("/api/customers", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm({ name: "", phone: "", level: "bronze", notes: "", consent: true });
      onToast(`VIP ${created.name} cadastrado`, "ok");
      await refresh();
      await beginAutoEnroll(created);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Falha ao cadastrar cliente");
    }
  };

  const selectCustomer = (c: Customer) => {
    setSelected(c);
    setEditForm({
      name: c.name,
      phone: c.phone || "",
      level: c.level,
      notes: c.notes || "",
    });
    setResetTokenMsg("");
    setEnrollStep(0);
    setEnrollMsg("");
    setAutoEnrollActive(false);
    autoEnroll.reset();
    loadTimeForCustomer(c.id).catch(() => undefined);
  };

  const exportLgpd = async () => {
    if (!selected) return;
    try {
      const data = await api<unknown>(`/api/customers/${selected.id}/export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lgpd-${selected.name.replace(/\s+/g, "-").toLowerCase()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      onToast("Exportação LGPD baixada", "ok");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Falha na exportação");
    }
  };

  return (
    <div className="grid-2" role="tabpanel" id="panel-clientes" aria-labelledby="tab-clientes">
      <ClientesListPanel
        customers={customers}
        query={query}
        onQueryChange={setQuery}
        form={form}
        onFormChange={setForm}
        onSubmit={createCustomer}
        onSelect={selectCustomer}
      />

      <section className="panel">
        <h2>Enroll facial</h2>
        {!selected && <p className="muted">Selecione um cliente na lista.</p>}
        {selected && (
          <>
            <ClienteEnrollPanel
              selected={selected}
              videoRef={videoRef}
              camLoading={camLoading}
              camReady={camReady}
              enrollStep={enrollStep}
              setEnrollStep={setEnrollStep}
              enrollBusy={enrollBusy}
              enrollMsg={enrollMsg}
              setEnrollMsg={setEnrollMsg}
              autoEnrollActive={autoEnrollActive}
              setAutoEnrollActive={setAutoEnrollActive}
              autoEnrollPaused={autoEnrollPaused}
              setAutoEnrollPaused={setAutoEnrollPaused}
              setAutoEnrollToken={setAutoEnrollToken}
              autoEnroll={autoEnroll}
              startCam={startCam}
              stopCam={stopCam}
              enrollFace={enrollFace}
              setSelected={setSelected}
              refresh={refresh}
              onError={onError}
              onToast={onToast}
              askConfirm={askConfirm}
            />
            <ClienteManagePanel
              selected={selected}
              editForm={editForm}
              onEditFormChange={setEditForm}
              resetTokenMsg={resetTokenMsg}
              onResetTokenMsgChange={setResetTokenMsg}
              pointsLedger={pointsLedger}
              setSelected={setSelected}
              setEnrollStep={setEnrollStep}
              refresh={refresh}
              loadTimeForCustomer={loadTimeForCustomer}
              onError={onError}
              onToast={onToast}
              askConfirm={askConfirm}
              onExportLgpd={exportLgpd}
            />
          </>
        )}
      </section>
    </div>
  );
}
