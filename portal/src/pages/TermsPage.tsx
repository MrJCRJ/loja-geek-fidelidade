import { Link } from "react-router-dom";
import BrandHeader from "../components/BrandHeader";
import OfflineBanner from "../components/OfflineBanner";
import { useProximityField } from "../hooks/useProximityField";
import { useReveal } from "../hooks/useReveal";

export default function TermsPage() {
  const { setRef, rootRef, rootVersion } = useReveal();
  useProximityField(rootRef, {}, rootVersion);

  return (
    <div className="shell shell--ambient page-in" ref={setRef}>
      <OfflineBanner />
      <BrandHeader size="md" />
      <h1 className="display display--lg" style={{ marginBottom: "0.75rem" }}>
        Termos e LGPD
      </h1>
      <div className="card">
        <div className="reveal">
          <p className="section-label">Privacidade</p>
          <h2>Tratamento de dados</h2>
          <p>
            A <strong>Geeks — Celular e Game</strong> (Paulo Afonso/BA) trata dados pessoais para
            cadastro no portal, crédito de horas, assinatura e reconhecimento facial nas estações
            GeekLock.
          </p>
        </div>
        <div className="reveal">
          <h3>O que coletamos</h3>
          <ul>
            <li>Nome, e-mail, telefone e senha (hash) da conta</li>
            <li>Histórico de compras no portal e consumo de horas na lan</li>
            <li>
              <strong>Embeddings faciais</strong> (números matemáticos), não o armazenamento contínuo
              de vídeo ou álbum de fotos
            </li>
          </ul>
        </div>
        <div className="reveal">
          <h3>Finalidade</h3>
          <p>
            Identificar VIPs nas estações, debitar saldo, oferecer benefícios de assinatura e melhorar
            o atendimento. O consentimento é solicitado no cadastro e no enroll facial.
          </p>
        </div>
        <div className="reveal">
          <h3>Seus direitos</h3>
          <ul>
            <li>Atualizar nome/telefone/senha em Minha conta</li>
            <li>Apagar o cadastro facial (portal: Refazer cadastro facial; balcão: GeekCentral)</li>
            <li>Solicitar exclusão da conta no balcão ou WhatsApp da lan</li>
          </ul>
        </div>
        <div className="reveal">
          <h3>Contato</h3>
          <p>
            WhatsApp lan:{" "}
            <a href="https://wa.me/5575988603747" target="_blank" rel="noreferrer">
              (75) 98860-3747
            </a>
            <br />
            WhatsApp loja:{" "}
            <a href="https://wa.me/5575991869502" target="_blank" rel="noreferrer">
              (75) 99186-9502
            </a>
          </p>
        </div>
        <div className="row page-in-cta">
          <Link className="btn prox" to="/register">
            Criar conta
          </Link>
          <Link className="btn ghost prox" to="/">
            Voltar
          </Link>
        </div>
      </div>
    </div>
  );
}
