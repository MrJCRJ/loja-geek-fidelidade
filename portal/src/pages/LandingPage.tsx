import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, getToken, rememberCentralsFromCatalog, type Catalog } from "../api";
import BrandHeader from "../components/BrandHeader";
import { CentralPicker } from "../components/CentralPicker";
import OfflineBanner from "../components/OfflineBanner";
import { useProximityField } from "../hooks/useProximityField";
import { useReveal } from "../hooks/useReveal";
import { useScrollParallax } from "../hooks/useScrollParallax";

const WA_SHOP = "https://wa.me/5575991869502";
const WA_LAN = "https://wa.me/5575988603747";

const DEFAULT_SHOP = [
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
];

const UNITS = [
  {
    name: "Loja GEEKS",
    address: "R. Santo Antônio, 6 — Centro",
    maps: "https://www.google.com/maps/place/Loja+GEEKS/@-9.4013458,-38.2184848,17z",
    note: "Celular, games e colecionáveis",
  },
  {
    name: "Game Box",
    address: "Av. Getúlio Vargas — Centro",
    maps: "https://www.google.com/maps/place/Loja+Game+box+-+Paulo+Afonso+-+BA/@-9.3999492,-38.2172073,17z",
    note: "Games e acessórios",
  },
  {
    name: "Lan House Geeks",
    address: "R. Mal. Rondon — Centro",
    maps: "https://www.google.com/maps/place/Lan+House+Geeks+-+Servi%C3%A7o+do+INSS/@-9.4004788,-38.2244108,17z",
    note: "PCs · GeekLock · serviços digitais",
  },
];

function usePriceCount(active: boolean, target = 10) {
  const [value, setValue] = useState(0);
  const done = useRef(false);

  useEffect(() => {
    if (!active || done.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      done.current = true;
      return;
    }
    done.current = true;
    const start = performance.now();
    const duration = 720;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) * (1 - t);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, target]);

  return value;
}

