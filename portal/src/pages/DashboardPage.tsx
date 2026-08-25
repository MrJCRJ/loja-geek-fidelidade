import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  api,
  Catalog,
  formatHours,
  PortalCustomer,
  setToken,
  TimeLedgerEntry,
  WebOrder,
} from "../api";
import BrandHeader from "../components/BrandHeader";
import OfflineBanner from "../components/OfflineBanner";
import GoogleReviewCta from "../components/GoogleReviewCta";
import { useProximityField } from "../hooks/useProximityField";
import { useReveal } from "../hooks/useReveal";

type PixInfo = {
  paymentId: string;
  qrCode?: string;
  qrCodeBase64?: string;
  ticketUrl?: string;
  status: string;
};

const WA_LAN = "https://wa.me/5575988603747";
const LOW_BALANCE_SECONDS = 15 * 60;

export default function DashboardPage() {
  const nav = useNavigate();
  const rootRef = useReveal();
  useProximityField(rootRef);
  const [me, setMe] = useState<PortalCustomer | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [orders, setOrders] = useState<WebOrder[]>([]);
  const [timeLedger, setTimeLedger] = useState<TimeLedgerEntry[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [pix, setPix] = useState<{
    orderId: string;
    info: PixInfo;
    label: string;
    checkoutUrl?: string | null;
    demo?: boolean;
  } | null>(null);
  const [showReview, setShowReview] = useState(false);

  const load = useCallback(async () => {
    const [profile, cat, ord, ledger] = await Promise.all([
      api<PortalCustomer>("/api/portal/me"),
      api<Catalog>("/api/portal/catalog"),
      api<{ orders: WebOrder[] }>("/api/portal/orders").catch(() => ({ orders: [] as WebOrder[] })),
      api<{ ledger: TimeLedgerEntry[] }>("/api/portal/me/time-ledger").catch(() => ({
        ledger: [] as TimeLedgerEntry[],
      })),
    ]);
    setMe(profile);
    setCatalog(cat);
    setOrders(ord.orders);
    setTimeLedger(ledger.ledger);
  }, []);

  useEffect(() => {
    load().catch((err) => {
      setError(err instanceof Error ? err.message : "Erro ao carregar");
      if (String(err).includes("401") || String(err).toLowerCase().includes("token")) {
        setToken(null);
        nav("/login");
      }
    });
  }, [load, nav]);

  useEffect(() => {
    if (!pix) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await api<{
          order: WebOrder;
          customer: PortalCustomer;
          demo?: boolean;
          credited?: boolean;
        }>(`/api/portal/orders/${pix.orderId}`);
        if (cancelled) return;
        if (res.order.status === "demo_ok" || (res.demo && res.order.status !== "pending")) {
          setMsg("Pagamento de teste confirmado — saldo não alterado.");
          setPix(null);
          load().catch(() => undefined);
        } else if (res.order.status === "paid" && res.credited !== false) {
          setMe(res.customer);
          setMsg(`${pix.label} confirmado — crédito liberado.`);
          setPix(null);
          setShowReview(true);
          load().catch(() => undefined);
        } else if (res.order.status === "failed") {
          setError("Pagamento não concluído. Tente de novo.");
          setPix(null);
        }
      } catch {
        /* ignore poll errors */
      }
    };
    poll();
    const id = window.setInterval(poll, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [pix, load]);

  async function buyHours(amountReais: number) {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const res = await api<{
        customer: PortalCustomer;
        creditedSeconds?: number;
        order?: { id?: string; hours?: number | null };
        stub?: boolean;
        demo?: boolean;
        pix?: PixInfo | null;
        checkoutUrl?: string | null;
      }>("/api/portal/checkout/hours", {
        method: "POST",
        body: JSON.stringify({ amountReais }),
      });
      if (res.pix && res.order?.id && !res.stub) {
        setPix({
          orderId: res.order.id,
          info: res.pix,
          label: `Compra de R$ ${amountReais}`,
          checkoutUrl: res.checkoutUrl,
          demo: res.demo,
        });
        setMsg(
          res.demo
            ? "Demonstração — pague no Pix ou abra o checkout Mercado Pago (sem crédito de horas)."
            : "Pague o Pix abaixo ou abra o checkout Mercado Pago — o crédito cai automaticamente.",
        );
      } else if (res.stub) {
        setMe(res.customer);
        const hours =
          res.order?.hours ??
          Math.round(((res.creditedSeconds || 0) / 3600) * 100) / 100;
        setMsg(`Crédito de ${hours}h adicionado.`);
        setShowReview(true);
        load().catch(() => undefined);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na compra");
    } finally {
      setBusy(false);
    }
  }

  async function buySub(months: number) {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const res = await api<{
        customer: PortalCustomer;
        stub?: boolean;
        demo?: boolean;
        order?: { id?: string };
        pix?: PixInfo | null;
        checkoutUrl?: string | null;
      }>("/api/portal/checkout/subscription", {
        method: "POST",
        body: JSON.stringify({ months }),
      });
      if (res.pix && res.order?.id && !res.stub) {
        setPix({
          orderId: res.order.id,
          info: res.pix,
          label: `Assinatura ${months} mês(es)`,
          checkoutUrl: res.checkoutUrl,
          demo: res.demo,
        });
        setMsg(
          res.demo
            ? "Demonstração — Pix ou checkout Mercado Pago (assinatura não ativa de verdade)."
            : "Pague o Pix ou abra o checkout — ativa após confirmação.",
        );
      } else if (res.stub) {
        setMe(res.customer);
        setMsg(`Assinatura ativada por ${months} mês(es).`);
        setShowReview(true);
        load().catch(() => undefined);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na assinatura");
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    setToken(null);
    nav("/");
  }

  if (!me) {
    return (
      <div className="shell shell--ambient page-in" ref={rootRef}>
        <OfflineBanner />
        <BrandHeader size="sm" />
        {error ? (
          <p className="muted">{error}</p>
        ) : (
          <>
            <div className="skeleton skeleton--title" />
            <div className="skeleton skeleton--line" />
            <div className="skeleton skeleton--block" />
            <div className="skeleton skeleton--line" />
            <div className="skeleton skeleton--line" style={{ width: "60%" }} />
          </>
        )}
      </div>
    );
  }

  const packs = catalog?.hourPacks || [
    { amountReais: 10, label: "R$ 10" },
    { amountReais: 20, label: "R$ 20" },
    { amountReais: 50, label: "R$ 50" },
  ];
  const checkoutEnabled = catalog?.checkoutEnabled === true;
  const checkoutDemo = catalog?.demo === true;
  const pixMode = catalog?.payments?.pixEnabled;
  const lowBalance = me.timeBalanceSeconds > 0 && me.timeBalanceSeconds < LOW_BALANCE_SECONDS;

  return (
    <div className="shell shell--ambient page-in" ref={rootRef}>
      <OfflineBanner />
      <div className="page-top">
        <BrandHeader size="sm" />
        <button type="button" className="btn ghost prox" onClick={logout}>
          Sair
        </button>
      </div>
      <p className="greeting">
        Olá, <strong>{me.name.split(" ")[0]}</strong>
      </p>

      <div className="nav page-in-cta" style={{ marginTop: 0 }}>
        <Link className="btn ghost prox" to="/account">
          Editar conta
        </Link>
        <Link className="btn ghost prox" to="/enroll">
          {me.faceSamples > 0 ? "Cadastro facial" : "Cadastrar rosto"}
        </Link>
      </div>

      {error ? <div className="banner">{error}</div> : null}
      {msg ? <div className="banner ok">{msg}</div> : null}
      {showReview ? <GoogleReviewCta onDismiss={() => setShowReview(false)} /> : null}

      {lowBalance ? (
        <div className="banner warn reveal">
          Saldo baixo ({formatHours(me.timeBalanceSeconds)}). Recarregue ou fale no WhatsApp.
          <div className="row" style={{ marginTop: "0.5rem" }}>
            <a className="btn prox" href={WA_LAN} target="_blank" rel="noreferrer">
              WhatsApp
            </a>
          </div>
        </div>
      ) : null}

      {me.faceSamples === 0 ? (
        <div className="face-cta reveal">
          <p>Sem cadastro facial o GeekLock não libera o PC.</p>
          <Link className="btn prox" to="/enroll">
            Cadastrar rosto
          </Link>
        </div>
      ) : null}

      {checkoutDemo ? (
        <div className="banner warn">
          <strong>Demonstração</strong> — pagamento de teste via Mercado Pago. Nenhuma hora ou assinatura
          é creditada de verdade.
        </div>
      ) : null}

      {pix ? (
        <div className="card card--highlight reveal">
          <h2>
            {pix.demo ? "Demo — " : ""}
            {pix.label}
          </h2>
          <p className="muted" style={{ marginTop: 0 }}>
            {pix.demo
              ? "Escaneie o QR, abra o Pix ou use o checkout Mercado Pago. Saldo não muda."
              : "Escaneie o QR, abra o Pix ou o checkout Mercado Pago. Esta tela atualiza sozinha."}
          </p>
          {pix.info.qrCodeBase64 ? (
            <img
              className="pix-qr"
              src={`data:image/png;base64,${pix.info.qrCodeBase64}`}
              alt="QR Code Pix"
            />
          ) : null}
          {pix.info.qrCode ? (
            <p className="pix-code muted">{pix.info.qrCode}</p>
          ) : null}
          <div className="row">
            {pix.info.ticketUrl ? (
              <a className="btn prox" href={pix.info.ticketUrl} target="_blank" rel="noreferrer">
                Abrir Pix
              </a>
            ) : null}
            {pix.checkoutUrl ? (
              <a className="btn accent2 prox" href={pix.checkoutUrl} target="_blank" rel="noreferrer">
                Checkout Mercado Pago
              </a>
            ) : null}
            <button type="button" className="btn ghost prox" onClick={() => setPix(null)}>
              Fechar
            </button>
          </div>
        </div>
      ) : null}

      <div className="balance-panel reveal">
        <p className="section-label">Saldo</p>
        <p className="stat">{formatHours(me.timeBalanceSeconds)}</p>
        <p className="muted">
          Tarifa: R$ {me.hourPrice.toFixed(2)}/h
          {me.isSubscriber ? ` (−${me.subscriberDiscountPct}% assinante)` : ""}
        </p>
        <p className="muted">
          Face: {me.faceSamples}/{me.maxFaceSamples} amostras
        </p>
        <p className="muted">
          Assinatura:{" "}
          {me.isSubscriber
            ? `ativa até ${me.subscriptionExpiresAt ? new Date(me.subscriptionExpiresAt).toLocaleDateString("pt-BR") : "—"}`
            : "inativa"}
        </p>
      </div>

      <div className="packs-list reveal">
        <p className="section-label">Recarga</p>
        <h2>Comprar horas</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          {checkoutEnabled
            ? checkoutDemo
              ? "Modo demonstração — Pix e checkout Mercado Pago (sem crédito)."
              : pixMode
                ? "Pagamento via Pix ou checkout Mercado Pago."
                : "Crédito imediato (modo demo interno — configure MP_ACCESS_TOKEN na loja)."
            : "Em breve — recarregue na lan ou WhatsApp."}
        </p>
        {!checkoutEnabled ? (
          <div className="row" style={{ marginBottom: "0.75rem" }}>
            <a className="btn accent2 prox" href={WA_LAN} target="_blank" rel="noreferrer">
              WhatsApp lan
            </a>
          </div>
        ) : null}
        {packs.map((p) => (
          <div className="pack prox" key={p.amountReais}>
            <div>
              <strong>{p.label}</strong>
              <div className="muted">~{(p.amountReais / me.hourPrice).toFixed(1)}h na tarifa atual</div>
            </div>
            <button
              className={`btn prox${busy && checkoutEnabled ? " loading" : ""}`}
              type="button"
              disabled={!checkoutEnabled || busy}
              onClick={() => {
                if (!checkoutEnabled) return;
                buyHours(p.amountReais);
              }}
            >
              {!checkoutEnabled ? "Em breve" : busy ? "…" : checkoutDemo || pixMode ? "Pagar" : "Comprar"}
            </button>
          </div>
        ))}
      </div>

      <div className="card reveal">
        <p className="section-label">Plano</p>
        <h2>Assinatura</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          {checkoutEnabled
            ? checkoutDemo
              ? "Demonstração — assinatura via Mercado Pago (sem ativar de verdade)."
              : `−${me.subscriberDiscountPct}% nas horas · R$ ${(catalog?.subscriptionMonthlyPrice ?? 49.9).toFixed(2)}/mês`
            : "Em breve — assine no balcão ou WhatsApp."}
        </p>
        <div className="row">
          <button
            className={`btn accent2 prox${busy && checkoutEnabled ? " loading" : ""}`}
            type="button"
            disabled={!checkoutEnabled || busy}
            onClick={() => {
              if (!checkoutEnabled) return;
              buySub(1);
            }}
          >
            {!checkoutEnabled ? "Em breve" : busy ? "…" : "Assinar 1 mês"}
          </button>
          <button
            className="btn ghost prox"
            type="button"
            disabled={!checkoutEnabled || busy}
            onClick={() => {
              if (!checkoutEnabled) return;
              buySub(3);
            }}
          >
            {!checkoutEnabled ? "Em breve" : "3 meses"}
          </button>
        </div>
      </div>

      {orders.length > 0 ? (
        <div className="card reveal">
          <p className="section-label">Extrato</p>
          <h2>Compras no portal</h2>
          {orders.slice(0, 12).map((o) => (
            <div className="pack" key={o.id}>
              <div>
                <strong>
                  {o.kind === "hours" ? "Horas" : "Assinatura"} · R$ {Number(o.amountReais).toFixed(2)}
                </strong>
                <div className="muted">
                  {new Date(o.createdAt).toLocaleString("pt-BR")} · {o.status}
                  {o.demo ? " · demo" : ""}
                  {o.hours ? ` · ${o.hours}h` : ""}
                  {o.months ? ` · ${o.months} mês(es)` : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {timeLedger.length > 0 ? (
        <div className="card reveal">
          <p className="section-label">Lan</p>
          <h2>Consumo na lan</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Movimentações de horas (compra, sessão, ajuste no balcão).
          </p>
          {timeLedger.slice(0, 15).map((e) => {
            const secs = Number(e.deltaSeconds) || 0;
            const sign = secs >= 0 ? "+" : "−";
            return (
              <div className="pack" key={e.id}>
                <div>
                  <strong>
                    {sign}
                    {formatHours(Math.abs(secs))}
                  </strong>
                  <div className="muted">
                    {e.reason || "ajuste"} · {new Date(e.createdAt).toLocaleString("pt-BR")}
                    {e.amountReais ? ` · R$ ${Number(e.amountReais).toFixed(2)}` : ""}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
