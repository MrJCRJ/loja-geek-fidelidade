import type { RemoteBanner } from "./kiosk-helpers";

type Props = {
  banner: RemoteBanner | null;
  onDismiss: () => void;
};

export function RemoteBannerOverlay({ banner, onDismiss }: Props) {
  if (!banner || Date.now() >= banner.until) return null;
  return (
    <div className={`remote-banner remote-banner--${banner.level}`} role="alert">
      <div className="remote-banner-inner">
        <p className="remote-banner-title">{banner.title}</p>
        <p className="remote-banner-text">{banner.text}</p>
        <button className="btn ghost" type="button" onClick={onDismiss}>
          Fechar
        </button>
      </div>
    </div>
  );
}
