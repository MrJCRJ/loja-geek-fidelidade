import { useEffect, useMemo, useState } from "react";
import { api, type Customer } from "../../api";
import { TimeDurationPicker, durationToSeconds } from "../components/TimeDurationPicker";
import type { AdminSettings } from "../types";

type ConsoleSession = {
  id: string;
  mode: "sale" | "balance" | "open";
  customerId: string;
  customerName: string;
  startedAt: string;
  endsAt: string | null;
  grantedSeconds: number;
  status: "active" | "expired";
  remainingSeconds: number;
};

type ConsoleCard = {
  id: string;
  name: string;
  session: ConsoleSession | null;
};

type Props = {
  customers: Customer[];
  settings: AdminSettings;
  remoteReadOnly?: boolean;
  focusAddId?: string | null;
  onFocusConsumed?: () => void;
  onError: (msg: string) => void;
  onToast: (msg: string, kind?: "ok" | "error" | "info") => void;
  askConfirm: (opts: {
    title: string;
    message: string;
    danger?: boolean;
    confirmLabel?: string;
  }) => Promise<boolean>;
};

function clock(total: number) {
  const s = Math.max(0, total);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function beep() {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 880;
  gain.gain.value = 0.06;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.3);
  osc.onended = () => void ctx.close();
}

