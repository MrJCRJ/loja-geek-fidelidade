import type { ReactNode } from "react";

type Props = {
  status: string;
  error: string;
  banner: ReactNode;
  onRetry: () => void;
};

export function OfflineScreen({ status, error, banner, onRetry }: Props) {
  return (
    <div className="screen">
      {banner}
      <div className="card offline-card">
        <h1 className="brand">GeekLock</h1>
        <span className="pill bad">Central offline</span>
        <p className="kiosk-lead">
          PC bloqueado. O GeekLock reconecta sozinho quando a central voltar. Destravar só pelo GeekCentral.
        </p>
        <p className="muted kiosk-status">{status}</p>
        {error && <p className="error-text">{error}</p>}
        <div className="row">
          <button className="btn" type="button" onClick={onRetry}>
            Tentar de novo
          </button>
        </div>
      </div>
    </div>
  );
}
