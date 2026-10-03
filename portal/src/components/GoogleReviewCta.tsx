import { GOOGLE_REVIEW_LOJA_URL } from "../../../shared/google-review";

const REVIEW_LINKS = [
  {
    id: "loja",
    label: "Loja GEEKS",
    href: GOOGLE_REVIEW_LOJA_URL,
  },
  {
    id: "gamebox",
    label: "Game Box",
    href: "https://www.google.com/maps/place/Loja+Game+box+-+Paulo+Afonso+-+BA/@-9.3999492,-38.2172073,17z",
  },
  {
    id: "lan",
    label: "Lan House Geeks",
    href: "https://www.google.com/maps/place/Lan+House+Geeks+-+Servi%C3%A7o+do+INSS/@-9.4004788,-38.2244108,17z",
  },
];

type Props = {
  onDismiss?: () => void;
  title?: string;
};

/** CTA pós-compra/enroll — Loja GEEKS em destaque no topo. */
export default function GoogleReviewCta({ onDismiss, title }: Props) {
  const loja = REVIEW_LINKS[0];
  const others = REVIEW_LINKS.slice(1);
  return (
    <div className="card card--highlight reveal">
      <p className="section-label">Google</p>
      <h2>{title || "Avalie a Geeks"}</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Sua nota ajuda quem busca lan house e loja de games em Paulo Afonso.
      </p>
      <a
        className="btn prox"
        href={loja.href}
        target="_blank"
        rel="noreferrer"
        style={{ display: "flex", width: "100%", justifyContent: "center", marginBottom: "0.65rem" }}
      >
        ★ {loja.label}
      </a>
      <div className="row" style={{ flexWrap: "wrap" }}>
        {others.map((u) => (
          <a key={u.id} className="btn ghost prox" href={u.href} target="_blank" rel="noreferrer">
            {u.label}
          </a>
        ))}
        {onDismiss ? (
          <button type="button" className="btn ghost prox" onClick={onDismiss}>
            Agora não
          </button>
        ) : null}
      </div>
    </div>
  );
}
