import type { FastifyReply, FastifyRequest } from "fastify";
import { isLanControlHost, requestHost } from "./request-scope.js";
import { getStationByToken } from "./stations.js";

export type StaffRole = "admin" | "clerk";

export type AuthActor = {
  role: StaffRole;
  userId?: string;
  username?: string;
  displayName?: string;
  bootstrap?: boolean;
};

export function getAuthPayload(req: FastifyRequest): AuthActor | null {
  const u = req.user as AuthActor | undefined;
  if (!u || (u.role !== "clerk" && u.role !== "admin")) return null;
  return u;
}

export function getAuthRole(req: FastifyRequest): StaffRole | null {
  return getAuthPayload(req)?.role ?? null;
}

export function actorLabel(req: FastifyRequest): string {
  const a = getAuthPayload(req);
  if (!a) return "admin";
  if (a.displayName) return a.displayName;
  if (a.username) return a.username;
  if (a.bootstrap) return a.role === "clerk" ? "balcão (senha antiga)" : "dono (senha antiga)";
  return a.role;
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

export async function requireLanWrite(req: FastifyRequest, reply: FastifyReply) {
  if (isLanControlHost(requestHost(req))) return true;
  reply.code(403).send({
    error: "De casa só dá para ver. Controle, caixa e cadastro só na loja (geek.local).",
    code: "remote_readonly",
  });
  return false;
}

/** Funcionário ou dono, só na LAN — vendas, destrava, cadastro. */
export async function staffWriteGuard(req: FastifyRequest, reply: FastifyReply) {
  if (!(await adminGuard(req, reply))) return false;
  return requireLanWrite(req, reply);
}

/** Dono, só na LAN — Config, equipe, LGPD. */
export async function ownerWriteGuard(req: FastifyRequest, reply: FastifyReply) {
  if (!(await ownerGuard(req, reply))) return false;
  return requireLanWrite(req, reply);
}

export function stationFromHeader(req: FastifyRequest) {
  const token = String(req.headers["x-station-token"] || "");
  if (!token) return null;
  return getStationByToken(token) || null;
}
