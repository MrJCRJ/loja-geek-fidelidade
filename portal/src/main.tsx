import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { initPortalSentry } from "./sentry";
import { setApiBase } from "./api";
import "./styles.css";

initPortalSentry();

/** Permite apontar o portal para a API sem redeploy (ex.: túnel quick). */
function bootstrapApiFromQuery() {
  try {
    const q = new URLSearchParams(window.location.search);
    const api = q.get("api") || q.get("central");
    if (!api || !/^https?:\/\//i.test(api)) return;
    const clean = api.replace(/\/$/, "");
    setApiBase(clean, { clearSession: false });
    q.delete("api");
    q.delete("central");
    const next = `${window.location.pathname}${q.toString() ? `?${q}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", next);
  } catch {
    /* ignore */
  }
}

bootstrapApiFromQuery();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}
