import type { ReactNode, RefObject } from "react";
import type { Customer, GeekLockConfig } from "./vite-env";
import type { PendingLogin } from "./hooks/useRecognizeLoop";
import { scanStatusHint, statusIcon, formatBalanceShort } from "./kiosk-helpers";
import { PinPad } from "./PinPad";
import { PortalQr } from "./PortalQr";

type PinMode = "unlock" | "quit" | null;

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
  pin: string;
  pinMode: PinMode;
  portalQrUrl: string;
  loginPrompt: PendingLogin | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  banner: ReactNode;
  lastFailure?: { kind: string; message: string; at: string } | null;
  onClearFailure?: () => void;
  onRetryCam: () => void;
  onConfirmLogin: () => void;
  onCancelLogin: () => void;
  onPinChange: (v: string) => void;
  onOpenPin: (mode: "unlock" | "quit") => void;
  onSubmitPin: () => void;
  onClosePin: () => void;
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
  pin,
  pinMode,
  portalQrUrl,
  loginPrompt,
  videoRef,
  banner,
  lastFailure,
  onClearFailure,
  onRetryCam,
  onConfirmLogin,
  onCancelLogin,
  onPinChange,
  onOpenPin,
  onSubmitPin,
  onClosePin,
}: Props) {
  const hint = scanStatusHint(scanReason, scanning);
  const pillTone = scanReason === "no_gallery" || ovalClass === "error" ? "bad" : "warn";

  return (
    <div className="screen screen-locked">
      {banner}

      <div className="locked-stage">
        <video ref={videoRef} muted playsInline className="locked-cam" />
        {!camReady && (
          <div className="video-placeholder locked-cam-placeholder">
            <p>Webcam indisponível</p>
            <p className="muted">Confira o DroidCam no celular ou use PIN Admin</p>
            <button className="btn" type="button" onClick={onRetryCam}>
              Tentar câmera de novo
            </button>
          </div>
        )}
        <div className={`face-guide scan-${ovalClass}`} aria-hidden />

        <header className="locked-chrome">
          <div className="locked-chrome-brand">
            <strong>GeekLock</strong>
            <span className="muted">{config?.stationName || "Estação"}</span>
          </div>
          <span className={`pill ${pillTone} kiosk-status-pill`}>
            {statusIcon(scanReason)} {status}
          </span>
          <button className="btn ghost locked-chrome-pin" type="button" onClick={() => onOpenPin("unlock")}>
            PIN
          </button>
        </header>

        <PortalQr value={portalQrUrl} caption="Cadastre-se / compre horas" />

        <div className="locked-footer">
          <p className="face-guide-label locked-guide">
            {scanning ? "Analisando rosto…" : "Centralize o rosto na oval"}
          </p>
          <p className="locked-hint">{hint}</p>
          {showScore && score != null ? (
            <p className="score-line">
              Confiança: <strong>{(score * 100).toFixed(0)}%</strong>
            </p>
          ) : null}
          {error ? <p className="error-text">{error}</p> : null}
          <div className="row locked-actions">
            {!camReady ? (
              <button className="btn" type="button" onClick={onRetryCam}>
                Reconectar webcam
              </button>
            ) : null}
            <button className="btn ghost" type="button" onClick={() => onOpenPin("unlock")}>
              PIN Admin
            </button>
            <button className="btn ghost" type="button" onClick={() => onOpenPin("quit")}>
              Sair do app
            </button>
          </div>
        </div>
      </div>

      {lastFailure ? (
        <div className="banner warn locked-failure">
          Última falha ({new Date(lastFailure.at).toLocaleString("pt-BR")}): {lastFailure.message}
          {onClearFailure ? (
            <button className="btn ghost" type="button" onClick={onClearFailure}>
              Ok
            </button>
          ) : null}
        </div>
      ) : null}

      {loginPrompt ? (
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

      {welcomeCustomer && !loginPrompt && (
        <div className="welcome-splash">
          <p className="welcome-kicker">Bem-vindo</p>
          <h2 className="welcome-name">{welcomeCustomer.name}</h2>
          <span className={`level-badge lg ${welcomeCustomer.level}`}>{welcomeCustomer.level}</span>
          {welcomeCustomer.timeBalanceSeconds != null ? (
            <p className="welcome-balance">
              Saldo: {Math.floor(welcomeCustomer.timeBalanceSeconds / 60)}m{" "}
              {String(welcomeCustomer.timeBalanceSeconds % 60).padStart(2, "0")}s
            </p>
          ) : null}
          <p className="muted">Entrando…</p>
        </div>
      )}

      {pinMode ? (
        <div className="pin-overlay">
          <PinPad
            value={pin}
            label={pinMode === "quit" ? "PIN para sair do GeekLock" : "PIN Admin — desbloquear"}
            onChange={onPinChange}
            onSubmit={onSubmitPin}
            onCancel={onClosePin}
          />
        </div>
      ) : null}
    </div>
  );
}
