import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { PortalCustomer, setToken } from "../api";
import BrandHeader from "../components/BrandHeader";
import { CentralPicker } from "../components/CentralPicker";
import { enablePushNotifications } from "../push";

type Props = {
  me: PortalCustomer;
};

export function DashboardHeader({ me }: Props) {
  const nav = useNavigate();
  const [pushMsg, setPushMsg] = useState("");

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
        <button
          type="button"
          className="btn ghost prox"
          onClick={() => {
            setPushMsg("");
            enablePushNotifications()
              .then((m) => setPushMsg(m))
              .catch((e) => setPushMsg(e instanceof Error ? e.message : "Falha no push"));
          }}
        >
          Avisos no celular
        </button>
      </div>
      {pushMsg ? <p className="muted tip-box">{pushMsg}</p> : null}
    </>
  );
}
