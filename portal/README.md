# Portal do cliente (Vercel)

Front Vite + React. A API Fastify continua no PC da loja (ou VPS), acessível por HTTPS público.

## Desenvolvimento local

```bash
cd portal
npm install
# API local (default):
export VITE_API_URL=http://127.0.0.1:8787
npm run dev
```

Abre em `http://localhost:5175`.

## Deploy na Vercel

1. Importe a pasta `portal/` (ou o monorepo com Root Directory = `portal`).
2. Build: `npm run build` · Output: `dist`
3. Variável de ambiente:
   - `VITE_API_URL` = URL HTTPS pública da API (ex.: `https://api.seudominio.com`)

Na API da loja, configure CORS:

```bash
export PORTAL_ORIGIN=https://seu-portal.vercel.app
```

## Expor a API (Cloudflare Tunnel)

Ver `docs/portal-api-tunnel.md` na raiz do monorepo.

## Backlog restante

Ver [`docs/arquivo/portal-backlog.md`](../docs/arquivo/portal-backlog.md) (histórico) e [`docs/NEGOCIO-GEEK.md`](../docs/NEGOCIO-GEEK.md) / [`docs/PENDENCIAS.md`](../docs/PENDENCIAS.md).
