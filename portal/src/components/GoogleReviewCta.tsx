const REVIEW_LINKS = [
  {
    id: "loja",
    label: "Loja GEEKS",
    href: "https://www.google.com/maps/place/Loja+GEEKS/@-9.4013458,-38.2184848,17z",
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

/** CTA pós-compra/enroll — abre a ficha Maps da unidade para avaliação. */
export default function GoogleReviewCta({ onDismiss, title }: Props) {
  return (
    <div className="card card--highlight reveal">
      <p className="section-label">Google</p>
      <h2>{title || "Avalie a Geeks"}</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Sua nota ajuda quem busca lan house e loja de games em Paulo Afonso.
      </p>
      <div className="row" style={{ flexWrap: "wrap" }}>
        {REVIEW_LINKS.map((u) => (
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
