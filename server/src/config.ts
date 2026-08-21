import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
dotenv.config({ path: path.join(root, ".env") });
dotenv.config();

export const config = {
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || "0.0.0.0",
  databasePath: path.resolve(process.env.DATABASE_PATH || path.join(root, "data/fidelidade.db")),
  adminPassword: process.env.ADMIN_PASSWORD || "admin123",
  faceServiceUrl: (process.env.FACE_SERVICE_URL || "http://127.0.0.1:8100").replace(/\/$/, ""),
  faceMatchThreshold: Number(process.env.FACE_MATCH_THRESHOLD || 0.45),
  pointsPerReal: Number(process.env.POINTS_PER_REAL || 1),
  stationSharedSecret: process.env.STATION_SHARED_SECRET || "loja-geek-station-secret",
  jwtSecret: process.env.JWT_SECRET || "troque-este-segredo-em-producao",
  staticDir: process.env.STATIC_DIR ? path.resolve(process.env.STATIC_DIR) : null,
};
