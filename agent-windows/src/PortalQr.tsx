import { useEffect, useState } from "react";
import QRCode from "qrcode";

type Props = {
  value: string;
  size?: number;
  caption?: string;
};

export function PortalQr({ value, size = 132, caption }: Props) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, {
      width: size,
      margin: 1,
      color: { dark: "#06101f", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc("");
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  return (
    <aside className="portal-qr" aria-label="Cadastro no portal">
      {src ? (
        <img src={src} width={size} height={size} alt="QR do portal VIP" />
      ) : (
        <div className="portal-qr-skeleton" style={{ width: size, height: size }} />
      )}
      <p className="portal-qr-caption">{caption || "Cadastre-se / compre horas"}</p>
      <p className="portal-qr-url muted">{value.replace(/^https?:\/\//, "")}</p>
    </aside>
  );
}
