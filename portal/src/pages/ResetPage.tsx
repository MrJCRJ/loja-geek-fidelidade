import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import BrandHeader from "../components/BrandHeader";
import OfflineBanner from "../components/OfflineBanner";
import { useProximityField } from "../hooks/useProximityField";
import { useReveal } from "../hooks/useReveal";

export default function ResetPage() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { setRef, rootRef, rootVersion } = useReveal();
  useProximityField(rootRef, {}, rootVersion);
  const initialToken = useMemo(() => params.get("token") || "", [params]);
  const [token, setToken] = useState(initialToken);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [touched, setTouched] = useState({
    token: false,
    password: false,
    confirm: false,
  });

  const fieldErrors = useMemo(() => {
    const e: { token?: string; password?: string; confirm?: string } = {};
    if (touched.token && token.trim().length < 16) e.token = "Código incompleto";
    if (touched.password && password.length < 6) e.password = "Senha com ao menos 6 caracteres";
    if (touched.confirm && confirm !== password) e.confirm = "As senhas não coincidem";
    else if (touched.confirm && confirm.length < 6) e.confirm = "Confirme a senha";
    return e;
  }, [token, password, confirm, touched]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched({ token: true, password: true, confirm: true });
    setError("");
    setMsg("");
    setSuccess(false);
    if (token.trim().length < 16 || password.length < 6 || password !== confirm) {
      setError("Confira os campos destacados.");
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; tip?: string }>("/api/portal/password/reset", {
        method: "POST",
        body: JSON.stringify({ token: token.trim(), password }),
        token: null,
      });
      setMsg(res.tip || "Senha atualizada.");
      setSuccess(true);
      window.setTimeout(() => nav("/login"), 1200);
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
        Nova senha
      </h1>
      <p className="lead">Cole o código do balcão e escolha a nova senha.</p>
      {error ? <div className="banner">{error}</div> : null}
      {msg ? <div className="banner ok">{msg}</div> : null}
      <form className="card reveal" onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="token">Código</label>
          <input
            id="token"
            value={token}
            className={fieldErrors.token ? "field-invalid" : touched.token && token.trim().length >= 16 ? "field-ok" : undefined}
            onBlur={() => setTouched((t) => ({ ...t, token: true }))}
            onChange={(e) => setToken(e.target.value)}
            required
            minLength={16}
            autoComplete="off"
          />
          {fieldErrors.token ? <p className="field-error">{fieldErrors.token}</p> : null}
        </div>
        <div className="field">
          <label htmlFor="password">Nova senha</label>
          <input
            id="password"
            type="password"
            value={password}
            className={fieldErrors.password ? "field-invalid" : touched.password && password.length >= 6 ? "field-ok" : undefined}
            onBlur={() => setTouched((t) => ({ ...t, password: true }))}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />
          {fieldErrors.password ? <p className="field-error">{fieldErrors.password}</p> : null}
        </div>
        <div className="field">
          <label htmlFor="confirm">Confirmar senha</label>
          <input
            id="confirm"
            type="password"
            value={confirm}
            className={fieldErrors.confirm ? "field-invalid" : touched.confirm && confirm === password && confirm.length >= 6 ? "field-ok" : undefined}
            onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />
          {fieldErrors.confirm ? <p className="field-error">{fieldErrors.confirm}</p> : null}
        </div>
        <div className="row page-in-cta">
          <button
            className={`btn prox${busy ? " loading" : ""}${success ? " success-flash" : ""}`}
            type="submit"
            disabled={busy}
          >
            {busy ? "Salvando…" : success ? "Ok" : "Salvar senha"}
          </button>
          <Link className="btn ghost prox" to="/forgot">
            Pedir código
          </Link>
        </div>
      </form>
    </div>
  );
}