export default function LandingPage() {
  const logged = Boolean(getToken());
  const { setRef, rootRef, rootVersion } = useReveal();
  const heroRef = useRef<HTMLElement>(null);
  const priceSectionRef = useRef<HTMLElement>(null);
  const [priceActive, setPriceActive] = useState(false);
  const [shopCatalog, setShopCatalog] = useState(DEFAULT_SHOP);
  const price = usePriceCount(priceActive, 10);

  useProximityField(rootRef, { selector: ".prox", radius: 120 }, rootVersion);
  useScrollParallax(heroRef, { maxShift: 10 });

  useEffect(() => {
    api<Catalog>("/api/portal/catalog")
      .then((c) => {
        rememberCentralsFromCatalog(c);
        if (c.shopCatalog?.length) setShopCatalog(c.shopCatalog);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const onCentral = () => {
      api<Catalog>("/api/portal/catalog")
        .then((c) => {
          rememberCentralsFromCatalog(c);
          if (c.shopCatalog?.length) setShopCatalog(c.shopCatalog);
        })
        .catch(() => undefined);
    };
    window.addEventListener("lg-central-changed", onCentral);
    return () => window.removeEventListener("lg-central-changed", onCentral);
  }, []);

  useEffect(() => {
    const el = priceSectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setPriceActive(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="shell shell--landing shell--ambient" ref={setRef}>
      <OfflineBanner />
      <CentralPicker className="central-picker central-picker--landing" />

      <section className="hero hero-animate hero-parallax" ref={heroRef} aria-label="Início">
        <div className="hero-copy">
          <BrandHeader size="lg" />
          <h1 className="display display--xl">Horas de PC na lan · Paulo Afonso</h1>
          <p className="lead">
            Compre pelo celular, cadastre o rosto e sente no PC. O GeekLock reconhece você e desconta
            do saldo.
          </p>
          <div className="row hero-cta">
            {logged ? (
              <Link className="btn prox" to="/dashboard">
                Minha conta
              </Link>
            ) : (
              <>
                <Link className="btn prox" to="/register">
                  Criar conta
                </Link>
                <Link className="btn ghost prox" to="/login">
                  Entrar
                </Link>
              </>
            )}
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="hero-visual-inner prox">
            <div className="hero-plate-grid" aria-hidden="true" />
            <img src="/brand/logo.png" alt="" className="hero-logo-breathe" />
          </div>
        </div>
      </section>

      <section className="section reveal" aria-labelledby="preco-title" ref={priceSectionRef}>
        <p className="section-label" id="preco-title">
          Preço
        </p>
        <div className="price-block">
          <span className="price">R$ {price}</span>
          <span className="price-unit">/ hora</span>
        </div>
        <p className="muted" style={{ margin: "0.85rem 0 0", maxWidth: "28rem" }}>
          Assinantes: −20% na hora · seg–sex 08:30–18:30 · sáb até 17:30 · dom fechado
        </p>
      </section>

      <section className="section reveal" aria-labelledby="fluxo-title">
        <p className="section-label" id="fluxo-title">
          Como funciona
        </p>
        <h2 className="display display--md" style={{ marginBottom: "0.75rem" }}>
          Do celular ao PC
        </h2>
        <ol className="steps-editorial">
          <li className="prox">Crie a conta com e-mail e senha</li>
          <li className="prox">Compre horas (Pix ou crédito na loja)</li>
          <li className="prox">Cadastre o rosto no celular (enroll automático)</li>
          <li className="prox">Na lan house Geeks, sente e jogue</li>
        </ol>
      </section>

      <section className="section reveal" aria-labelledby="unidades-title">
        <p className="section-label" id="unidades-title">
          Unidades
        </p>
        <h2 className="display display--md" style={{ marginBottom: "0.5rem" }}>
          Três pontos em Paulo Afonso
        </h2>
        {UNITS.map((u) => (
          <div className="unit prox" key={u.name}>
            <span className="unit-name">{u.name}</span>
            <p className="unit-meta">
              {u.note}
              <br />
              {u.address} ·{" "}
              <a href={u.maps} target="_blank" rel="noreferrer">
                Ver no mapa
              </a>
            </p>
          </div>
        ))}
      </section>

      <section className="section reveal" aria-labelledby="catalogo-title">
        <p className="section-label" id="catalogo-title">
          Catálogo WhatsApp
        </p>
        <h2 className="display display--md" style={{ marginBottom: "0.5rem" }}>
          Peça pelo Zap
        </h2>
        <p className="muted" style={{ marginTop: 0, maxWidth: "32rem" }}>
          Games, celular, serviços digitais e horas de PC — abra o WhatsApp com a mensagem pronta.
        </p>
        <div className="wa-catalog">
          {shopCatalog.map((item) => (
            <a
              key={item.id}
              className="wa-catalog-item prox"
              href={`https://wa.me/${item.whatsapp}?text=${encodeURIComponent(item.prefill)}`}
              target="_blank"
              rel="noreferrer"
            >
              <span className="unit-name">{item.title}</span>
              <p className="unit-meta" style={{ margin: "0.35rem 0 0" }}>
                {item.blurb}
              </p>
            </a>
          ))}
        </div>
      </section>

      <section className="section reveal" aria-labelledby="contato-title">
        <p className="section-label" id="contato-title">
          Contato
        </p>
        <h2 className="display display--md" style={{ marginBottom: "0.35rem" }}>
          Fale com a Geeks
        </h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Dúvidas de saldo, cadastro facial ou horários — WhatsApp da unidade.
        </p>
        <div className="contact-row">
          <a className="btn accent2 prox" href={WA_LAN} target="_blank" rel="noreferrer">
            WhatsApp lan
          </a>
          <a className="btn ghost prox" href={WA_SHOP} target="_blank" rel="noreferrer">
            WhatsApp loja
          </a>
        </div>
      </section>

      <p className="footer-note">
        geeks · Celular e Game · Paulo Afonso – BA · <Link to="/como-funciona">Como funciona</Link> ·{" "}
        <Link to="/termos">Termos e LGPD</Link>
      </p>

      <div className="sticky-cta" role="navigation" aria-label="Ações rápidas">
        {logged ? (
          <Link className="btn prox" to="/dashboard">
            Minha conta
          </Link>
        ) : (
          <Link className="btn prox" to="/register">
            Criar conta
          </Link>
        )}
        <a className="btn accent2 prox" href={WA_LAN} target="_blank" rel="noreferrer">
          WhatsApp
        </a>
      </div>
    </div>
  );
}
