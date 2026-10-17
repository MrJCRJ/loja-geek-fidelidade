import { useEffect, useState, type ReactNode, type RefObject } from "react";
import type { Customer, GeekLockConfig } from "./vite-env";
import type { PendingLogin } from "./hooks/useRecognizeLoop";
import { scanStatusHint, statusIcon, formatBalanceShort } from "./kiosk-helpers";

type Props = {
  config: GeekLockConfig | null;
  status: string;
  scanReason?: string;
  scanning: boolean;
  ovalClass: string;
  showScore: boolean;
  score: number | null;
  error: string;
  camReady: boolean;
  welcomeCustomer: Customer | null;
  portalQrUrl: string;
  loginPrompt: PendingLogin | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  banner: ReactNode;
  lastFailure?: { kind: string; message: string; at: string } | null;
  onClearFailure?: () => void;
  onRetryCam: () => void;
  onConfirmLogin: () => void;
  onCancelLogin: () => void;
  authBusy?: boolean;
  onDismissNoCredit?: () => void;
  registerFaceStep?: boolean;
  accountCreated?: { username: string; nonce: number } | null;
  onDismissRegisterFace?: () => void;
  onAccountLogin: (username: string, password: string) => void;
  onAccountRegister: (
    input: { name: string; username: string; password: string },
    mode: "auto" | "capture" | "skip",
  ) => void;
  onRequestOpen: (username: string, password: string) => Promise<boolean>;
  gate: "password" | "face";
  onUseFace: () => void;
  onUsePassword: () => void;
};

