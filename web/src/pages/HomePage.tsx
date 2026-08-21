import { Link } from "react-router-dom";

export default function HomePage() {
  return (
    <div className="shell">
      <header style={{ marginBottom: "1.5rem" }}>
        <p className="muted" style={{ margin: 0 }}>
          Sistema local · LAN
        </p>
        <h1 className="brand">Loja Geek Fidelidade VIP</h1>
        <p style={{ maxWidth: 520 }}>
          PC controle gerencia clientes VIP, pontos e estações. Cada PC com webcam reconhece o
          cliente na hora.
        </p>
      </header>

      <div className="grid-2">
        <Link to="/admin" className="panel" style={{ textDecoration: "none" }}>
          <h2 style={{ fontFamily: "var(--display)", marginTop: 0 }}>PC Controle</h2>
          <p className="muted">Cadastro VIP, feed ao vivo, recompensas e comandos para todas as estações.</p>
          <span className="btn">Abrir admin</span>
        </Link>
        <Link to="/station" className="panel" style={{ textDecoration: "none" }}>
          <h2 style={{ fontFamily: "var(--display)", marginTop: 0 }}>Estação</h2>
          <p className="muted">Modo kiosk com webcam: reconhece VIP, soma pontos e resgata prêmios.</p>
          <span className="btn">Abrir estação</span>
        </Link>
      </div>
    </div>
  );
}
