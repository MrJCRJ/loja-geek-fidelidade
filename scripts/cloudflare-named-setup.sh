#!/usr/bin/env bash
# Configura túnel Cloudflare NOMEADO (URL fixa) para a API :8787
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_PORT="${API_PORT:-8787}"
TUNNEL_NAME="${CLOUDFLARED_TUNNEL_NAME:-loja-geek-api}"
HOSTNAME="${CLOUDFLARED_HOSTNAME:-}"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "Instale cloudflared: sudo apt install cloudflared"
  exit 1
fi

CF_HOME="${HOME}/.cloudflared"
mkdir -p "$CF_HOME"

echo "=== 1/4 Login Cloudflare (abre o navegador) ==="
if [[ ! -f "$CF_HOME/cert.pem" ]]; then
  cloudflared tunnel login
else
  echo "cert.pem já existe em $CF_HOME"
fi

echo ""
echo "=== 2/4 Criar túnel '$TUNNEL_NAME' (se ainda não existir) ==="
if cloudflared tunnel list 2>/dev/null | grep -q "$TUNNEL_NAME"; then
  echo "Túnel '$TUNNEL_NAME' já existe."
else
  cloudflared tunnel create "$TUNNEL_NAME"
fi

TUNNEL_ID="$(cloudflared tunnel list 2>/dev/null | awk -v n="$TUNNEL_NAME" '$0 ~ n { print $1; exit }')"
if [[ -z "$TUNNEL_ID" ]]; then
  echo "Não achei UUID do túnel. Rode: cloudflared tunnel list"
  exit 1
fi

CRED="$CF_HOME/${TUNNEL_ID}.json"
if [[ ! -f "$CRED" ]]; then
  echo "Arquivo de credenciais não encontrado: $CRED"
  exit 1
fi

if [[ -z "$HOSTNAME" ]]; then
  echo ""
  read -r -p "Hostname público (ex.: api.sualoja.com): " HOSTNAME
fi
HOSTNAME="${HOSTNAME#https://}"
HOSTNAME="${HOSTNAME#http://}"
HOSTNAME="${HOSTNAME%/}"

if [[ -z "$HOSTNAME" ]]; then
  echo "Informe o hostname (domínio no Cloudflare)."
  exit 1
fi

echo ""
echo "=== 3/4 DNS → túnel ==="
cloudflared tunnel route dns "$TUNNEL_NAME" "$HOSTNAME" || true

echo ""
echo "=== 4/4 config.yml ==="
CFG="$CF_HOME/config.yml"
cat > "$CFG" <<EOF
tunnel: ${TUNNEL_ID}
credentials-file: ${CRED}

ingress:
  - hostname: ${HOSTNAME}
    service: http://127.0.0.1:${API_PORT}
  - service: http_status:404
EOF

echo "Gravado: $CFG"
echo ""
echo "Pronto. No GeekCentral → Config → Portal / Cloudflare:"
echo "  Modo: Nomeado"
echo "  Nome: $TUNNEL_NAME"
echo "  URL pública: https://${HOSTNAME}"
echo ""
echo "Teste manual: cloudflared tunnel run $TUNNEL_NAME"
