import { Link } from "react-router-dom";
import BrandHeader from "../components/BrandHeader";
import OfflineBanner from "../components/OfflineBanner";
import { useReveal } from "../hooks/useReveal";

const FAQ = [
  {
    q: "Como liberar o PC na lan?",
    a: "Crie a conta no site, compre horas (Pix ou balcão), cadastre o rosto no celular e sente no PC com GeekLock. O reconhecimento libera a máquina.",
  },
  {
    q: "Assinatura dá horas ilimitadas?",
    a: "Não. A assinatura dá desconto na tarifa das horas. Você ainda precisa de saldo de horas para jogar.",
  },
  {
    q: "Posso comprar por horas ou por reais?",
    a: "Sim. No dashboard escolha “Por horas” ou “Por valor (R$)”. Os dois convertem com a sua tarifa atual (com desconto de assinante, se houver).",
  },
  {
    q: "O que acontece se o saldo acabar?",
    a: "O GeekLock avisa antes e depois trava o PC. Compre mais horas no site ou peça crédito no balcão.",
  },
  {
    q: "Meu rosto não reconhece. O que fazer?",
    a: "Boa luz de frente, sem óculos escuros/boné se possível. Refaça o cadastro facial no app (enroll) com mais ângulos.",
  },
  {
    q: "Posso usar em outra unidade?",
    a: "Conta e saldo são por Central/loja. No portal, escolha a unidade certa no seletor antes de comprar ou cadastrar a face.",
  },
];

export default function FaqPage() {
  const rootRef = useReveal();

  return (
    <div className="shell shell--ambient page-in" ref={rootRef}>
      <OfflineBanner />
      <BrandHeader size="sm" subtitle="Como funciona" />
      <nav className="nav">
        <Link className="btn ghost" to="/">
          Início
        </Link>
        <Link className="btn" to="/register">
          Criar conta
        </Link>
        <Link className="btn ghost" to="/login">
          Entrar
        </Link>
      </nav>

      <section className="card reveal">
        <p className="section-label">FAQ</p>
        <h1 className="display display--md" style={{ marginTop: 0 }}>
          Como funciona a lan
        </h1>
        <p className="muted" style={{ marginTop: 0 }}>
          Respostas curtas para saldo, face, Pix e assinatura.
        </p>
      </section>

      {FAQ.map((item) => (
        <section className="card reveal" key={item.q}>
          <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>{item.q}</h2>
          <p className="muted" style={{ marginBottom: 0 }}>
            {item.a}
          </p>
        </section>
      ))}

      <section className="card reveal">
        <p className="muted" style={{ margin: 0 }}>
          Ainda com dúvida?{" "}
          <a href="https://wa.me/5575988603747" target="_blank" rel="noreferrer">
            WhatsApp da lan
          </a>
          .
        </p>
      </section>
    </div>
  );
}