export function LockedScreen({
  config,
  status,
  scanReason,
  scanning,
  ovalClass,
  showScore,
  score,
  error,
  camReady,
  welcomeCustomer,
  loginPrompt,
  videoRef,
  banner,
  lastFailure,
  onClearFailure,
  onRetryCam,
  onConfirmLogin,
  onCancelLogin,
  authBusy,
  onDismissNoCredit,
  registerFaceStep = false,
  accountCreated = null,
  onDismissRegisterFace,
  onAccountLogin,
  onAccountRegister,
  onRequestOpen,
  gate,
  onUseFace,
  onUsePassword,
}: Props) {
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [registerNotice, setRegisterNotice] = useState("");
  useEffect(() => {
    if (!accountCreated) return;
    setAuthMode("login");
    setUsername(accountCreated.username);
    setPassword("");
    setName("");
    setRegisterNotice("Cadastro concluído. Entre com seu usuário e senha. A hora entra no caixa.");
  }, [accountCreated]);
  const [openUntil, setOpenUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const openCooling = openUntil > now;
  useEffect(() => {
    if (!openCooling) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [openCooling]);
  const hint = scanStatusHint(scanReason, scanning);
  const pillTone =
    scanReason === "no_credit"
      ? "warn"
      : scanReason === "service_down" || scanReason === "error"
        ? "bad"
        : scanning
          ? "ok"
          : "muted";
  const noCreditSplash =
    Boolean(welcomeCustomer) && (scanReason === "no_credit" || (welcomeCustomer?.timeBalanceSeconds ?? 1) <= 0);

  return (
    <div className="screen locked-screen">
      {banner}

      <div className="locked-stage auth-stage">
        <video
          ref={videoRef}
          muted
          playsInline
          className={
            gate === "face" || (registerFaceStep && authMode === "register")
              ? "locked-cam"
              : "locked-cam locked-cam-offscreen"
          }
        />

        <header className="auth-top">
          <div>
            <strong>GeekLock</strong>
            <span>{config?.stationName || "Estação"}</span>
          </div>
          <span className={`pill ${pillTone}`}>
            {statusIcon(scanReason)} {status}
          </span>
        </header>

        {gate === "face" ? (
          <div className="face-gate">
            <div className={`face-guide ${ovalClass}`} aria-hidden="true" />
            <p className="face-gate-hint">{hint || "Olhe para a câmera"}</p>
            {!camReady ? (
              <button className="btn ghost" type="button" onClick={onRetryCam}>
                Reconectar webcam
              </button>
            ) : null}
            <button className="btn face-back" type="button" onClick={onUsePassword}>
              Usar login e senha
            </button>
          </div>
        ) : null}

        {gate === "password" && authMode === "register" && registerFaceStep ? (
          <div className="face-gate">
            <div className={`face-guide ${ovalClass}`} aria-hidden="true" />
            <p className="face-gate-hint">{error || "Olhe para a câmera"}</p>
            {!camReady ? (
              <button className="btn ghost" type="button" onClick={onRetryCam}>
                Reconectar webcam
              </button>
            ) : null}
            <button
              className="btn auth-submit face-back"
              type="button"
              disabled={authBusy || !camReady}
              onClick={() => onAccountRegister({ name: name.trim(), username: username.trim(), password }, "capture")}
            >
              {authBusy ? "…" : "Cadastrar este rosto"}
            </button>
            <button
              className="btn ghost face-back"
              type="button"
              disabled={authBusy}
              onClick={() => onAccountRegister({ name: name.trim(), username: username.trim(), password }, "skip")}
            >
              Pular esta parte
            </button>
            <button className="btn ghost" type="button" disabled={authBusy} onClick={onDismissRegisterFace}>
              Voltar ao formulário
            </button>
          </div>
        ) : null}

        {gate === "password" && !(authMode === "register" && registerFaceStep) ? (
        <main className="auth-desk">
          {authMode === "login" ? (
            <>
              {registerNotice ? <p className="auth-done">{registerNotice}</p> : null}
              <form
                className="lock-auth"
                onSubmit={(e) => {
                  e.preventDefault();
                  onAccountLogin(username.trim(), password);
                }}
              >
                <h1>Entre na máquina</h1>
                <p className="muted">Usuário e senha desta conta. Sem hora, o PC continua travado.</p>
                <label>
                  Usuário
                  <input
                    value={username}
                    autoComplete="username"
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    minLength={3}
                  />
                </label>
                <label>
                  Senha
                  <input
                    type="password"
                    value={password}
                    autoComplete="current-password"
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={1}
                  />
                </label>
                {error ? <p className="error-text">{error}</p> : null}
                <button className="btn auth-submit" type="submit" disabled={authBusy}>
                  {authBusy ? "…" : "Entrar"}
                </button>
              </form>
              <div className="auth-quiet">
                <button
                  type="button"
                  onClick={() => {
                    setRegisterNotice("");
                    setAuthMode("register");
                  }}
                >
                  Criar conta
                </button>
                <button
                  type="button"
                  disabled={authBusy || openCooling}
                  onClick={() => {
                    void onRequestOpen(username.trim(), password).then((sent) => {
                      if (!sent) return;
                      const until = Date.now() + 120_000;
                      setOpenUntil(until);
                      setNow(Date.now());
                    });
                  }}
                >
                  {openCooling ? "Pedido enviado" : "Pedir hora em aberto"}
                </button>
                <button type="button" onClick={onUseFace}>
                  Entrar pela webcam
                </button>
              </div>
              {openCooling ? (
                <p className="auth-hint">Pedido enviado. Este PC continua travado até a equipe liberar.</p>
              ) : null}
            </>
          ) : (
            <form
              className="lock-auth"
              onSubmit={(e) => {
                e.preventDefault();
                onAccountRegister({ name: name.trim(), username: username.trim(), password }, "auto");
              }}
            >
              <h1>Crie sua conta</h1>
              <p className="auth-warn">Criar conta não libera este PC. A hora entra no caixa.</p>
              <label>
                Nome
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  autoComplete="name"
                />
              </label>
              <label>
                Usuário
                <input
                  value={username}
                  autoComplete="username"
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  minLength={3}
                />
              </label>
              <label>
                Senha
                <input
                  type="password"
                  value={password}
                  autoComplete="new-password"
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </label>
              {error ? <p className="error-text">{error}</p> : null}
              <button className="btn auth-submit" type="submit" disabled={authBusy}>
                {authBusy ? "…" : "Criar conta"}
              </button>
              <button className="btn ghost" type="button" onClick={() => setAuthMode("login")}>
                Voltar para entrar
              </button>
            </form>
          )}
        </main>
        ) : null}
      </div>

      {lastFailure ? (
        <div className="failure-banner">
          <p>
            <strong>{lastFailure.kind}</strong>: {lastFailure.message}
          </p>
          {onClearFailure ? (
            <button className="btn ghost" type="button" onClick={onClearFailure}>
              Ok
            </button>
          ) : null}
        </div>
      ) : null}

      {gate === "face" && loginPrompt ? (
        <div className="login-confirm">
          <p className="login-confirm-kicker">VIP reconhecido</p>
          <h2 className="login-confirm-name">{loginPrompt.customer.name}</h2>
          <span className={`level-badge lg ${loginPrompt.customer.level}`}>{loginPrompt.customer.level}</span>
          {loginPrompt.timeBalanceSeconds != null ? (
            <p className="login-confirm-balance">
              Saldo: {formatBalanceShort(loginPrompt.timeBalanceSeconds)}
            </p>
          ) : null}
          <p className="login-confirm-question">Deseja entrar nesta máquina?</p>
          <div className="login-confirm-actions">
            <button className="btn login-confirm-yes" type="button" onClick={onConfirmLogin}>
              Sim, entrar
            </button>
            <button className="btn ghost login-confirm-no" type="button" onClick={onCancelLogin}>
              Não sou eu
            </button>
          </div>
        </div>
      ) : null}

      {gate === "face" && welcomeCustomer && !loginPrompt && (
        <div className="welcome-splash">
          <p className="welcome-kicker">{noCreditSplash ? "Sem crédito" : "Bem-vindo"}</p>
          <h2 className="welcome-name">{welcomeCustomer.name}</h2>
          <span className={`level-badge lg ${welcomeCustomer.level}`}>{welcomeCustomer.level}</span>
          <p className="welcome-balance">
            Saldo:{" "}
            {welcomeCustomer.timeBalanceSeconds != null
              ? `${Math.floor(Math.max(0, welcomeCustomer.timeBalanceSeconds) / 60)}m ${String(
                  Math.max(0, welcomeCustomer.timeBalanceSeconds) % 60,
                ).padStart(2, "0")}s`
              : "0m 00s"}
          </p>
          <p className="welcome-hint">
            {noCreditSplash ? "Login certo. Sem hora este PC não abre. Passe no caixa." : "Entrando…"}
          </p>
          {noCreditSplash ? (
            <button
              className="btn"
              type="button"
              onClick={() => {
                setUsername("");
                setPassword("");
                onDismissNoCredit?.();
              }}
            >
              Outra conta
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
