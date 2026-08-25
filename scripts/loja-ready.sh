#!/usr/bin/env bash
# Checklist operacional: API, face, segredos, Pix e (opcional) túnel.
# Uso: bash scripts/loja-ready.sh
# Não sobe serviços — só valida o que já está rodando / configurado.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

API_URL="${API_URL:-http://127.0.0.1:8787}"
FACE_URL="${FACE_SERVICE_URL:-http://127.0.0.1:8100}"
PUBLIC_API_URL="${PUBLIC_API_URL:-}"
ok=0
warn=0
fail=0

pass() { echo "  [OK] $*"; ok=$((ok + 1)); }
warn_() { echo "  [AVISO] $*"; warn=$((warn + 1)); }
fail_() { echo "  [FALHA] $*"; fail=$((fail + 1)); }

# Carrega .env se existir (sem exportar tudo no shell pai de forma perigosa)
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

echo "=== Loja Geek — checklist loja-ready ==="
echo "API local: $API_URL"
echo

echo "1) Face-service"
if curl -sf --max-time 3 "$FACE_URL/health" >/dev/null 2>&1; then
  pass "Face-service respondeu em $FACE_URL/health"
else
  fail_ "Face-service offline em $FACE_URL"
fi

echo
echo "2) API local"
health_json="$(curl -sf --max-time 5 "$API_URL/api/health" 2>/dev/null || true)"
if [[ -n "$health_json" ]]; then
  pass "API /api/health respondeu"
  if echo "$health_json" | grep -q '"faceService"[[:space:]]*:[[:space:]]*true'; then
    pass "API reporta faceService: true"
  else
    warn_ "API up mas faceService não é true — ver FACE_SERVICE_URL"
  fi
else
  fail_ "API não respondeu em $API_URL/api/health"
fi

portal_health="$(curl -sf --max-time 5 "$API_URL/api/portal/health" 2>/dev/null || true)"
if [[ -n "$portal_health" ]]; then
  pass "Portal health ok"
else
  warn_ "GET /api/portal/health falhou (portal pode ficar offline)"
fi

echo
echo "3) Segredos / produção"
strict="${STRICT_SECRETS:-}"
node_env="${NODE_ENV:-}"
if [[ "$strict" == "1" || "$node_env" == "production" ]]; then
  pass "STRICT_SECRETS/NODE_ENV=production ativo"
else
  warn_ "STRICT_SECRETS não é 1 e NODE_ENV!=production — defaults inseguros ainda permitidos"
fi

check_secret() {
  local name="$1" val="${2:-}" bad="$3"
  if [[ -z "$val" ]]; then
    warn_ "$name não definido (usará default de desenvolvimento)"
  elif [[ "$val" == "$bad" ]]; then
    fail_ "$name ainda é o valor default inseguro ($bad)"
  else
    pass "$name definido (não-default)"
  fi
}

check_secret "ADMIN_PASSWORD" "${ADMIN_PASSWORD:-}" "admin123"
check_secret "JWT_SECRET" "${JWT_SECRET:-}" "troque-este-segredo-em-producao"
check_secret "STATION_SHARED_SECRET" "${STATION_SHARED_SECRET:-}" "loja-geek-station-secret"

if [[ -n "${PORTAL_ORIGIN:-}" ]]; then
  pass "PORTAL_ORIGIN=$PORTAL_ORIGIN"
else
  warn_ "PORTAL_ORIGIN vazio — CORS aberto (só ok em dev)"
fi

echo
echo "4) Mercado Pago"
if [[ -n "${MP_ACCESS_TOKEN:-}" ]]; then
  pass "MP_ACCESS_TOKEN configurado (Pix real)"
else
  warn_ "MP_ACCESS_TOKEN ausente — checkout em modo stub"
fi

echo
echo "5) Túnel público (opcional)"
if [[ -n "$PUBLIC_API_URL" ]]; then
  if curl -sf --max-time 8 "$PUBLIC_API_URL/api/health" >/dev/null 2>&1; then
    pass "URL pública respondeu: $PUBLIC_API_URL"
  else
    fail_ "PUBLIC_API_URL não respondeu: $PUBLIC_API_URL"
  fi
elif [[ -n "${CLOUDFLARED_TUNNEL_NAME:-}" ]]; then
  warn_ "CLOUDFLARED_TUNNEL_NAME=${CLOUDFLARED_TUNNEL_NAME} — confira se o túnel está rodando (portal-tunnel.sh)"
  warn_ "Para validar HTTPS: PUBLIC_API_URL=https://api.seudominio.com bash scripts/loja-ready.sh"
else
  warn_ "Sem CLOUDFLARED_TUNNEL_NAME / PUBLIC_API_URL — configure túnel nomeado (docs/loja-ready.md)"
fi

echo
echo "=== Resultado: $ok ok · $warn avisos · $fail falhas ==="
echo "Detalhes: docs/loja-ready.md"
if [[ "$fail" -gt 0 ]]; then
  exit 1
fi
exit 0
