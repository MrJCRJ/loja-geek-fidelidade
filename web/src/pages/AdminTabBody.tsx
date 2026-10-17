import type { Customer } from "../api";
import { useAdminData } from "../admin/hooks/useAdminData";
import { useAdminEnrollCamera } from "../admin/hooks/useAdminEnrollCamera";
import { CaixaTab } from "../admin/tabs/CaixaTab";
import { CaixaCurta } from "../admin/tabs/CaixaCurta";
import { ClientesContas } from "../admin/tabs/ClientesContas";
import { ClientesTab } from "../admin/tabs/ClientesTab";
import { AjudaTab } from "../admin/tabs/AjudaTab";
import { EquipeTab } from "../admin/tabs/EquipeTab";
import { ConfigTab } from "../admin/tabs/ConfigTab";
import { DashboardTab } from "../admin/tabs/DashboardTab";
import { ConsolesPanel } from "../admin/tabs/ConsolesPanel";
import { EstacoesTab } from "../admin/tabs/EstacoesTab";
import { FeedTab } from "../admin/tabs/FeedTab";
import { RecompensasTab } from "../admin/tabs/RecompensasTab";
import { SaudeTab } from "../admin/tabs/SaudeTab";
import { SessoesTab } from "../admin/tabs/SessoesTab";
import { UsoTab } from "../admin/tabs/UsoTab";
import type { LiveFeedItem, Tab } from "../admin/types";

type ConfirmOpts = {
  title: string;
  message: string;
  danger?: boolean;
  confirmLabel?: string;
};

type Props = {
  tab: Tab;
  clerk: boolean;
  data: ReturnType<typeof useAdminData>;
  live: LiveFeedItem[];
  selected: Customer | null;
  setSelected: (c: Customer | null) => void;
  enroll: ReturnType<typeof useAdminEnrollCamera>;
  remoteReadOnly: boolean;
  consoleAddId: string | null;
  setConsoleAddId: (id: string | null) => void;
  setError: (msg: string) => void;
  onToast: (msg: string, kind?: "ok" | "error" | "info") => void;
  askConfirm: (opts: ConfirmOpts) => Promise<boolean>;
};

export function AdminTabBody({
  tab,
  clerk,
  data,
  live,
  selected,
  setSelected,
  enroll,
  remoteReadOnly,
  consoleAddId,
  setConsoleAddId,
  setError,
  onToast,
  askConfirm,
}: Props) {
  const toast = { push: onToast };
  return (
    <>
      {tab === "dashboard" && <DashboardTab onError={setError} team={clerk} />}
      {tab === "feed" && !clerk && <FeedTab live={live} events={data.events} />}
      {tab === "clientes" && (
        <ClientesContas
          customers={data.customers}
          refresh={data.refreshNow}
          onError={setError}
          onToast={toast.push}
          askConfirm={askConfirm}
          remoteReadOnly={remoteReadOnly}
        />
      )}
      {tab === "clientes" && !clerk && (
        <ClientesTab
          customers={data.customers}
          selected={selected}
          setSelected={setSelected}
          videoRef={enroll.videoRef}
          camLoading={enroll.camLoading}
          camReady={enroll.camReady}
          enrollStep={enroll.enrollStep}
          setEnrollStep={enroll.setEnrollStep}
          enrollBusy={enroll.enrollBusy}
          enrollMsg={enroll.enrollMsg}
          setEnrollMsg={enroll.setEnrollMsg}
          autoEnrollActive={enroll.autoEnrollActive}
          setAutoEnrollActive={enroll.setAutoEnrollActive}
          autoEnrollPaused={enroll.autoEnrollPaused}
          setAutoEnrollPaused={enroll.setAutoEnrollPaused}
          setAutoEnrollToken={enroll.setAutoEnrollToken}
          autoEnroll={enroll.autoEnroll}
          startCam={enroll.startCam}
          stopCam={enroll.stopCam}
          enrollFace={enroll.enrollFace}
          beginAutoEnroll={enroll.beginAutoEnroll}
          refresh={data.refreshNow}
          loadTimeForCustomer={data.loadTimeForCustomer}
          pointsLedger={data.pointsLedger}
          onError={setError}
          onToast={toast.push}
          askConfirm={askConfirm}
        />
      )}
      {tab === "caixa" && clerk && (
        <CaixaCurta
          customers={data.customers}
          settings={data.settings}
          refresh={data.refreshNow}
          onError={setError}
          onToast={toast.push}
          askConfirm={askConfirm}
          remoteReadOnly={remoteReadOnly}
        />
      )}
      {tab === "caixa" && !clerk && (
        <CaixaTab
          customers={data.customers}
          selected={selected}
          setSelected={setSelected}
          settings={data.settings}
          timeLedger={data.timeLedger}
          refresh={data.refreshNow}
          loadTimeForCustomer={data.loadTimeForCustomer}
          onError={setError}
          onToast={toast.push}
          askConfirm={askConfirm}
          remoteReadOnly={remoteReadOnly}
        />
      )}
      {tab === "consoles" && (
        <div role="tabpanel" id="panel-consoles" aria-labelledby="tab-consoles">
          <ConsolesPanel
            customers={data.customers}
            settings={data.settings}
            remoteReadOnly={remoteReadOnly}
            onError={setError}
            onToast={toast.push}
            askConfirm={askConfirm}
            focusAddId={consoleAddId}
            onFocusConsumed={() => setConsoleAddId(null)}
          />
        </div>
      )}
      {tab === "estacoes" && (
        <EstacoesTab
          stations={data.stations}
          customers={data.customers}
          connected={data.connected}
          liveStatus={data.liveStatus}
          openRequests={data.openRequests}
          settings={data.settings}
          refresh={data.refreshNow}
          onError={setError}
          onToast={toast.push}
          askConfirm={askConfirm}
          remoteReadOnly={remoteReadOnly}
          compact={clerk}
        />
      )}
      {tab === "uso" && !clerk && (
        <UsoTab
          stationNames={Object.fromEntries(data.stations.map((s) => [s.id, s.name]))}
          onError={setError}
          onToast={toast.push}
        />
      )}
      {tab === "sessoes" && !clerk && <SessoesTab sessions={data.sessions} sessionStats={data.sessionStats} />}
      {tab === "recompensas" && !clerk && (
        <RecompensasTab
          rewards={data.rewards}
          refresh={data.refreshNow}
          onError={setError}
          onToast={toast.push}
          askConfirm={askConfirm}
        />
      )}
      {tab === "saude" && !clerk && <SaudeTab onError={setError} />}
      {tab === "ajuda" && !clerk && <AjudaTab clerk={false} />}
      {tab === "equipe" && !clerk && (
        <EquipeTab remoteReadOnly={remoteReadOnly} onError={setError} onToast={toast.push} />
      )}
      {tab === "config" && !clerk && (
        <ConfigTab
          settings={data.settings}
          setSettings={data.setSettings}
          onError={setError}
          onToast={toast.push}
          askConfirm={askConfirm}
        />
      )}
    </>
  );
}
