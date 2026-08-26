import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
dotenv.config({ path: path.join(root, ".env") });
dotenv.config();

export const config = {
  get port() {
    return Number(process.env.PORT || 8787);
  },
  get host() {
    return process.env.HOST || "0.0.0.0";
  },
  get databasePath() {
    const raw = process.env.DATABASE_PATH || path.join(root, "data/fidelidade.db");
    return path.isAbsolute(raw) ? raw : path.resolve(root, raw);
  },
  get adminPassword() {
    return process.env.ADMIN_PASSWORD || "admin123";
  },
  get faceServiceUrl() {
    return (process.env.FACE_SERVICE_URL || "http://127.0.0.1:8100").replace(/\/$/, "");
  },
  /** Token compartilhado API ↔ face-service. Vazio = sem auth (só LAN/dev). */
  get faceServiceToken() {
    return (process.env.FACE_SERVICE_TOKEN || "").trim();
  },
  get faceMatchThreshold() {
    return Number(process.env.FACE_MATCH_THRESHOLD || 0.38);
  },
  get pointsPerReal() {
    return Number(process.env.POINTS_PER_REAL || 1);
  },
  get stationSharedSecret() {
    return process.env.STATION_SHARED_SECRET || "loja-geek-station-secret";
  },
  get jwtSecret() {
    return process.env.JWT_SECRET || "troque-este-segredo-em-producao";
  },
  get portalOrigin() {
    // Origens do portal Vercel (separadas por vírgula). Vazio = CORS aberto (dev).
    return (process.env.PORTAL_ORIGIN || "").trim();
  },
  /** off | demo (MP sandbox, sem crédito) | live (cobrança real). */
  get portalCheckoutMode(): "off" | "demo" | "live" {
    if (process.env.PORTAL_CHECKOUT_ENABLED === "1") return "live";
    if (process.env.PORTAL_PAYMENT_DEMO === "1") return "demo";
    return "off";
  },
  /** Compras/assinatura no portal (demo ou live). */
  get portalCheckoutEnabled() {
    return this.portalCheckoutMode !== "off";
  },
  /** URL pública do portal — back_urls do Checkout Pro. */
  get portalPublicUrl() {
    return (process.env.PORTAL_PUBLIC_URL || "https://loja-geek-portal.vercel.app").replace(/\/$/, "");
  },
  get subscriptionMonthlyPrice() {
    return Number(process.env.SUBSCRIPTION_MONTHLY_PRICE || 49.9);
  },
  get mpAccessToken() {
    return (process.env.MP_ACCESS_TOKEN || "").trim();
  },
  get mpWebhookSecret() {
    return (process.env.MP_WEBHOOK_SECRET || "").trim();
  },
  /** Exige segredos não-default. Ativo com STRICT_SECRETS=1 ou NODE_ENV=production. */
  get strictSecrets() {
    return process.env.STRICT_SECRETS === "1" || process.env.NODE_ENV === "production";
  },
  get staticDir() {
    if (!process.env.STATIC_DIR) return null;
    const p = process.env.STATIC_DIR;
    return path.isAbsolute(p) ? p : path.resolve(root, p);
  },
  get unitName() {
    return (process.env.UNIT_NAME || "Unidade 1").trim();
  },
  get unitId() {
    return (process.env.UNIT_ID || "unit-1").trim();
  },
  get sentryDsn() {
    return (process.env.SENTRY_DSN || "").trim();
  },
  get vapidPublicKey() {
    return (process.env.VAPID_PUBLIC_KEY || "").trim();
  },
  get vapidPrivateKey() {
    return (process.env.VAPID_PRIVATE_KEY || "").trim();
  },
  get vapidSubject() {
    return (process.env.VAPID_SUBJECT || "mailto:admin@localhost").trim();
  },
};
