import type { ReactNode, RefObject } from "react";
import type { Customer, GeekLockConfig } from "./vite-env";
import { statusIcon } from "./kiosk-helpers";

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
  videoRef: RefObject<HTMLVideoElement | null>;
  banner: ReactNode;
  onPinChange: (v: string) => void;
  onOpenPin: (mode: "unlock" | "quit") => void;
  onSubmitPin: () => void;
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
  videoRef,
  banner,
  onPinChange,
  onOpenPin,
  onSubmitPin,
}: Props) {
  return (
    <div className="screen screen-locked">
      {banner}
      <header className="locked-topbar">
        <div className="locked-topbar-brand">
          <strong>GeekLock</strong>
          <span className="muted locked-topbar-station">{config?.stationName}</span>
        </div>
        <span className={`pill ${scanReason === "no_gallery" ? "bad" : "warn"} kiosk-status-pill`}>
          {statusIcon(scanReason)} {status}
        </span>
        <button
          className="btn ghost locked-topbar-pin"
          type="button"
          onClick={() => onOpenPin("unlock")}
        >
          PIN Admin
        </button>
      </header>
      <p className="muted locked-conn-hint">
        Conectado ao PC controle
        {score != null && score > 0 ? ` · score ${(score * 100).toFixed(0)}%` : ""}
      </p>

      {welcomeCustomer && (
        <div className="welcome-splash">
          <p className="welcome-kicker">Bem-vindo</p>
          <h2 className="welcome-name">{welcomeCustomer.name}</h2>
          <span className={`level-badge lg ${welcomeCustomer.level}`}>{welcomeCustomer.level}</span>
          <p className="muted">Liberando máquina…</p>
        </div>
      )}

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h1 className="brand">GeekLock</h1>
            <p className="muted kiosk-sub" style={{ margin: 0 }}>
              {config?.stationName} · só VIP libera a máquina
            </p>
          </div>
          <span className={`pill ${scanReason === "no_gallery" ? "bad" : "warn"} kiosk-status-pill`}>
            {statusIcon(scanReason)} {status}
          </span>
        </div>

        <p className="muted kiosk-sub" style={{ margin: "0.35rem 0 0" }}>
          Conectado ao PC controle
          {showScore && score != null ? ` · score ${(score * 100).toFixed(0)}%` : ""}
        </p>

        <div className="grid" style={{ marginTop: "1rem" }}>
          <div className="video-wrap">
            <video ref={videoRef} muted playsInline />
            {!camReady && (
              <div className="video-placeholder">
                <p>Câmera indisponível</p>
                <p className="muted">Use PIN Admin ou reconecte o DroidCam</p>
              </div>
            )}
            <div className={`face-guide scan-${ovalClass}`} aria-hidden />
            <p className="face-guide-label">
              {scanning ? "Analisando rosto…" : "Centralize o rosto"}
            </p>
          </div>
          <div>
            <p className="kiosk-lead">
              Olhe para a câmera. O PC só destrava se o servidor confirmar que você é VIP.
            </p>
            {showScore && score != null && (
              <p className="muted score-line">
                Score: <strong>{(score * 100).toFixed(0)}%</strong>
              </p>
            )}
            {error && <p className="error-text">{error}</p>}
            <div className="row">
              <button className="btn ghost" type="button" onClick={() => onOpenPin("unlock")}>
                PIN Admin
              </button>
              <button className="btn ghost" type="button" onClick={() => onOpenPin("quit")}>
                Sair do app
              </button>
            </div>
            {pinMode && (
              <div className="field">
                <label>PIN Admin ({pinMode === "quit" ? "sair" : "desbloquear"})</label>
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => onPinChange(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && onSubmitPin()}
                  autoFocus
                />
                <button className="btn" type="button" onClick={onSubmitPin}>
                  Confirmar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
