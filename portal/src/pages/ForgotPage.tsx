import { FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import BrandHeader from "../components/BrandHeader";
import OfflineBanner from "../components/OfflineBanner";
import { useProximityField } from "../hooks/useProximityField";
import { useReveal } from "../hooks/useReveal";

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

export default function ForgotPage() {
  const { setRef, rootRef, rootVersion } = useReveal();
  useProximityField(rootRef, {}, rootVersion);
  const [email, setEmail] = useState("");
  const [tip, setTip] = useState("");
  const [devToken, setDevToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [touched, setTouched] = useState(false);

  const emailError = useMemo(() => {
    if (!touched) return undefined;
    if (!email.trim()) return "Informe o e-mail";
    if (!isEmail(email)) return "E-mail inválido";
    return undefined;
  }, [email, touched]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setError("");
    setTip("");
    setDevToken("");
    setSuccess(false);
    if (!isEmail(email)) {
      setError("Confira o e-mail.");
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; tip?: string; resetToken?: string }>("/api/portal/password/forgot", {
        method: "POST",
        body: JSON.stringify({ email }),
        token: null,
      });
      setTip(res.tip || "Se o e-mail existir, peça o código no balcão.");
      if (res.resetToken) setDevToken(res.resetToken);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell shell--ambient page-in" ref={setRef}>
      <OfflineBanner />
      <BrandHeader size="md" />
      <h1 className="display display--lg" style={{ marginBottom: "0.5rem" }}>
        Recuperar senha
      </h1>
      <p className="lead">
        Informe o e-mail da conta. Na loja, o balcão gera um código (ou use o link de redefinição).
      </p>
      {error ? <div className="banner">{error}</div> : null}
      {tip ? <div className="banner ok">{tip}</div> : null}
      {devToken ? (
        <div className="banner ok">
          Código (dev): <code>{devToken}</code> —{" "}
          <Link to={`/reset?token=${encodeURIComponent(devToken)}`}>redefinir agora</Link>
        </div>
      ) : null}
      <form className="card reveal" onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            value={email}
            className={emailError ? "field-invalid" : touched && isEmail(email) ? "field-ok" : undefined}
            onBlur={() => setTouched(true)}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          {emailError ? <p className="field-error">{emailError}</p> : null}
        </div>
        <div className="row page-in-cta">
          <button
            className={`btn prox${busy ? " loading" : ""}${success ? " success-flash" : ""}`}
            type="submit"
            disabled={busy}
          >
            {busy ? "Enviando…" : success ? "Enviado" : "Continuar"}
          </button>
          <Link className="btn ghost prox" to="/login">
            Voltar ao login
          </Link>
        </div>
        <p className="muted" style={{ marginTop: 12 }}>
          Preferência: peça no balcão da Geeks ou no{" "}
          <a href="https://wa.me/5575988603747" target="_blank" rel="noreferrer">
            WhatsApp da lan
          </a>
          .
        </p>
      </form>
    </div>
  );
}
