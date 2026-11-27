import { describe, expect, it } from "vitest";
import {
  buildDashboardInsights,
  buildStationCards,
  filterDashboardEvents,
} from "./dashboardInsights";

describe("dashboardInsights", () => {
  it("filtra feed ops+negócio", () => {
    const filtered = filterDashboardEvents([
      {
        id: "1",
        created_at: "2026-11-27T12:00:00.000Z",
        level: "warn",
        source: "api",
        kind: "station.ws_offline",
        message: "PC-02",
      },
      {
        id: "2",
        created_at: "2026-11-27T12:01:00.000Z",
        level: "info",
        source: "api",
        kind: "probe.resources",
        message: "x",
      },
      {
        id: "3",
        created_at: "2026-11-27T12:02:00.000Z",
        level: "info",
        source: "caixa",
        kind: "time.sale",
        message: "venda",
      },
    ]);
    expect(filtered.map((e) => e.kind)).toEqual(["station.ws_offline", "time.sale"]);
  });

  it("prioriza hora em aberto e PC offline longo", () => {
    const now = Date.parse("2026-11-27T18:00:00.000Z");
    const insights = buildDashboardInsights({
      nowMs: now,
      metrics: {
        today: { sessions: 1, hoursUsed: 0.5, salesReais: 0, activeSessions: 0 },
        week: { hoursUsed: 2, salesReais: 10, days: [] },
        inventory: { stationsOnline: 0, stationsTotal: 1 },
        openDuePending: [{ id: "d1", customerName: "jm", amountReais: 5.5 }],
      },
      stations: [
        {
          id: "pc2",
          name: "PC-02",
          online: 0,
          last_seen_at: "2026-11-27T16:00:00.000Z",
        },
      ],
      connectedIds: new Set(),
      live: {},
      events: [],
    });
    expect(insights[0].id).toBe("open-due");
    expect(insights.some((i) => i.id === "offline-station")).toBe(true);
  });

  it("monta cards livre/ocupado/offline", () => {
    const cards = buildStationCards({
      nowMs: Date.parse("2026-11-27T18:00:00.000Z"),
      stations: [
        { id: "a", name: "PC-02", online: 1, last_seen_at: "2026-11-27T17:59:00.000Z" },
        { id: "b", name: "PC-03", online: 0, last_seen_at: "2026-11-27T10:00:00.000Z" },
      ],
      connectedIds: new Set(["a"]),
      live: { a: { phase: "unlocked", customerName: "joao" } },
      activePlaceNames: new Set(),
    });
    expect(cards[0].state).toBe("online-busy");
    expect(cards[1].state).toBe("offline");
  });
});
