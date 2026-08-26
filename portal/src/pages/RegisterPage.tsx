import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, setToken } from "../api";
import BrandHeader from "../components/BrandHeader";
import { CentralPicker } from "../components/CentralPicker";
import OfflineBanner from "../components/OfflineBanner";
import { useProximityField } from "../hooks/useProximityField";
import { useReveal } from "../hooks/useReveal";

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

export default function RegisterPage() {
  const nav = useNavigate();
  const rootRef = useReveal();
  useProximityField(rootRef);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [touched, setTouched] = useState({
    name: false,
    email: false,
    password: false,
    consent: false,
  });

  const fieldErrors = useMemo(() => {
    const e: { name?: string; email?: string; password?: string; consent?: string } = {};
    if (touched.name && name.trim().length < 2) e.name = "Nome com ao menos 2 caracteres";
    if (touched.email && !email.trim()) e.email = "Informe o e-mail";
    else if (touched.email && !isEmail(email)) e.email = "E-mail inválido";
    if (touched.password && password.length < 6) e.password = "Senha com ao menos 6 caracteres";
    if (touched.consent && !consent) e.consent = "Aceite os termos LGPD para continuar";
    return e;
  }, [name, email, password, consent, touched]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched({ name: true, email: true, password: true, consent: true });
    setError("");
    if (name.trim().length < 2 || !isEmail(email) || password.length < 6 || !consent) {
      setError("Confira os campos destacados.");
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ token: string }>("/api/portal/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password, phone: phone || undefined, consent: true }),
        token: null,
      });
      setToken(res.token);
      setSuccess(true);
      window.setTimeout(() => nav("/dashboard"), 180);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no cadastro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell shell--ambient page-in" ref={rootRef}>
      <OfflineBanner />
      <BrandHeader size="md" />
      <CentralPicker />
      <h1 className="display display--lg" style={{ marginBottom: "0.5rem" }}>
        Criar conta
      </h1>
      <p className="lead">Compre horas e libere o PC na lan house Geeks.</p>
      {error ? <div className="banner">{error}</div> : null}
      <form className="card reveal" onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="name">Nome</label>
          <input
            id="name"
            value={name}
            className={fieldErrors.name ? "field-invalid" : touched.name && name.trim().length >= 2 ? "field-ok" : undefined}
            onBlur={() => setTouched((t) => ({ ...t, name: true }))}
            onChange={(e) => setName(e.target.value)}
            required
          />
          {fieldErrors.name ? <p className="field-error">{fieldErrors.name}</p> : null}
        </div>
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            className={fieldErrors.email ? "field-invalid" : touched.email && isEmail(email) ? "field-ok" : undefined}
            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {fieldErrors.email ? <p className="field-error">{fieldErrors.email}</p> : null}
        </div>
        <div className="field">
          <label htmlFor="phone">Telefone (opcional)</label>
          <input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">Senha (mín. 6)</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            minLength={6}
            value={password}
            className={fieldErrors.password ? "field-invalid" : touched.password && password.length >= 6 ? "field-ok" : undefined}
            onBlur={() => setTouched((t) => ({ ...t, password: true }))}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {fieldErrors.password ? <p className="field-error">{fieldErrors.password}</p> : null}
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => {
              setConsent(e.target.checked);
              setTouched((t) => ({ ...t, consent: true }));
            }}
          />
          <span>
            Autorizo o tratamento dos meus dados e o cadastro facial para reconhecimento na lanhouse
            (LGPD). Li os{" "}
            <Link to="/termos" target="_blank">
              termos e privacidade
            </Link>
            .
          </span>
        </label>
        {fieldErrors.consent ? <p className="field-error">{fieldErrors.consent}</p> : null}
        <div className="row page-in-cta">
          <button
            className={`btn prox${busy ? " loading" : ""}${success ? " success-flash" : ""}`}
            type="submit"
            disabled={busy}
          >
            {busy ? "Criando…" : success ? "Ok" : "Criar conta"}
          </button>
          <Link className="btn ghost prox" to="/login">
            Já tenho conta
          </Link>
        </div>
      </form>
    </div>
  );
}
