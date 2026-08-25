#!/usr/bin/env bash
# Smoke test — verifica serviços rodando (face + API + web).
# Uso: bash scripts/smoke-test.sh
# Env: API_URL (default http://127.0.0.1:8787), WEB_URL (default http://127.0.0.1:5173),
#      FACE_URL (default http://127.0.0.1:8100), ADMIN_PASSWORD (default admin123)

set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:8787}"
WEB_URL="${WEB_URL:-http://127.0.0.1:5173}"
FACE_URL="${FACE_URL:-http://127.0.0.1:8100}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

pass=0
fail=0

check() {
  local name="$1"
  shift
  if "$@"; then
    echo -e "${GREEN}✓${NC} $name"
    pass=$((pass + 1))
  else
    echo -e "${RED}✗${NC} $name"
    fail=$((fail + 1))
  fi
}

echo "=== Smoke Test — Loja Geek Fidelidade ==="
echo "API:  $API_URL"
echo "Web:  $WEB_URL"
echo "Face: $FACE_URL"
echo ""

check "Face service /health" bash -c "curl -sf '$FACE_URL/health' | grep -q '\"ok\"'"

check "API /api/health" bash -c "curl -sf '$API_URL/api/health' | grep -q '\"ok\"'"

check "Web responde (Vite)" bash -c "curl -sf '$WEB_URL/' | grep -q 'id=\"root\"'"

TOKEN=$(curl -sf -X POST "$API_URL/api/admin/login" \
  -H 'Content-Type: application/json' \
  -d "{\"password\":\"$ADMIN_PASSWORD\"}" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

check "Admin login retorna token" test -n "$TOKEN"

check "Admin /api/admin/me" bash -c "curl -sf '$API_URL/api/admin/me' -H 'Authorization: Bearer $TOKEN' | grep -q '\"role\":\"admin\"'"

check "Lista clientes (admin)" bash -c "curl -sf '$API_URL/api/customers' -H 'Authorization: Bearer $TOKEN' | grep -q '\\['"

check "Lista recompensas" bash -c "curl -sf '$API_URL/api/rewards' | grep -qE 'Pin exclusivo|rw_pin|title'"

STATION=$(curl -sf -X POST "$API_URL/api/stations/claim" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Smoke-Test","sharedSecret":"loja-geek-station-secret"}')

STATION_TOKEN=$(echo "$STATION" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

check "Claim estação retorna token" test -n "$STATION_TOKEN"

check "Heartbeat estação" bash -c "curl -sf -X POST '$API_URL/api/stations/heartbeat' -H 'Content-Type: application/json' -d '{\"token\":\"$STATION_TOKEN\"}' | grep -q '\"ok\":true'"

INVALID_B64=$(python3 -c 'print("a"*64)')

check "Face /embed rejeita imagem inválida graciosamente" bash -c "curl -sf -X POST '$FACE_URL/embed' -H 'Content-Type: application/json' -d '{\"image_base64\":\"$INVALID_B64\"}' | grep -q '\"ok\":false'"

echo ""
echo "Resultado: $pass passou, $fail falhou"

if [ "$fail" -gt 0 ]; then
  exit 1
fi

echo -e "${GREEN}Todos os checks passaram.${NC}"
