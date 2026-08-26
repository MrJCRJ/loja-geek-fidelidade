import { Link, useNavigate } from "react-router-dom";
import { PortalCustomer, setToken } from "../api";
import BrandHeader from "../components/BrandHeader";
import { CentralPicker } from "../components/CentralPicker";

type Props = {
  me: PortalCustomer;
};

export function DashboardHeader({ me }: Props) {
  const nav = useNavigate();

  function logout() {
    setToken(null);
    nav("/");
  }

  return (
    <>
      <div className="page-top">
        <BrandHeader size="sm" />
        <button type="button" className="btn ghost prox" onClick={logout}>
          Sair
        </button>
      </div>
      <CentralPicker className="central-picker reveal" />
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
    </>
  );
}