export function ConsolesPanel({
  customers,
  settings,
  remoteReadOnly,
  focusAddId,
  onFocusConsumed,
  onError,
  onToast,
  askConfirm,
}: Props) {
  const [consoles, setConsoles] = useState<ConsoleCard[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formId, setFormId] = useState<string | null>(null);
  const [formKind, setFormKind] = useState<"start" | "add" | "reduce">("start");
  const [mode, setMode] = useState<"sale" | "balance" | "open">("sale");
  const [vipQuery, setVipQuery] = useState("");
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(30);
  const [seenExpired, setSeenExpired] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!focusAddId) return;
    setFormId(focusAddId);
    setFormKind("add");
    setHours(0);
    setMinutes(30);
    onFocusConsumed?.();
  }, [focusAddId, onFocusConsumed]);

  const load = async () => {
    const res = await api<{ consoles: ConsoleCard[] }>("/api/consoles");
    setConsoles(res.consoles);
    return res.consoles;
  };

  useEffect(() => {
    let stop = false;
    void load().catch(() => undefined);
    const poll = window.setInterval(() => {
      if (!stop) void load().catch(() => undefined);
    }, 10_000);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stop = true;
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, []);

  useEffect(() => {
    const fresh = consoles.filter((c) => c.session?.status === "expired" && !seenExpired.has(c.session.id));
    if (!fresh.length) return;
    setSeenExpired((prev) => {
      const next = new Set(prev);
      for (const c of fresh) next.add(c.session!.id);
      return next;
    });
    beep();
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      for (const c of fresh) {
        const who = c.session?.customerName || "cliente";
        new Notification(`${c.name} — tempo acabou`, { body: who });
      }
    }
  }, [consoles, seenExpired]);

  const matches = useMemo(() => {
    const q = vipQuery.trim().toLowerCase();
    if (q.length < 1) return [];
    return customers.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 5);
  }, [customers, vipQuery]);

  const selected = customers.find((c) => c.name.toLowerCase() === vipQuery.trim().toLowerCase()) || null;
  const hourPrice = settings.hourPriceReais || 10;
  const seconds = durationToSeconds(hours, minutes);

  const remainingOf = (session: ConsoleSession) => {
    if (session.status === "expired" || session.mode === "open" || !session.endsAt) return 0;
    return Math.max(0, Math.floor((Date.parse(session.endsAt) - now) / 1000));
  };

  const resetForm = () => {
    setFormId(null);
    setVipQuery("");
    setMode("sale");
    setHours(0);
    setMinutes(30);
  };

  const run = async (consoleId: string, path: string, body: unknown, ok: string) => {
    setBusyId(consoleId);
    try {
      await api(path, { method: "POST", body: JSON.stringify(body) });
      onToast(ok, "ok");
      resetForm();
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Falha");
    } finally {
      setBusyId(null);
    }
  };

  const start = async (consoleId: string, name: string) => {
    const customerName = (selected?.name || vipQuery).trim();
    if (customerName.length < 2) {
      onError("Informe o nome do cliente");
      return;
    }
    if (mode === "sale" && seconds < 5 * 60) {
      onError("Tempo mínimo: 5 minutos");
      return;
    }
    const label =
      mode === "open" ? "liberar aberto" : mode === "balance" ? "usar o saldo" : `marcar ${clock(seconds)}`;
    const ok = await askConfirm({
      title: name,
      message: `${customerName}: ${label}?`,
      confirmLabel: "Marcar",
    });
    if (!ok) return;
    const body: Record<string, unknown> = {
      mode,
      customerName,
    };
    if (selected?.id) body.customerId = selected.id;
    if (mode === "sale") body.seconds = seconds;
    await run(consoleId, `/api/consoles/${consoleId}/start`, body, `${name} marcado`);
  };

  const add = async (consoleId: string, name: string) => {
    if (seconds < 5 * 60) {
      onError("Tempo mínimo: 5 minutos");
      return;
    }
    const reais = Math.round((seconds / 3600) * hourPrice * 100) / 100;
    const ok = await askConfirm({
      title: `Somar em ${name}`,
      message: `${clock(seconds)} · R$ ${reais.toFixed(2)}`,
      confirmLabel: "Somar",
    });
    if (!ok) return;
    await run(consoleId, `/api/consoles/${consoleId}/add`, { seconds }, `${name} somou tempo`);
  };

  const reduce = async (consoleId: string, name: string) => {
    if (seconds < 60) {
      onError("Reduza pelo menos 1 minuto");
      return;
    }
    const ok = await askConfirm({
      title: `Diminuir ${name}`,
      message: `Devolve ${clock(seconds)} do relógio. A hora não volta para a conta. O dinheiro do caixa fica.`,
      confirmLabel: "Diminuir",
    });
    if (!ok) return;
    await run(consoleId, `/api/consoles/${consoleId}/reduce`, { seconds }, `${name} diminuiu tempo`);
  };

  const end = async (card: ConsoleCard) => {
    const session = card.session;
    if (!session) return;
    const left = remainingOf(session);
    const message =
      session.status === "expired"
        ? "Limpar a ficha? O tempo já acabou."
        : session.mode === "open"
          ? "Encerrar o aberto? Não cobra hora."
          : `Encerrar e tirar ${clock(left)} do relógio? A hora não volta para a conta.`;
    const ok = await askConfirm({
      title: card.name,
      message,
      confirmLabel: session.status === "expired" ? "Limpar" : "Encerrar",
      danger: true,
    });
    if (!ok) return;
    await run(card.id, `/api/consoles/${card.id}/end`, {}, `${card.name} livre`);
  };

  return (
    <section className="panel console-panel">
      <h2>Consoles</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Sem GeekLock. O tempo aparece aqui e, no zero, avisa a loja, o Luiz e o Kauã no Zap.
      </p>
      {!remoteReadOnly && typeof Notification !== "undefined" && Notification.permission === "default" && (
        <button
          className="btn ghost"
          type="button"
          onClick={() => void Notification.requestPermission()}
        >
          Avisar neste celular
        </button>
      )}
      <div className="pc-cards">
        {consoles.map((card) => {
          const session = card.session;
          const left = session ? remainingOf(session) : 0;
          const expired = session?.status === "expired" || (session?.mode !== "open" && session?.endsAt && left <= 0);
          return (
            <article
              key={card.id}
              className={`console-card${expired ? " is-expired" : ""}${session ? " is-busy" : ""}`}
            >
              <div className="pc-card-head">
                <h3>{card.name}</h3>
                <span className="tag">{session ? "em uso" : "livre"}</span>
              </div>
              {session ? (
                <>
                  <p className="console-who">{session.customerName}</p>
                  {session.mode === "open" ? (
                    <p className="console-clock">Liberado</p>
                  ) : expired ? (
                    <p className="console-clock">Tempo acabou</p>
                  ) : (
                    <p className="console-clock">{clock(left)}</p>
                  )}
                  <p className="muted" style={{ marginTop: 0 }}>
                    {session.mode === "open"
                      ? `Gasto estimado R$ ${((Math.max(0, (now - Date.parse(session.startedAt)) / 1000) / 3600) * hourPrice).toFixed(2)}`
                      : `R$ ${((session.grantedSeconds / 3600) * hourPrice).toFixed(2)}`}
                  </p>
                </>
              ) : (
                <p className="muted">Ninguém usando</p>
              )}
              {remoteReadOnly ? null : formId === card.id ? (
                <div>
                  {formKind === "start" && (
                    <>
                      <input
                        value={vipQuery}
                        placeholder="Nome do cliente"
                        onChange={(e) => setVipQuery(e.target.value)}
                      />
                      {matches.length > 0 && (
                        <div>
                          {matches.map((c) => (
                            <button key={c.id} className="btn ghost" type="button" onClick={() => setVipQuery(c.name)}>
                              {c.name}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="row" style={{ gap: "0.35rem", margin: "0.5rem 0" }}>
                        {(["sale", "balance", "open"] as const).map((m) => (
                          <button
                            key={m}
                            className={`btn ${mode === m ? "" : "ghost"}`}
                            type="button"
                            onClick={() => setMode(m)}
                          >
                            {m === "sale" ? "Horas" : m === "balance" ? "Saldo" : "Liberado"}
                          </button>
                        ))}
                      </div>
                      {mode === "sale" && (
                        <TimeDurationPicker hours={hours} minutes={minutes} onChange={(h, m) => { setHours(h); setMinutes(m); }} />
                      )}
                    </>
                  )}
                  {formKind !== "start" && (
                    <TimeDurationPicker hours={hours} minutes={minutes} onChange={(h, m) => { setHours(h); setMinutes(m); }} />
                  )}
                  <button
                    className="btn"
                    type="button"
                    disabled={busyId === card.id}
                    onClick={() => {
                      if (formKind === "start") void start(card.id, card.name);
                      else if (formKind === "add") void add(card.id, card.name);
                      else void reduce(card.id, card.name);
                    }}
                  >
                    {formKind === "start"
                      ? mode === "sale"
                        ? `Marcar · R$ ${((seconds / 3600) * hourPrice).toFixed(2)}`
                        : "Marcar"
                      : formKind === "add"
                        ? `Somar · R$ ${((seconds / 3600) * hourPrice).toFixed(2)}`
                        : "Diminuir"}
                  </button>
                  <button className="btn ghost" type="button" onClick={resetForm}>
                    Cancelar
                  </button>
                </div>
              ) : (
                <div className="pc-card-actions">
                  {!session && (
                    <button className="btn" type="button" onClick={() => { setFormId(card.id); setFormKind("start"); }}>
                      Marcar
                    </button>
                  )}
                  {session && session.mode !== "open" && session.status === "active" && (
                    <>
                      <button className="btn" type="button" onClick={() => { setFormId(card.id); setFormKind("add"); setMinutes(30); setHours(0); }}>
                        Somar
                      </button>
                      <button className="btn ghost" type="button" onClick={() => { setFormId(card.id); setFormKind("reduce"); setHours(0); setMinutes(10); }}>
                        Diminuir
                      </button>
                    </>
                  )}
                  {session && (
                    <button className="btn danger" type="button" onClick={() => void end(card)}>
                      {expired ? "Limpar" : "Encerrar"}
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
