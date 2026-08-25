#!/usr/bin/env bash
# Túnel HTTPS da API da loja para o portal Vercel.
# Uso rápido (URL muda a cada run):
#   bash scripts/portal-tunnel.sh
# Túnel nomeado (URL fixa — produção):
#   export CLOUDFLARED_TUNNEL_NAME=loja-geek-api
#   bash scripts/portal-tunnel.sh

set -euo pipefail
API_URL="${API_URL:-http://127.0.0.1:8787}"
NAME="${CLOUDFLARED_TUNNEL_NAME:-}"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "Instale cloudflared: ver docs/portal-api-tunnel.md"
  exit 1
fi

# Health check local
if ! curl -sf --max-time 3 "${API_URL}/api/portal/health" >/dev/null 2>&1 \
  && ! curl -sf --max-time 3 "${API_URL}/api/health" >/dev/null 2>&1; then
  echo "AVISO: API não respondeu em ${API_URL} — suba a loja antes (linux-loja.sh / API)."
fi

if [[ -n "$NAME" ]]; then
  echo "Rodando túnel nomeado: $NAME → $API_URL"
  exec cloudflared tunnel run "$NAME"
fi

echo "Túnel rápido → $API_URL"
echo "Copie a URL https://….trycloudflare.com e atualize VITE_API_URL na Vercel + redeploy."
echo "Para URL fixa: CLOUDFLARED_TUNNEL_NAME=loja-geek-api bash scripts/portal-tunnel.sh"
exec cloudflared tunnel --url "$API_URL" --no-autoupdate
