import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, PortalCustomer, setToken } from "../api";
import BrandHeader from "../components/BrandHeader";
import OfflineBanner from "../components/OfflineBanner";
import { useProximityField } from "../hooks/useProximityField";
import { useReveal } from "../hooks/useReveal";

export default function AccountPage() {
  const nav = useNavigate();
  const rootRef = useReveal();
  useProximityField(rootRef);
  const [me, setMe] = useState<PortalCustomer | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [touched, setTouched] = useState({
    name: false,
    newPassword: false,
    currentPassword: false,
  });

  useEffect(() => {
    api<PortalCustomer>("/api/portal/me")
      .then((profile) => {
        setMe(profile);
        setEditName(profile.name);
        setEditPhone(profile.phone || "");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Erro ao carregar");
        if (String(err).includes("401") || String(err).toLowerCase().includes("token")) {
          setToken(null);
          nav("/login");
        }
      });
  }, [nav]);

  const fieldErrors = useMemo(() => {
    const e: { name?: string; newPassword?: string; currentPassword?: string } = {};
    if (touched.name && editName.trim().length < 2) e.name = "Nome com ao menos 2 caracteres";
    if (touched.newPassword && newPassword && newPassword.length < 6) {
      e.newPassword = "Nova senha com ao menos 6 caracteres";
    }
    if ((touched.currentPassword || touched.newPassword) && newPassword && !currentPassword) {
      e.currentPassword = "Informe a senha atual para trocar";
    }
    return e;
  }, [editName, newPassword, currentPassword, touched]);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setTouched({ name: true, newPassword: true, currentPassword: true });
    setError("");
    setMsg("");
    setSuccess(false);
    if (editName.trim().length < 2) {
      setError("Confira o nome.");
      return;
    }
    if (newPassword) {
      if (newPassword.length < 6) {
        setError("Nova senha muito curta.");
        return;
      }
      if (!currentPassword) {
        setError("Informe a senha atual para trocar.");
        return;
      }
    }
    setBusy(true);
    try {
      const body: {
        name: string;
        phone: string | null;
        password?: string;
        currentPassword?: string;
      } = {
        name: editName.trim(),
        phone: editPhone.trim() || null,
      };
      if (newPassword) {
        body.password = newPassword;
        body.currentPassword = currentPassword;
      }
      const res = await api<{ customer: PortalCustomer }>("/api/portal/me", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setMe(res.customer);
      setEditName(res.customer.name);
      setEditPhone(res.customer.phone || "");
      setCurrentPassword("");
      setNewPassword("");
      setMsg("Dados atualizados.");
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar perfil");
    } finally {
      setBusy(false);
    }
  }

  if (!me) {
    return (
      <div className="shell shell--ambient page-in" ref={rootRef}>
        <OfflineBanner />
        <BrandHeader size="sm" />
        {error ? (
          <p className="muted">{error}</p>
        ) : (
          <>
            <div className="skeleton skeleton--title" />
            <div className="skeleton skeleton--line" />
            <div className="skeleton skeleton--block" />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="shell shell--ambient page-in" ref={rootRef}>
      <OfflineBanner />
      <BrandHeader size="sm" />
      <h1 className="display display--md" style={{ marginBottom: "0.75rem" }}>
        Minha conta
      </h1>
      <div className="nav page-in-cta">
        <Link className="btn ghost prox" to="/dashboard">
          Voltar
        </Link>
      </div>

      {error ? <div className="banner">{error}</div> : null}
      {msg ? <div className="banner ok">{msg}</div> : null}

      <div className="card reveal">
        <p className="section-label">Perfil</p>
        <h2>Dados</h2>
        <form onSubmit={saveProfile} noValidate>
          <div className="field">
            <label htmlFor="profile-name">Nome</label>
            <input
              id="profile-name"
              value={editName}
              className={
                fieldErrors.name
                  ? "field-invalid"
                  : touched.name && editName.trim().length >= 2
                    ? "field-ok"
                    : undefined
              }
              onBlur={() => setTouched((t) => ({ ...t, name: true }))}
              onChange={(e) => setEditName(e.target.value)}
              required
              minLength={2}
            />
            {fieldErrors.name ? <p className="field-error">{fieldErrors.name}</p> : null}
          </div>
          <div className="field">
            <label htmlFor="profile-email">E-mail</label>
            <input id="profile-email" value={me.email || ""} disabled readOnly />
            <span className="muted" style={{ fontSize: "0.8rem" }}>
              E-mail não pode ser alterado pelo app.
            </span>
          </div>
          <div className="field">
            <label htmlFor="profile-phone">Telefone</label>
            <input
              id="profile-phone"
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value)}
              placeholder="(75) 9xxxx-xxxx"
            />
          </div>
          <div className="field">
            <label htmlFor="profile-cur-pass">Senha atual (só se for trocar)</label>
            <input
              id="profile-cur-pass"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              className={fieldErrors.currentPassword ? "field-invalid" : undefined}
              onBlur={() => setTouched((t) => ({ ...t, currentPassword: true }))}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            {fieldErrors.currentPassword ? (
              <p className="field-error">{fieldErrors.currentPassword}</p>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="profile-new-pass">Nova senha (opcional)</label>
            <input
              id="profile-new-pass"
              type="password"
              autoComplete="new-password"
              minLength={6}
              value={newPassword}
              className={fieldErrors.newPassword ? "field-invalid" : undefined}
              onBlur={() => setTouched((t) => ({ ...t, newPassword: true }))}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            {fieldErrors.newPassword ? <p className="field-error">{fieldErrors.newPassword}</p> : null}
          </div>
          <button
            className={`btn prox${busy ? " loading" : ""}${success ? " success-flash" : ""}`}
            type="submit"
            disabled={busy}
          >
            {busy ? "Salvando…" : success ? "Salvo" : "Salvar dados"}
          </button>
        </form>
      </div>
    </div>
  );
}
