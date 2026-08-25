import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getCustomer } from "./customers.js";

type JwtPayload = { role?: string; sub?: string; customerId?: string };

export async function portalCustomerGuard(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
    const payload = req.user as JwtPayload;
    if (payload.role !== "customer" || !payload.customerId) {
      reply.code(401).send({ error: "Token de cliente inválido" });
      return null;
    }
    const customer = getCustomer(payload.customerId);
    if (!customer) {
      reply.code(401).send({ error: "Cliente não encontrado" });
      return null;
    }
    return payload.customerId;
  } catch {
    reply.code(401).send({ error: "Não autorizado" });
    return null;
  }
}

export function signPortalToken(app: FastifyInstance, customerId: string) {
  return app.jwt.sign({ role: "customer", customerId, sub: customerId }, { expiresIn: "30d" });
}
