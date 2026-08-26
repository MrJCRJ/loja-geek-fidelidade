import { useMemo, useState } from "react";
import { Catalog, PortalCustomer } from "../api";
import { DEFAULT_HOUR_PACKS, WA_LAN } from "./types";

type Pack = { amountReais: number; label: string };
type BuyMode = "hours" | "reais";
type BuyInput = { amountReais?: number; hours?: number };

const MIN_REAIS = 5;
const MAX_REAIS = 500;
const MIN_HOURS = 0.5;
const MAX_HOURS = 20;

type Props = {
  me: PortalCustomer;
  catalog: Catalog | null;
  checkoutEnabled: boolean;
  checkoutDemo: boolean;
  pixMode: boolean | undefined;
  busy: boolean;
  onBuyHours: (input: BuyInput) => void;
  onBuySub: (months: number) => void;
};

function roundHours(h: number) {
  return Math.round(h * 10) / 10;
}

function roundReais(r: number) {
  return Math.round(r * 100) / 100;
}

function parseNum(raw: string): number | null {
  const n = Number(String(raw).replace(",", ".").trim());
  return Number.isFinite(n) ? n : null;
}

export function DashboardCheckoutSection({
  me,
  catalog,
  checkoutEnabled,
  checkoutDemo,
  pixMode,
  busy,
  onBuyHours,
  onBuySub,
}: Props) {
  const packs: Pack[] = catalog?.hourPacks || DEFAULT_HOUR_PACKS;
  const subPrice = catalog?.subscriptionMonthlyPrice ?? 49.9;
  const price = me.hourPrice > 0 ? me.hourPrice : 10;

  const [mode, setMode] = useState<BuyMode>("hours");
  const [hoursStr, setHoursStr] = useState("1");
  const [reaisStr, setReaisStr] = useState(() => String(roundReais(1 * price)));
  const [confirm, setConfirm] = useState<{ hours: number; amountReais: number } | null>(null);

  const derived = useMemo(() => {
    if (mode === "hours") {
      const hours = parseNum(hoursStr);
      if (hours == null || hours <= 0) return { hours: null as number | null, amountReais: null as number | null };
      return { hours: roundHours(hours), amountReais: roundReais(hours * price) };
    }
    const amountReais = parseNum(reaisStr);
    if (amountReais == null || amountReais <= 0) return { hours: null as number | null, amountReais: null as number | null };
    return { hours: roundHours(amountReais / price), amountReais: roundReais(amountReais) };
  }, [mode, hoursStr, reaisStr, price]);

  const limitError = useMemo(() => {
    if (derived.hours == null || derived.amountReais == null) return "";
    if (derived.amountReais < MIN_REAIS) return `Mínimo R$ ${MIN_REAIS.toFixed(2)}.`;
    if (derived.amountReais > MAX_REAIS) return `Máximo R$ ${MAX_REAIS.toFixed(2)}.`;
    if (derived.hours < MIN_HOURS) return `Mínimo ${MIN_HOURS} h.`;
    if (derived.hours > MAX_HOURS) return `Máximo ${MAX_HOURS} h.`;
    return "";
  }, [derived]);

  function applyReais(r: number) {
    const amount = roundReais(r);
    setMode("reais");
    setReaisStr(String(amount));
    setHoursStr(String(roundHours(amount / price)));
  }

  function requestPay() {
    if (!checkoutEnabled || busy || !derived.hours || !derived.amountReais || limitError) return;
    setConfirm({ hours: derived.hours, amountReais: derived.amountReais });
  }

  const payLabel = !checkoutEnabled
    ? "Em breve"
    : busy
      ? "…"
      : checkoutDemo || pixMode
        ? "Pagar"
        : "Comprar";

  return (
    <>
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
        <p className="muted" style={{ marginTop: "-0.35rem", fontSize: "0.85rem" }}>
          Tarifa atual: R$ {price.toFixed(2)}/h
          {me.isSubscriber ? ` (−${me.subscriberDiscountPct}% assinante)` : ""}
        </p>
        {!checkoutEnabled ? (
          <div className="row" style={{ marginBottom: "0.75rem" }}>
            <a className="btn accent2 prox" href={WA_LAN} target="_blank" rel="noreferrer">
              WhatsApp lan
            </a>
          </div>
        ) : null}

        <div className="buy-mode" role="group" aria-label="Modo de compra">
          <button
            type="button"
            className={`buy-mode__btn${mode === "hours" ? " is-active" : ""}`}
            disabled={!checkoutEnabled || busy}
            onClick={() => {
              setMode("hours");
              const h = parseNum(hoursStr) ?? 1;
              setReaisStr(String(roundReais(h * price)));
            }}
          >
            Por horas
          </button>
          <button
            type="button"
            className={`buy-mode__btn${mode === "reais" ? " is-active" : ""}`}
            disabled={!checkoutEnabled || busy}
            onClick={() => {
              setMode("reais");
              const r = parseNum(reaisStr) ?? roundReais(price);
              setHoursStr(String(roundHours(r / price)));
            }}
          >
            Por valor (R$)
          </button>
        </div>

        <div className="buy-fields">
          <label className="buy-field">
            <span>Horas</span>
            <input
              type="number"
              inputMode="decimal"
              min={MIN_HOURS}
              max={MAX_HOURS}
              step={0.1}
              value={hoursStr}
              disabled={!checkoutEnabled || busy}
              onChange={(e) => {
                const v = e.target.value;
                setHoursStr(v);
                setMode("hours");
                const h = parseNum(v);
                if (h != null && h > 0) setReaisStr(String(roundReais(h * price)));
              }}
            />
          </label>
          <span className="buy-fields__eq" aria-hidden>
            ≈
          </span>
          <label className="buy-field">
            <span>Reais (R$)</span>
            <input
              type="number"
              inputMode="decimal"
              min={MIN_REAIS}
              max={MAX_REAIS}
              step={0.01}
              value={reaisStr}
              disabled={!checkoutEnabled || busy}
              onChange={(e) => {
                const v = e.target.value;
                setReaisStr(v);
                setMode("reais");
                const r = parseNum(v);
                if (r != null && r > 0) setHoursStr(String(roundHours(r / price)));
              }}
            />
          </label>
        </div>

        {limitError ? <p className="field-error">{limitError}</p> : null}
        {derived.hours != null && derived.amountReais != null && !limitError ? (
          <p className="muted" style={{ fontSize: "0.85rem", marginTop: 0 }}>
            {derived.hours.toFixed(1)} h → R$ {derived.amountReais.toFixed(2)} (arredondamento: 1 casa em
            horas, 2 em reais)
          </p>
        ) : null}

        <p className="muted" style={{ fontSize: "0.8rem", marginBottom: "0.35rem" }}>
          Atalhos
        </p>
        {packs.map((p) => {
          const packHours = roundHours(p.amountReais / price);
          return (
            <div className="pack prox" key={p.amountReais}>
              <div>
                <strong>{p.label}</strong>
                <div className="muted">
                  ~{packHours.toFixed(1)}h · R$ {p.amountReais.toFixed(2)} · tarifa R$ {price.toFixed(2)}/h
                  {me.isSubscriber ? " (assinante)" : ""}
                </div>
              </div>
              <button
                className="btn ghost prox"
                type="button"
                disabled={!checkoutEnabled || busy}
                onClick={() => {
                  if (!checkoutEnabled) return;
                  applyReais(p.amountReais);
                }}
              >
                Usar
              </button>
            </div>
          );
        })}

        {confirm ? (
          <div className="buy-confirm" role="dialog" aria-labelledby="buy-confirm-title">
            <p id="buy-confirm-title" className="section-label">
              Confirmar
            </p>
            <p style={{ marginTop: 0 }}>
              Você vai pagar <strong>R$ {confirm.amountReais.toFixed(2)}</strong> ≈{" "}
              <strong>{confirm.hours.toFixed(1)} h</strong> na tarifa de R$ {price.toFixed(2)}/h
              {me.isSubscriber ? ` (−${me.subscriberDiscountPct}% assinante)` : ""}.
            </p>
            <div className="row">
              <button
                className={`btn prox${busy ? " loading" : ""}`}
                type="button"
                disabled={busy}
                onClick={() => {
                  const payload =
                    mode === "hours"
                      ? { hours: confirm.hours }
                      : { amountReais: confirm.amountReais };
                  setConfirm(null);
                  onBuyHours(payload);
                }}
              >
                {busy ? "…" : "Confirmar"}
              </button>
              <button className="btn ghost" type="button" disabled={busy} onClick={() => setConfirm(null)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="row" style={{ marginTop: "0.75rem" }}>
            <button
              className={`btn prox${busy && checkoutEnabled ? " loading" : ""}`}
              type="button"
              disabled={!checkoutEnabled || busy || !!limitError || !derived.amountReais}
              onClick={requestPay}
            >
              {payLabel}
              {checkoutEnabled && derived.amountReais && !limitError
                ? ` · R$ ${derived.amountReais.toFixed(2)}`
                : ""}
            </button>
          </div>
        )}
      </div>

      <div className="card reveal">
        <p className="section-label">Plano</p>
        <h2>Assinatura</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          {checkoutEnabled
            ? checkoutDemo
              ? "Demonstração — assinatura via Mercado Pago (sem ativar de verdade)."
              : `−${me.subscriberDiscountPct}% nas horas · R$ ${subPrice.toFixed(2)}/mês`
            : "Em breve — assine no balcão ou WhatsApp."}
        </p>
        <div className="row">
          <button
            className={`btn accent2 prox${busy && checkoutEnabled ? " loading" : ""}`}
            type="button"
            disabled={!checkoutEnabled || busy}
            onClick={() => {
              if (!checkoutEnabled) return;
              onBuySub(1);
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
              onBuySub(3);
            }}
          >
            {!checkoutEnabled ? "Em breve" : "3 meses"}
          </button>
        </div>
      </div>
    </>
  );
}
