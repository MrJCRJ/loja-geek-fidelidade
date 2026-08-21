import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  api,
  captureFrame,
  formatDuration,
  getAdminToken,
  openUserCamera,
  setAdminToken,
  wsUrl,
  type Customer,
  type MachineSession,
  type RecognitionEvent,
  type Reward,
  type SessionStats,
  type Station,
} from "../api";

type Tab = "feed" | "clientes" | "estacoes" | "sessoes" | "recompensas" | "config";

export default function AdminPage() {
  const [token, setToken] = useState(getAdminToken());
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("feed");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [connected, setConnected] = useState<Array<{ stationId: string; stationName: string }>>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [events, setEvents] = useState<RecognitionEvent[]>([]);
  const [sessions, setSessions] = useState<MachineSession[]>([]);
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);
  const [live, setLive] = useState<Array<{ text: string; at: string }>>([]);
  const [settings, setSettings] = useState({ faceMatchThreshold: 0.45, pointsPerReal: 1 });
  const [selected, setSelected] = useState<Customer | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", level: "bronze", notes: "", consent: true });
  const [stationName, setStationName] = useState("");
  const [rewardForm, setRewardForm] = useState({ title: "", description: "", costPoints: 50 });
  const [enrollMsg, setEnrollMsg] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const login = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const res = await api<{ token: string }>("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password }),
        token: null,
      });
      setAdminToken(res.token);
      setToken(res.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no login");
    }
  };

  const logout = () => {
    setAdminToken(null);
    setToken(null);
  };

  const refresh = useCallback(async () => {
    if (!token) return;
    const [c, s, r, ev, st, sess] = await Promise.all([
      api<Customer[]>("/api/customers"),
      api<{ stations: Station[]; connected: Array<{ stationId: string; stationName: string }> }>(
        "/api/stations",
      ),
      api<Reward[]>("/api/rewards"),
      api<RecognitionEvent[]>("/api/events/recognition"),
      api<{ faceMatchThreshold: number; pointsPerReal: number }>("/api/settings"),
      api<{ sessions: MachineSession[]; stats: SessionStats }>("/api/sessions"),
    ]);
    setCustomers(c);
    setStations(s.stations);
    setConnected(s.connected);
    setRewards(r);
    setEvents(ev);
    setSettings(st);
    setSessions(sess.sessions);
    setSessionStats(sess.stats);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    refresh().catch((err) => setError(err.message));
  }, [token, refresh]);

  useEffect(() => {
    if (!token) return;
    const ws = new WebSocket(wsUrl("admin", token));
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "vip_detected") {
          setLive((prev) =>
            [
              {
                text: `VIP ${msg.customer?.name} em ${msg.station?.name} (score ${(msg.score * 100).toFixed(0)}%)`,
                at: msg.at || new Date().toISOString(),
              },
              ...prev,
            ].slice(0, 30),
          );
          refresh().catch(() => undefined);
        }
        if (msg.type === "session_started") {
          setLive((prev) =>
            [
              {
                text: `VIP ${msg.session?.customer_name || "?"} liberou ${msg.session?.station_name || msg.station?.name}`,
                at: msg.at || new Date().toISOString(),
              },
              ...prev,
            ].slice(0, 30),
          );
          refresh().catch(() => undefined);
        }
        if (msg.type === "session_ended") {
          const secs = msg.session?.seconds_total ?? 0;
          setLive((prev) =>
            [
              {
                text: `Sessão encerrada — ${msg.session?.customer_name || "?"} em ${msg.session?.station_name || "?"} (${formatDuration(secs)})`,
                at: msg.at || new Date().toISOString(),
              },
              ...prev,
            ].slice(0, 30),
          );
          refresh().catch(() => undefined);
        }
        if (msg.type === "station_heartbeat" || msg.type === "points_updated" || msg.type === "reward_redeemed") {
          refresh().catch(() => undefined);
        }
      } catch {
        /* ignore */
      }
    };
    return () => ws.close();
  }, [token, refresh]);

  const startCam = async () => {
    stopCam();
    const stream = await openUserCamera();
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }
  };

  const stopCam = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => () => stopCam(), []);

  const createCustomer = async (e: FormEvent) => {
    e.preventDefault();
    const created = await api<Customer>("/api/customers", {
      method: "POST",
      body: JSON.stringify(form),
    });
    setForm({ name: "", phone: "", level: "bronze", notes: "", consent: true });
    setSelected(created);
    await refresh();
  };

  const enrollFace = async () => {
    if (!selected || !videoRef.current) return;
    setEnrollMsg("Capturando...");
    const imageBase64 = captureFrame(videoRef.current);
    const res = await api<{ ok: boolean }>(`/api/customers/${selected.id}/enroll`, {
      method: "POST",
      body: JSON.stringify({ imageBase64 }),
    });
    setEnrollMsg(res.ok ? "Amostra facial salva." : "Falha");
    await refresh();
    const updated = await api<Customer>(`/api/customers/${selected.id}`);
    setSelected(updated);
  };

  const onlineMap = useMemo(() => new Set(connected.map((c) => c.stationId)), [connected]);

  if (!token) {
    return (
      <div className="shell" style={{ maxWidth: 420 }}>
        <h1 className="brand">PC Controle</h1>
        <form className="panel" onSubmit={login}>
          <div className="field">
            <label>Senha admin</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </div>
          {error && <p style={{ color: "crimson" }}>{error}</p>}
          <button className="btn" type="submit">
            Entrar
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="shell">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <p className="muted" style={{ margin: 0 }}>
            Loja Geek
          </p>
          <h1 className="brand">PC Controle</h1>
        </div>
        <div className="row">
          <button className="btn ghost" onClick={() => refresh()}>
            Atualizar
          </button>
          <button className="btn danger" onClick={logout}>
            Sair
          </button>
        </div>
      </div>

      <div className="tabs">
        {(
          [
            ["feed", "Feed VIP"],
            ["clientes", "Clientes"],
            ["estacoes", "Estações"],
            ["sessoes", "Sessões / Horas"],
            ["recompensas", "Recompensas"],
            ["config", "Config"],
          ] as Array<[Tab, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            className={`btn ${tab === id ? "active" : "ghost"}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <div className="banner">{error}</div>}

      {tab === "feed" && (
        <div className="grid-2">
          <section className="panel">
            <h2>Ao vivo</h2>
            {live.length === 0 && <p className="muted">Aguardando reconhecimentos...</p>}
            {live.map((item, i) => (
              <div className="feed-item" key={`${item.at}-${i}`}>
                <strong>{item.text}</strong>
                <div className="muted">{new Date(item.at).toLocaleString("pt-BR")}</div>
              </div>
            ))}
          </section>
          <section className="panel">
            <h2>Histórico recente</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Cliente</th>
                  <th>Estação</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td>{new Date(e.created_at).toLocaleString("pt-BR")}</td>
                    <td>{e.customer_name || "—"}</td>
                    <td>{e.station_name || "—"}</td>
                    <td>{e.status === "matched" ? `${(e.score * 100).toFixed(0)}%` : e.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}

      {tab === "clientes" && (
        <div className="grid-2">
          <section className="panel">
            <h2>Novo VIP</h2>
            <form onSubmit={createCustomer}>
              <div className="field">
                <label>Nome</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="field">
                <label>WhatsApp</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Nível</label>
                <select
                  value={form.level}
                  onChange={(e) => setForm({ ...form, level: e.target.value })}
                >
                  <option value="bronze">Bronze</option>
                  <option value="prata">Prata</option>
                  <option value="ouro">Ouro</option>
                </select>
              </div>
              <div className="field">
                <label>Notas</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
              <label className="row">
                <input
                  type="checkbox"
                  checked={form.consent}
                  onChange={(e) => setForm({ ...form, consent: e.target.checked })}
                />
                Consentimento LGPD (biometria)
              </label>
              <div style={{ marginTop: "0.75rem" }}>
                <button className="btn" type="submit">
                  Cadastrar
                </button>
              </div>
            </form>

            <h3 style={{ marginTop: "1.5rem" }}>Lista</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Nível</th>
                  <th>Pts</th>
                  <th>Faces</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => setSelected(c)}>
                    <td>{c.name}</td>
                    <td>
                      <span className={`tag ${c.level}`}>{c.level}</span>
                    </td>
                    <td>{c.points}</td>
                    <td>{c.face_samples ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="panel">
            <h2>Enroll facial</h2>
            {!selected && <p className="muted">Selecione um cliente na lista.</p>}
            {selected && (
              <>
                <p>
                  <strong>{selected.name}</strong>{" "}
                  <span className={`tag ${selected.level}`}>{selected.level}</span> · {selected.points}{" "}
                  pts · {selected.face_samples ?? 0} amostras
                </p>
                <div className="video-wrap">
                  <video ref={videoRef} muted playsInline />
                </div>
                <div className="row" style={{ marginTop: "0.75rem" }}>
                  <button className="btn" type="button" onClick={() => startCam().catch((e) => setError(e.message))}>
                    Ligar câmera
                  </button>
                  <button className="btn" type="button" onClick={() => enrollFace().catch((e) => setEnrollMsg(e.message))}>
                    Capturar amostra
                  </button>
                  <button className="btn ghost" type="button" onClick={stopCam}>
                    Parar
                  </button>
                </div>
                {enrollMsg && <p>{enrollMsg}</p>}
                <p className="muted">Capture 3–5 ângulos com boa luz.</p>
                <div className="row" style={{ marginTop: "0.75rem" }}>
                  <button
                    className="btn"
                    type="button"
                    onClick={() =>
                      api(`/api/customers/${selected.id}/points`, {
                        method: "POST",
                        body: JSON.stringify({ amountReais: 50, reason: "Ajuste admin R$50" }),
                      })
                        .then(refresh)
                        .catch((e) => setError(e.message))
                    }
                  >
                    +50 pts (R$50)
                  </button>
                  <button
                    className="btn danger"
                    type="button"
                    onClick={() => {
                      if (!confirm("Excluir cliente e embeddings?")) return;
                      api(`/api/customers/${selected.id}`, { method: "DELETE" })
                        .then(() => {
                          setSelected(null);
                          return refresh();
                        })
                        .catch((e) => setError(e.message));
                    }}
                  >
                    Excluir
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {tab === "estacoes" && (
        <div className="grid-2">
          <section className="panel">
            <h2>Estações</h2>
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                api<Station>("/api/stations", {
                  method: "POST",
                  body: JSON.stringify({ name: stationName }),
                })
                  .then(async (s) => {
                    setStationName("");
                    alert(`Estação criada.\nNome: ${s.name}\nToken:\n${s.token}\n\nCole o token na página da estação.`);
                    await refresh();
                  })
                  .catch((err) => setError(err.message));
              }}
            >
              <input
                placeholder="Nome (ex: Balcão 1)"
                value={stationName}
                onChange={(e) => setStationName(e.target.value)}
                required
              />
              <button className="btn" type="submit">
                Criar
              </button>
            </form>
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Status</th>
                  <th>IP</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {stations.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>
                      <span className={`status-pill ${onlineMap.has(s.id) || s.online ? "ok" : "bad"}`}>
                        {onlineMap.has(s.id) || s.online ? "online" : "offline"}
                      </span>
                    </td>
                    <td>{s.last_ip || "—"}</td>
                    <td className="row">
                      <button
                        className="btn ghost"
                        type="button"
                        onClick={() =>
                          api(`/api/stations/${s.id}/command`, {
                            method: "POST",
                            body: JSON.stringify({ command: "message", text: "Olá da central!" }),
                          })
                        }
                      >
                        Msg
                      </button>
                      <button
                        className="btn ghost"
                        type="button"
                        onClick={() =>
                          api(`/api/stations/${s.id}/command`, {
                            method: "POST",
                            body: JSON.stringify({ command: "reload" }),
                          })
                        }
                      >
                        Reload
                      </button>
                      <button
                        className="btn ghost"
                        type="button"
                        onClick={() =>
                          api(`/api/stations/${s.id}/command`, {
                            method: "POST",
                            body: JSON.stringify({ command: "lock_screen" }),
                          })
                        }
                      >
                        Lock
                      </button>
                      <button
                        className="btn danger"
                        type="button"
                        onClick={() => {
                          if (!confirm("Remover estação?")) return;
                          api(`/api/stations/${s.id}`, { method: "DELETE" })
                            .then(refresh)
                            .catch((e) => setError(e.message));
                        }}
                      >
                        Del
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="panel">
            <h2>Comando global</h2>
            <div className="row">
              <button
                className="btn"
                onClick={() =>
                  api("/api/stations/command-all", {
                    method: "POST",
                    body: JSON.stringify({ command: "message", text: "Aviso da central" }),
                  })
                }
              >
                Mensagem p/ todos
              </button>
              <button
                className="btn"
                onClick={() =>
                  api("/api/stations/command-all", {
                    method: "POST",
                    body: JSON.stringify({ command: "reload" }),
                  })
                }
              >
                Reload todos
              </button>
              <button
                className="btn danger"
                onClick={() =>
                  api("/api/stations/command-all", {
                    method: "POST",
                    body: JSON.stringify({ command: "lock_screen" }),
                  })
                }
              >
                Lock todos
              </button>
              <button
                className="btn"
                onClick={() =>
                  api("/api/stations/command-all", {
                    method: "POST",
                    body: JSON.stringify({ command: "unlock_screen" }),
                  })
                }
              >
                Unlock todos
              </button>
            </div>
          </section>
        </div>
      )}

      {tab === "sessoes" && (
        <div className="grid-2">
          <section className="panel">
            <h2>Ativas agora</h2>
            {(sessionStats?.active?.length ?? 0) === 0 && (
              <p className="muted">Nenhuma máquina liberada no momento.</p>
            )}
            <table className="table">
              <thead>
                <tr>
                  <th>VIP</th>
                  <th>PC</th>
                  <th>Tempo</th>
                  <th>Início</th>
                </tr>
              </thead>
              <tbody>
                {(sessionStats?.active || []).map((s) => (
                  <tr key={s.id}>
                    <td>{s.customer_name}</td>
                    <td>{s.station_name}</td>
                    <td>{formatDuration(s.seconds_total)}</td>
                    <td>{new Date(s.started_at).toLocaleString("pt-BR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3>Hoje por VIP</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Nível</th>
                  <th>Horas</th>
                  <th>Sessões</th>
                </tr>
              </thead>
              <tbody>
                {(sessionStats?.byCustomer || []).map((r) => (
                  <tr key={r.customer_id}>
                    <td>{r.customer_name}</td>
                    <td>
                      <span className={`tag ${r.customer_level}`}>{r.customer_level}</span>
                    </td>
                    <td>{formatDuration(r.seconds_total)}</td>
                    <td>{r.sessions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="panel">
            <h2>Hoje por máquina</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Estação</th>
                  <th>Horas</th>
                  <th>Sessões</th>
                </tr>
              </thead>
              <tbody>
                {(sessionStats?.byStation || []).map((r) => (
                  <tr key={r.station_id}>
                    <td>{r.station_name}</td>
                    <td>{formatDuration(r.seconds_total)}</td>
                    <td>{r.sessions}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3>Histórico recente</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>VIP</th>
                  <th>PC</th>
                  <th>Duração</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td>{s.customer_name}</td>
                    <td>{s.station_name}</td>
                    <td>{formatDuration(s.seconds_total)}</td>
                    <td>{s.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}

      {tab === "recompensas" && (
        <div className="grid-2">
          <section className="panel">
            <h2>Nova recompensa</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                api("/api/rewards", {
                  method: "POST",
                  body: JSON.stringify(rewardForm),
                })
                  .then(() => {
                    setRewardForm({ title: "", description: "", costPoints: 50 });
                    return refresh();
                  })
                  .catch((err) => setError(err.message));
              }}
            >
              <div className="field">
                <label>Título</label>
                <input
                  required
                  value={rewardForm.title}
                  onChange={(e) => setRewardForm({ ...rewardForm, title: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Descrição</label>
                <input
                  value={rewardForm.description}
                  onChange={(e) => setRewardForm({ ...rewardForm, description: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Custo em pontos</label>
                <input
                  type="number"
                  min={1}
                  value={rewardForm.costPoints}
                  onChange={(e) =>
                    setRewardForm({ ...rewardForm, costPoints: Number(e.target.value) })
                  }
                />
              </div>
              <button className="btn" type="submit">
                Salvar
              </button>
            </form>
          </section>
          <section className="panel">
            <h2>Catálogo</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Pontos</th>
                  <th>Ativa</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rewards.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.title}</strong>
                      <div className="muted">{r.description}</div>
                    </td>
                    <td>{r.cost_points}</td>
                    <td>{r.active ? "sim" : "não"}</td>
                    <td className="row">
                      <button
                        className="btn ghost"
                        type="button"
                        onClick={() =>
                          api(`/api/rewards/${r.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({ active: !r.active }),
                          })
                            .then(refresh)
                            .catch((e) => setError(e.message))
                        }
                      >
                        {r.active ? "Desativar" : "Ativar"}
                      </button>
                      <button
                        className="btn danger"
                        type="button"
                        onClick={() =>
                          api(`/api/rewards/${r.id}`, { method: "DELETE" })
                            .then(refresh)
                            .catch((e) => setError(e.message))
                        }
                      >
                        Del
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}

      {tab === "config" && (
        <section className="panel" style={{ maxWidth: 480 }}>
          <h2>Configurações</h2>
          <div className="field">
            <label>Limiar de match facial (0.1–0.99)</label>
            <input
              type="number"
              step="0.01"
              min={0.1}
              max={0.99}
              value={settings.faceMatchThreshold}
              onChange={(e) =>
                setSettings({ ...settings, faceMatchThreshold: Number(e.target.value) })
              }
            />
          </div>
          <div className="field">
            <label>Pontos por R$ 1</label>
            <input
              type="number"
              step="0.1"
              min={0.01}
              value={settings.pointsPerReal}
              onChange={(e) => setSettings({ ...settings, pointsPerReal: Number(e.target.value) })}
            />
          </div>
          <button
            className="btn"
            type="button"
            onClick={() =>
              api("/api/settings", {
                method: "PUT",
                body: JSON.stringify(settings),
              })
                .then((s) => setSettings(s as typeof settings))
                .catch((e) => setError(e.message))
            }
          >
            Salvar
          </button>
        </section>
      )}
    </div>
  );
}
