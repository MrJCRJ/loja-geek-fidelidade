import type { FastifyInstance } from "fastify";
import { registerPortalAccountRoutes } from "./portal-account-routes.js";
import { registerPortalCheckoutRoutes } from "./portal-checkout-routes.js";
import { registerPortalEnrollRoutes } from "./portal-enroll-routes.js";
import { registerPortalPublicRoutes } from "./portal-public-routes.js";

export async function registerPortalRoutes(app: FastifyInstance) {
  await registerPortalPublicRoutes(app);
  await registerPortalAccountRoutes(app);
  await registerPortalCheckoutRoutes(app);
  await registerPortalEnrollRoutes(app);
}
