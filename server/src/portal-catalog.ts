import { getUnitSettings } from "./admin-ops.js";
import { getHourPriceReais, getSubscriberDiscountPct } from "./billing.js";
import { buildCentralsCatalog } from "./centrals.js";
import { config } from "./config.js";
import { MAX_FACE_SAMPLES } from "./customer-auth.js";
import { getHourPacks } from "./hour-packs.js";
import { mercadopagoEnabled } from "./payments.js";

export function buildPortalCatalog() {
  const mode = config.portalCheckoutMode;
  const mp = mercadopagoEnabled();
  const unit = getUnitSettings();
  const centrals = buildCentralsCatalog();
  return {
    baseHourPrice: getHourPriceReais(),
    subscriberDiscountPct: getSubscriberDiscountPct(),
    subscriptionMonthlyPrice: config.subscriptionMonthlyPrice,
    hourPacks: getHourPacks(),
    maxFaceSamples: MAX_FACE_SAMPLES,
    checkoutEnabled: mode !== "off",
    checkoutMode: mode,
    demo: mode === "demo",
    payments: {
      mode: mp ? "mercadopago" : "stub",
      pixEnabled: mp && mode !== "off",
    },
    whatsappLan: "5575988603747",
    whatsappShop: "5575991869502",
    unit,
    centrals,
    units: [
      {
        id: "loja-geeks",
        name: "Loja GEEKS",
        kind: "shop",
        note: "Celular, games, colecionáveis, conserto e impressão",
        whatsapp: "5575991869502",
      },
      {
        id: "game-box",
        name: "Game Box",
        kind: "shop",
        note: "Games e acessórios",
        whatsapp: "5575991869502",
      },
      {
        id: "lan-geeks",
        name: "Lan House Geeks",
        kind: "lan",
        note: "PCs · GeekLock · serviços digitais",
        whatsapp: "5575988603747",
        unitId: unit.unitId,
        unitName: unit.unitName,
      },
    ],
    shopCatalog: [
      {
        id: "ps5",
        title: "Jogos / consoles",
        blurb: "Peça disponibilidade de games e acessórios",
        whatsapp: "5575991869502",
        prefill: "Oi! Quero saber sobre jogos/consoles na Loja GEEKS.",
      },
      {
        id: "cell",
        title: "Celular e acessórios",
        blurb: "Capas, fones, carregadores e mais",
        whatsapp: "5575991869502",
        prefill: "Oi! Quero ver opções de celular/acessórios.",
      },
      {
        id: "repair",
        title: "Conserto",
        blurb: "Celular e eletrônicos — fale com a loja",
        whatsapp: "5575991869502",
        prefill: "Oi! Quero orçamento de conserto na Loja GEEKS.",
      },
      {
        id: "print",
        title: "Impressão",
        blurb: "Documentos e arquivos — Loja GEEKS",
        whatsapp: "5575991869502",
        prefill: "Oi! Preciso imprimir na Loja GEEKS.",
      },
      {
        id: "inss",
        title: "Serviços digitais / INSS",
        blurb: "Agendamento e auxílio na lan house",
        whatsapp: "5575988603747",
        prefill: "Oi! Preciso de ajuda com serviço digital / INSS na Lan Geeks.",
      },
      {
        id: "hours",
        title: "Horas de PC",
        blurb: "Compre pelo portal ou peça crédito no balcão",
        whatsapp: "5575988603747",
        prefill: "Oi! Quero comprar horas de PC na Lan House Geeks.",
      },
    ],
  };
}

export function buildPortalHealth() {
  const mode = config.portalCheckoutMode;
  return {
    ok: true,
    ts: new Date().toISOString(),
    payments: mercadopagoEnabled() ? "mp" : "stub",
    checkoutEnabled: mode !== "off",
    checkoutMode: mode,
    demo: mode === "demo",
  };
}
