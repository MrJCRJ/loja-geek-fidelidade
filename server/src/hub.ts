import type { WebSocket } from "ws";

export type HubClient = {
  socket: WebSocket;
  role: "admin" | "station";
  stationId?: string;
  stationName?: string;
};

type HubMessage = Record<string, unknown>;

const clients = new Set<HubClient>();

/** Último status conhecido por estação (para Admin recém-conectado). */
const lastStationStatus = new Map<string, HubMessage>();

export function addClient(client: HubClient) {
  clients.add(client);
  client.socket.on("close", () => {
    clients.delete(client);
    if (client.role === "station" && client.stationId) {
      broadcastAdmins({
        type: "station_offline",
        station: { id: client.stationId, name: client.stationName },
        at: new Date().toISOString(),
      });
    }
  });
  client.socket.on("error", () => clients.delete(client));
}

export function broadcast(message: HubMessage, filter?: (c: HubClient) => boolean) {
  const raw = JSON.stringify(message);
  for (const client of clients) {
    if (filter && !filter(client)) continue;
    if (client.socket.readyState === 1) {
      client.socket.send(raw);
    }
  }
}

export function broadcastAdmins(message: HubMessage) {
  broadcast(message, (c) => c.role === "admin");
}

export function sendToStation(stationId: string, message: HubMessage) {
  broadcast(message, (c) => c.role === "station" && c.stationId === stationId);
}

export function sendCommandToStation(stationId: string, command: string, payload: HubMessage = {}) {
  sendToStation(stationId, { type: "command", command, ...payload });
}

export function sendCommandToAllStations(command: string, payload: HubMessage = {}) {
  broadcast({ type: "command", command, ...payload }, (c) => c.role === "station");
}

export function listConnectedStations() {
  return [...clients]
    .filter((c) => c.role === "station" && c.stationId)
    .map((c) => ({ stationId: c.stationId!, stationName: c.stationName || c.stationId! }));
}

export function setStationStatus(stationId: string, status: HubMessage) {
  lastStationStatus.set(stationId, status);
}

export function getStationStatus(stationId: string) {
  return lastStationStatus.get(stationId) || null;
}

export function getAllStationStatuses() {
  return Object.fromEntries(lastStationStatus.entries());
}
