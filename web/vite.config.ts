import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const certDir = path.resolve(__dirname, "../deploy/certs");
const mobile = process.env.VITE_MOBILE === "1";
const hasCerts =
  fs.existsSync(path.join(certDir, "cert.pem")) && fs.existsSync(path.join(certDir, "key.pem"));

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: mobile ? true : undefined,
    https:
      mobile && hasCerts
        ? {
            key: fs.readFileSync(path.join(certDir, "key.pem")),
            cert: fs.readFileSync(path.join(certDir, "cert.pem")),
          }
        : undefined,
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/ws": {
        target: "ws://127.0.0.1:8787",
        ws: true,
      },
    },
  },
});
