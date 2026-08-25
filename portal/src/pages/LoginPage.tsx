import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, setToken } from "../api";
import BrandHeader from "../components/BrandHeader";
import OfflineBanner from "../components/OfflineBanner";
import { useProximityField } from "../hooks/useProximityField";
import { useReveal } from "../hooks/useReveal";

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

export default function LoginPage() {
  const nav = useNavigate();
  const rootRef = useReveal();
  useProximityField(rootRef);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [touched, setTouched] = useState({ email: false, password: false });

  const fieldErrors = useMemo(() => {
    const e: { email?: string; password?: string } = {};
    if (touched.email && !email.trim()) e.email = "Informe o e-mail";
    else if (touched.email && !isEmail(email)) e.email = "E-mail inválido";
    if (touched.password && password.length < 1) e.password = "Informe a senha";
    return e;
  }, [email, password, touched]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched({ email: true, password: true });
    setError("");
    if (!isEmail(email) || !password) {
      setError("Confira e-mail e senha.");
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ token: string }>("/api/portal/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
        token: null,
      });
      setToken(res.token);
      setSuccess(true);
      window.setTimeout(() => nav("/dashboard"), 180);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no login");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell shell--ambient page-in" ref={rootRef}>
      <OfflineBanner />
      <BrandHeader size="md" />
      <h1 className="display display--lg" style={{ marginBottom: "0.5rem" }}>
        Entrar
      </h1>
      <p className="lead">Saldo, horas e cadastro facial da lan Geeks.</p>
      {error ? <div className="banner">{error}</div> : null}
      <form className="card reveal" onSubmit={onSubmit} noValidate>
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
          <label htmlFor="password">Senha</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            className={fieldErrors.password ? "field-invalid" : undefined}
            onBlur={() => setTouched((t) => ({ ...t, password: true }))}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {fieldErrors.password ? <p className="field-error">{fieldErrors.password}</p> : null}
        </div>
        <div className="row page-in-cta">
          <button
            className={`btn prox${busy ? " loading" : ""}${success ? " success-flash" : ""}`}
            type="submit"
            disabled={busy}
          >
            {busy ? "Entrando…" : success ? "Ok" : "Entrar"}
          </button>
          <Link className="btn ghost prox" to="/register">
            Criar conta
          </Link>
        </div>
        <p className="muted" style={{ marginTop: 12 }}>
          <Link to="/forgot">Esqueci a senha</Link>
        </p>
      </form>
    </div>
  );
}
