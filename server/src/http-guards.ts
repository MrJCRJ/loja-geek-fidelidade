import type { FastifyReply, FastifyRequest } from "fastify";
import { getStationByToken } from "./stations.js";

export async function adminGuard(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
    return true;
  } catch {
    reply.code(401).send({ error: "Não autorizado" });
    return false;
  }
}

export function stationFromHeader(req: FastifyRequest) {
  const token = String(req.headers["x-station-token"] || "");
  if (!token) return null;
  return getStationByToken(token) || null;
}
