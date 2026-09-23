import type { ReactNode } from "react";
import { PinPad } from "./PinPad";

type PinMode = "unlock" | "quit" | null;

type Props = {
  status: string;
  error: string;
  pin: string;
  pinMode: PinMode;
  banner: ReactNode;
  onRetry: () => void;
  onPinChange: (v: string) => void;
  onOpenPin: () => void;
  onSubmitPin: () => void;
  onClosePin: () => void;
};

export function OfflineScreen({
  status,
  error,
  pin,
  pinMode,
  banner,
  onRetry,
  onPinChange,
  onOpenPin,
  onSubmitPin,
  onClosePin,
}: Props) {
  return (
    <div className="screen">
      {banner}
      <div className="card offline-card">
        <h1 className="brand">GeekLock</h1>
        <span className="pill bad">Central offline</span>
        <p className="kiosk-lead">PC bloqueado. O GeekLock reconecta sozinho quando a central voltar.</p>
        <p className="muted kiosk-status">{status}</p>
        {error && <p className="error-text">{error}</p>}
        <div className="row">
          <button className="btn" type="button" onClick={onRetry}>
            Tentar de novo
          </button>
          <button className="btn ghost" type="button" onClick={onOpenPin}>
            PIN Admin
          </button>
        </div>
      </div>
      {pinMode ? (
        <div className="pin-overlay">
          <PinPad
            value={pin}
            label="PIN Admin — desbloquear"
            onChange={onPinChange}
            onSubmit={onSubmitPin}
            onCancel={onClosePin}
          />
        </div>
      ) : null}
    </div>
  );
}
