import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  api,
  Catalog,
  PortalCustomer,
  rememberCentralsFromCatalog,
  setToken,
  TimeLedgerEntry,
  WebOrder,
} from "../api";

export function useDashboardData() {
  const nav = useNavigate();
  const [me, setMe] = useState<PortalCustomer | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [orders, setOrders] = useState<WebOrder[]>([]);
  const [timeLedger, setTimeLedger] = useState<TimeLedgerEntry[]>([]);
  const [loadError, setLoadError] = useState("");
  const [centralTick, setCentralTick] = useState(0);

  const load = useCallback(async () => {
    const [profile, cat, ord, ledger] = await Promise.all([
      api<PortalCustomer>("/api/portal/me"),
      api<Catalog>("/api/portal/catalog"),
      api<{ orders: WebOrder[] }>("/api/portal/orders").catch(() => ({ orders: [] as WebOrder[] })),
      api<{ ledger: TimeLedgerEntry[] }>("/api/portal/me/time-ledger").catch(() => ({
        ledger: [] as TimeLedgerEntry[],
      })),
    ]);
    setMe(profile);
    setCatalog(cat);
    rememberCentralsFromCatalog(cat);
    setOrders(ord.orders);
    setTimeLedger(ledger.ledger);
  }, []);

  useEffect(() => {
    const onCentral = () => {
      setMe(null);
      setLoadError("");
      setCentralTick((n) => n + 1);
    };
    window.addEventListener("lg-central-changed", onCentral);
    return () => window.removeEventListener("lg-central-changed", onCentral);
  }, []);

  useEffect(() => {
    load().catch((err) => {
      const message = err instanceof Error ? err.message : "Erro ao carregar";
      setLoadError(message);
      if (String(err).includes("401") || String(err).toLowerCase().includes("token")) {
        setToken(null);
        nav("/login");
      }
    });
  }, [load, nav, centralTick]);

  return { me, setMe, catalog, orders, timeLedger, loadError, load };
}
