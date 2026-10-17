import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";

type Card = {
  id: string;
  name: string;
  session: { id: string; status: string; customerName: string; mode: string } | null;
};

type Props = {
  remoteReadOnly?: boolean;
  onError: (msg: string) => void;
  onToast: (msg: string, kind?: "ok" | "error" | "info") => void;
  onAdd: (consoleId: string) => void;
};

export function ConsoleAlertBar({ remoteReadOnly, onError, onToast, onAdd }: Props) {
  const [cards, setCards] = useState<Card[]>([]);

  const load = useCallback(async () => {
    const res = await api<{ consoles: Card[] }>("/api/consoles");
    setCards(res.consoles.filter((c) => c.session?.status === "expired"));
  }, []);

  useEffect(() => {
    void load().catch(() => undefined);
    const t = window.setInterval(() => void load().catch(() => undefined), 10_000);
    return () => window.clearInterval(t);
  }, [load]);

  if (!cards.length) return null;

  const clear = async (card: Card) => {
    try {
      await api(`/api/consoles/${card.id}/end`, { method: "POST", body: "{}" });
      onToast(`${card.name} livre`, "ok");
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Falha ao limpar");
    }
  };

  return (
    <div className="console-alerts">
      {cards.map((card) => (
        <div key={card.id} className="console-alert">
          <strong>
            {card.name} — tempo acabou
            {card.session?.customerName ? ` · ${card.session.customerName}` : ""}
          </strong>
          {!remoteReadOnly && (
            <div className="row" style={{ gap: "0.35rem" }}>
              <button className="btn" type="button" onClick={() => onAdd(card.id)}>
                Somar
              </button>
              <button className="btn ghost" type="button" onClick={() => void clear(card)}>
                Limpar
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
