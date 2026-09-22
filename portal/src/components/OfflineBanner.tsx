import { useEffect, useState } from "react";
import { getApiBase } from "../api";

const WA_LAN = "https://wa.me/5575988603747?text=Oi%20Geeks%20—%20portal%20offline";

export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const base = getApiBase();
        if (!base) {
          if (!cancelled) setOffline(true);
          return;
        }
        const ctrl = new AbortController();
        const t = window.setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch(`${base}/api/portal/health`, { signal: ctrl.signal });
        window.clearTimeout(t);
        if (!cancelled) setOffline(!res.ok);
      } catch {
        if (!cancelled) setOffline(true);
      }
    };
    check();
    const id = window.setInterval(check, 20000);
    const onCentral = () => check();
    window.addEventListener("lg-central-changed", onCentral);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("lg-central-changed", onCentral);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="banner warn offline-banner" role="alert">
      <div>
        <strong>Lan house offline</strong>
        <div className="muted" style={{ color: "inherit", marginTop: 4 }}>
          O PC da loja ou o túnel da API está fora. Tente mais tarde ou fale no WhatsApp.
        </div>
      </div>
      <a className="btn prox" href={WA_LAN} target="_blank" rel="noreferrer">
        WhatsApp
      </a>
    </div>
  );
}
