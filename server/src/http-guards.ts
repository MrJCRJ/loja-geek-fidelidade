import type { FastifyReply, FastifyRequest } from "fastify";
import { getStationByToken } from "./stations.js";

export type StaffRole = "admin" | "clerk";

export function getAuthRole(req: FastifyRequest): StaffRole | null {
  const role = (req.user as { role?: string } | undefined)?.role;
  if (role === "clerk" || role === "admin") return role;
  return null;
}

export async function adminGuard(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
    return true;
  } catch {
    reply.code(401).send({ error: "Não autorizado" });
    return false;
  }
}

/** Dono da loja — Config, estações e LGPD. Ajudante (clerk) não passa. */
export async function ownerGuard(req: FastifyRequest, reply: FastifyReply) {
  if (!(await adminGuard(req, reply))) return false;
  if (getAuthRole(req) !== "admin") {
    reply.code(403).send({
      error: "Modo balcão: só leitura / caixa. Peça ao dono para alterar Config.",
      code: "clerk_readonly",
    });
    return false;
  }
  return true;
}

export function stationFromHeader(req: FastifyRequest) {
  const token = String(req.headers["x-station-token"] || "");
  if (!token) return null;
  return getStationByToken(token) || null;
}
