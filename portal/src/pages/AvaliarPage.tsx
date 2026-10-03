import { Link } from "react-router-dom";
import { GOOGLE_REVIEW_LOJA_URL } from "../../../shared/google-review";
import BrandHeader from "../components/BrandHeader";

const OTHER_UNITS = [
  {
    id: "gamebox",
    name: "Game Box",
    blurb: "Games e acessórios",
    href: "https://www.google.com/maps/place/Loja+Game+box+-+Paulo+Afonso+-+BA/@-9.3999492,-38.2172073,17z",
  },
  {
    id: "lan",
    name: "Lan House Geeks",
    blurb: "PCs · horas · serviços digitais",
    href: "https://www.google.com/maps/place/Lan+House+Geeks+-+Servi%C3%A7o+do+INSS/@-9.4004788,-38.2244108,17z",
  },
];

/** Landing pública para QR / Wi‑Fi: CTA de avaliar no topo. */
export default function AvaliarPage() {
  return (
    <div className="page page--narrow">
      <a
        className="btn prox"
        href={GOOGLE_REVIEW_LOJA_URL}
        target="_blank"
        rel="noreferrer"
        style={{
          display: "flex",
          width: "100%",
          justifyContent: "center",
          alignItems: "center",
          gap: "0.5rem",
          fontSize: "1.15rem",
          padding: "1rem 1.25rem",
          marginBottom: "1rem",
        }}
      >
        <span aria-hidden>★</span>
        Avaliar Loja GEEKS no Google
      </a>

      <BrandHeader size="lg" subtitle="Opcional · menos de 1 minuto" />

      <section className="card card--highlight" style={{ marginTop: "1rem" }}>
        <p className="section-label">Google Maps</p>
        <h1 style={{ marginTop: 0, fontSize: "1.5rem" }}>Sua nota ajuda a loja</h1>
        <p className="muted" style={{ marginBottom: 0 }}>
          Toque no botão acima para abrir as avaliações da Loja GEEKS. Outras unidades abaixo, se preferir.
        </p>
      </section>

      <div style={{ display: "grid", gap: "0.6rem", marginTop: "1rem" }}>
        {OTHER_UNITS.map((u) => (
          <a
            key={u.id}
            className="btn ghost prox"
            href={u.href}
            target="_blank"
            rel="noreferrer"
            style={{ justifyContent: "space-between", textAlign: "left" }}
          >
            <span>
              <strong>{u.name}</strong>
              <br />
              <span className="muted" style={{ fontWeight: 400, fontSize: "0.85rem" }}>
                {u.blurb}
              </span>
            </span>
            <span aria-hidden>★</span>
          </a>
        ))}
      </div>

      <div className="row" style={{ marginTop: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <Link className="btn ghost prox" to="/">
          Continuar no site
        </Link>
        <a className="btn ghost prox" href="https://wa.me/5575991869502">
          WhatsApp loja
        </a>
        <a className="btn ghost prox" href="https://wa.me/5575988603747">
          WhatsApp lan
        </a>
      </div>

      <p className="muted" style={{ marginTop: "1.5rem", fontSize: "0.85rem" }}>
        Não é obrigatório avaliar para usar a internet ou jogar. Obrigado por apoiar o comércio local em
        Paulo Afonso.
      </p>
    </div>
  );
}
