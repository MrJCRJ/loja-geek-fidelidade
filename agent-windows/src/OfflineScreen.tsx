import type { ReactNode } from "react";

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
}: Props) {
  return (
    <div className="screen">
      {banner}
      <div className="card">
        <h1 className="brand">GeekLock</h1>
        <span className="pill bad">Sem conexão</span>
        <p className="kiosk-lead">PC bloqueado. Conecte-se ao servidor da loja (PC controle).</p>
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
        {pinMode && (
          <div className="field">
            <label>PIN Admin</label>
            <input
              type="password"
              value={pin}
              onChange={(e) => onPinChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSubmitPin()}
            />
            <button className="btn" type="button" onClick={onSubmitPin}>
              Confirmar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
