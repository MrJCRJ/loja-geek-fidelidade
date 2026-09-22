#!/usr/bin/env bash
# Testes Mercado Pago — API direta + integração portal geek
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
[[ -f .env ]] && set -a && source .env && set +a

API="${API_URL:-http://127.0.0.1:8787}"
MP_TOKEN="${MP_ACCESS_TOKEN:-}"

PASS=0
FAIL=0
SKIP=0
RESULTS=()

log() { echo "$*"; }

pass() {
  PASS=$((PASS + 1))
  RESULTS+=("✅ $1")
  echo "  ✅ $1"
}

fail() {
  FAIL=$((FAIL + 1))
  RESULTS+=("❌ $1 — $2")
  echo "  ❌ $1 — $2"
}

skip() {
  SKIP=$((SKIP + 1))
  RESULTS+=("⏭️  $1 — $2")
  echo "  ⏭️  $1 — $2"
}

mp_get() {
  curl -sf -H "Authorization: Bearer $MP_TOKEN" "$1"
}

mp_post() {
  curl -s -X POST -H "Authorization: Bearer $MP_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$2" "$1"
}

need_token() {
  if [[ -z "$MP_TOKEN" ]]; then
    echo "ERRO: MP_ACCESS_TOKEN não definido (.env)"
    exit 1
  fi
  if [[ ! "$MP_TOKEN" =~ ^TEST- ]]; then
    echo "AVISO: token não é TEST- (sandbox). Continuando com cuidado."
  fi
}

need_api() {
  if ! curl -sf "$API/api/health" >/dev/null 2>&1; then
    echo "ERRO: API offline em $API"
    exit 1
  fi
}

echo "═══════════════════════════════════════════════════════════"
echo "  Testes Mercado Pago — Loja Geek"
echo "  API: $API"
echo "  Token: ${MP_TOKEN:0:12}…"
echo "═══════════════════════════════════════════════════════════"

need_token
need_api

# ── 1. API Mercado Pago (direto) ─────────────────────────────
echo ""
echo "▶ 1. API Mercado Pago (credencial)"

if mp_get "https://api.mercadopago.com/v1/payment_methods" | grep -q '"visa"'; then
  pass "GET /v1/payment_methods"
else
  fail "GET /v1/payment_methods" "resposta inesperada"
fi

ME_JSON="$(mp_get "https://api.mercadopago.com/users/me" 2>/dev/null || echo '{}')"
if echo "$ME_JSON" | grep -qE '"id"|"nickname"'; then
  pass "GET /users/me (conta autenticada)"
else
  fail "GET /users/me" "$(echo "$ME_JSON" | head -c 120)"
fi

# ── 2. Usuário de teste MP ─────────────────────────────────────
echo ""
echo "▶ 2. Usuários de teste (sandbox)"

TS="$(date +%s)"
TEST_USER_JSON="$(curl -sf -X POST "https://api.mercadopago.com/users/test_user" \
  -H "Authorization: Bearer $MP_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"site_id\":\"MLB\",\"description\":\"geek-test-$TS\",\"profile\":\"buyer\"}" 2>/dev/null || echo '{}')"

TEST_USER_ID="$(echo "$TEST_USER_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null || true)"
if [[ -n "$TEST_USER_ID" && "$TEST_USER_ID" != "None" ]]; then
  pass "POST /users/test_user (buyer MLB) id=$TEST_USER_ID"
  ADD_MONEY="$(curl -s -X POST "https://api.mercadopago.com/users/test_user/$TEST_USER_ID/add_money" \
    -H "Authorization: Bearer $MP_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"amount":5000}')"
  if echo "$ADD_MONEY" | grep -qE '"id"|"balance"'; then
    pass "POST add_money (R\$ 5000 ao comprador teste)"
  else
    skip "POST add_money" "$(echo "$ADD_MONEY" | head -c 100)"
  fi
else
  skip "POST /users/test_user" "$(echo "$TEST_USER_JSON" | head -c 120)"
fi

# ── 3. Pix + Checkout Pro (API direta) ─────────────────────────
echo ""
echo "▶ 3. Pagamentos sandbox (Pix + preferência)"

EXT_REF="geek-mp-test-$TS"
PIX_JSON="$(curl -s -X POST "https://api.mercadopago.com/v1/payments" \
  -H "Authorization: Bearer $MP_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: geek-script-pix-$TS" \
  -d "{
  \"transaction_amount\": 10.00,
  \"description\": \"geek teste Pix\",
  \"payment_method_id\": \"pix\",
  \"external_reference\": \"$EXT_REF\",
  \"payer\": {\"email\": \"test_payer_${TS}@example.com\"}
}")"

PAYMENT_ID="$(echo "$PIX_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null || true)"
PIX_QR="$(echo "$PIX_JSON" | python3 -c "
import sys,json
d=json.load(sys.stdin)
tx=d.get('point_of_interaction',{}).get('transaction_data',{})
print('yes' if tx.get('qr_code') else '')
" 2>/dev/null || true)"

if [[ -n "$PAYMENT_ID" && "$PAYMENT_ID" != "None" ]]; then
  pass "POST /v1/payments (Pix) id=$PAYMENT_ID status=$(echo "$PIX_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))")"
  [[ -n "$PIX_QR" ]] && pass "Pix QR code gerado" || fail "Pix QR code" "ausente"
else
  fail "POST /v1/payments (Pix)" "$(echo "$PIX_JSON" | head -c 150)"
  PAYMENT_ID=""
fi

PREF_JSON="$(mp_post "https://api.mercadopago.com/checkout/preferences" "{
  \"items\": [{\"title\": \"geek teste checkout\", \"quantity\": 1, \"unit_price\": 10.00, \"currency_id\": \"BRL\"}],
  \"payer\": {\"email\": \"test_user_${TS}@testuser.com\"},
  \"external_reference\": \"${EXT_REF}-pref\",
  \"back_urls\": {
    \"success\": \"https://loja-geek-portal.vercel.app/checkout/return?status=success\",
    \"pending\": \"https://loja-geek-portal.vercel.app/checkout/return?status=pending\",
    \"failure\": \"https://loja-geek-portal.vercel.app/checkout/return?status=failure\"
  }
}" 2>/dev/null || echo '{}')"

PREF_ID="$(echo "$PREF_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null || true)"
SANDBOX_URL="$(echo "$PREF_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('sandbox_init_point',''))" 2>/dev/null || true)"

if [[ -n "$PREF_ID" && "$PREF_ID" != "None" ]]; then
  pass "POST /checkout/preferences id=$PREF_ID"
  [[ -n "$SANDBOX_URL" ]] && pass "sandbox_init_point presente" || skip "sandbox_init_point" "ausente"
else
  fail "POST /checkout/preferences" "$(echo "$PREF_JSON" | head -c 150)"
fi

if [[ -n "$PAYMENT_ID" ]]; then
  PAY_STATUS="$(mp_get "https://api.mercadopago.com/v1/payments/$PAYMENT_ID" 2>/dev/null || echo '{}')"
  if echo "$PAY_STATUS" | grep -q '"status"'; then
    pass "GET /v1/payments/$PAYMENT_ID (consulta status)"
  else
    fail "GET /v1/payments/$PAYMENT_ID" "$(echo "$PAY_STATUS" | head -c 100)"
  fi
fi

# ── 4. Portal geek (integração) ────────────────────────────────
echo ""
echo "▶ 4. Portal geek (API local)"

CATALOG="$(curl -sf "$API/api/portal/catalog")"
if echo "$CATALOG" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('payments',{}).get('mode')=='mercadopago' else 1)"; then
  pass "GET /api/portal/catalog → payments.mode=mercadopago"
else
  fail "GET /api/portal/catalog" "MP não ativo: $(echo "$CATALOG" | python3 -c "import sys,json; print(json.load(sys.stdin).get('payments'))" 2>/dev/null)"
fi

HEALTH="$(curl -sf "$API/api/portal/health")"
if echo "$HEALTH" | grep -q '"payments"'; then
  pass "GET /api/portal/health"
else
  fail "GET /api/portal/health" "$(echo "$HEALTH" | head -c 80)"
fi

TEST_EMAIL="mp-test-${TS}@example.com"
REG="$(curl -sf -X POST "$API/api/portal/register" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"MP Test\",\"email\":\"$TEST_EMAIL\",\"password\":\"test1234\",\"consent\":true}")"
PORTAL_TOKEN="$(echo "$REG" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || true)"

if [[ -n "$PORTAL_TOKEN" && "$PORTAL_TOKEN" != "None" ]]; then
  pass "POST /api/portal/register"
else
  # pode já existir — tenta login
  REG="$(curl -sf -X POST "$API/api/portal/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"test1234\"}" 2>/dev/null || echo '{}')"
  PORTAL_TOKEN="$(echo "$REG" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || true)"
  if [[ -n "$PORTAL_TOKEN" ]]; then
    pass "POST /api/portal/login (conta existente)"
  else
    fail "POST /api/portal/register/login" "$(echo "$REG" | head -c 120)"
  fi
fi

if [[ -n "$PORTAL_TOKEN" ]]; then
  AUTH="Authorization: Bearer $PORTAL_TOKEN"

  CHK_H="$(curl -s -X POST "$API/api/portal/checkout/hours" \
    -H "Content-Type: application/json" -H "$AUTH" \
    -d '{"amountReais":10}')"

  ORDER_ID="$(echo "$CHK_H" | python3 -c "import sys,json; d=json.load(sys.stdin); o=d.get('order') or {}; print(o.get('id',''))" 2>/dev/null || true)"
  HAS_PIX="$(echo "$CHK_H" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if d.get('pix',{}).get('qrCode') else '')" 2>/dev/null || true)"
  HAS_URL="$(echo "$CHK_H" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if d.get('checkoutUrl') else '')" 2>/dev/null || true)"
  IS_DEMO="$(echo "$CHK_H" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if d.get('demo') else '')" 2>/dev/null || true)"

  if [[ -n "$ORDER_ID" && "$ORDER_ID" != "None" ]]; then
    pass "POST /api/portal/checkout/hours order=$ORDER_ID demo=$IS_DEMO"
    [[ -n "$HAS_PIX" ]] && pass "Checkout horas → QR Pix gerado" || fail "Checkout horas Pix" "sem qrCode"
    [[ -n "$HAS_URL" ]] && pass "Checkout horas → URL Checkout Pro" || fail "Checkout horas URL" "sem checkoutUrl"
  else
    fail "POST /api/portal/checkout/hours" "$(echo "$CHK_H" | head -c 200)"
    ORDER_ID=""
  fi

  CHK_S="$(curl -s -X POST "$API/api/portal/checkout/subscription" \
    -H "Content-Type: application/json" -H "$AUTH" \
    -d '{"months":1}')"
  SUB_ORDER="$(echo "$CHK_S" | python3 -c "import sys,json; d=json.load(sys.stdin); o=d.get('order') or {}; print(o.get('id',''))" 2>/dev/null || true)"
  if [[ -n "$SUB_ORDER" && "$SUB_ORDER" != "None" ]]; then
    pass "POST /api/portal/checkout/subscription order=$SUB_ORDER"
  else
    fail "POST /api/portal/checkout/subscription" "$(echo "$CHK_S" | head -c 200)"
  fi

  if [[ -n "$ORDER_ID" ]]; then
    SYNC="$(curl -sf "$API/api/portal/orders/$ORDER_ID" -H "$AUTH" 2>/dev/null || echo '{}')"
    if echo "$SYNC" | grep -q '"status"'; then
      pass "GET /api/portal/orders/:id (sync MP)"
    else
      fail "GET /api/portal/orders/:id" "$(echo "$SYNC" | head -c 120)"
    fi

    WH_PAY_ID="$(echo "$CHK_H" | python3 -c "import sys,json; print(json.load(sys.stdin).get('pix',{}).get('paymentId',''))" 2>/dev/null || true)"
    if [[ -n "$WH_PAY_ID" && "$WH_PAY_ID" != "None" ]]; then
      WH_ORDER="$(curl -s -X POST "$API/api/portal/webhooks/mercadopago" \
        -H "Content-Type: application/json" \
        -d "{\"type\":\"payment\",\"data\":{\"id\":\"$WH_PAY_ID\"}}")"
      if echo "$WH_ORDER" | grep -qE '"pending"|"fulfilled"|"ok"'; then
        pass "Webhook pedido geek payment_id=$WH_PAY_ID → $(echo "$WH_ORDER" | python3 -c "import sys,json; d=json.load(sys.stdin); print(next((k for k in ('pending','fulfilled','demo') if k in str(d)), 'ok'))" 2>/dev/null)"
      else
        fail "Webhook pedido geek" "$(echo "$WH_ORDER" | head -c 120)"
      fi
    fi
  fi

  ORDERS="$(curl -sf "$API/api/portal/orders" -H "$AUTH" 2>/dev/null || echo '{}')"
  if echo "$ORDERS" | grep -q '"orders"'; then
    pass "GET /api/portal/orders (lista)"
  else
    fail "GET /api/portal/orders" "$(echo "$ORDERS" | head -c 80)"
  fi
fi

# ── 5. Webhook geek ────────────────────────────────────────────
echo ""
echo "▶ 5. Webhook /api/portal/webhooks/mercadopago"

WH_EMPTY="$(curl -sf -X POST "$API/api/portal/webhooks/mercadopago" \
  -H "Content-Type: application/json" \
  -d '{}' 2>/dev/null || echo '{}')"
if echo "$WH_EMPTY" | grep -q '"ignored"'; then
  pass "Webhook payload vazio → ignored"
else
  fail "Webhook payload vazio" "$(echo "$WH_EMPTY" | head -c 100)"
fi

if [[ -n "$PAYMENT_ID" ]]; then
  WH_PAY="$(curl -s -X POST "$API/api/portal/webhooks/mercadopago" \
    -H "Content-Type: application/json" \
    -d "{\"type\":\"payment\",\"data\":{\"id\":\"$PAYMENT_ID\"}}")"
  if echo "$WH_PAY" | grep -qE '"ok"|"pending"|"fulfilled"|"ignored"'; then
    pass "Webhook payment_id avulso (sem pedido) → $(echo "$WH_PAY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('reason', d.get('status','ok')))" 2>/dev/null)"
  else
    fail "Webhook payment avulso" "$(echo "$WH_PAY" | head -c 150)"
  fi
else
  skip "Webhook com payment avulso" "Pix direto não criado"
fi

# Webhook via túnel público (se existir)
TUNNEL_URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' data/tunnel.log 2>/dev/null | tail -1 || true)"
if [[ -n "$TUNNEL_URL" ]]; then
  TUNNEL_WH="$(curl -sf -o /dev/null -w "%{http_code}" -X POST "$TUNNEL_URL/api/portal/webhooks/mercadopago" \
    -H "Content-Type: application/json" \
    -d '{}' 2>/dev/null || echo "000")"
  if [[ "$TUNNEL_WH" == "200" ]]; then
    pass "Webhook público via túnel ($TUNNEL_URL)"
  else
    skip "Webhook via túnel" "HTTP $TUNNEL_WH (túnel pode estar offline)"
  fi
else
  skip "Webhook via túnel" "URL não encontrada em data/tunnel.log"
fi

# ── 6. Admin ops ───────────────────────────────────────────────
echo ""
echo "▶ 6. Admin (readiness MP)"

ADMIN_LOGIN="$(curl -sf -X POST "$API/api/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"password":"'"${ADMIN_PASSWORD:-admin123}"'"}' 2>/dev/null || echo '{}')"
ADMIN_TOKEN="$(echo "$ADMIN_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || true)"

if [[ -n "$ADMIN_TOKEN" ]]; then
  OPS="$(curl -sf "$API/api/admin/readiness" -H "Authorization: Bearer $ADMIN_TOKEN" 2>/dev/null || echo '{}')"
  if echo "$OPS" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('mpConfigured') else 1)" 2>/dev/null; then
    pass "Admin ops → mpConfigured=true"
  else
    fail "Admin ops mpConfigured" "$(echo "$OPS" | grep -o 'mpConfigured[^,]*' | head -1)"
  fi
else
  skip "Admin ops" "login admin falhou"
fi

# ── Resumo ─────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  RESUMO: $PASS passou | $FAIL falhou | $SKIP pulados"
echo "═══════════════════════════════════════════════════════════"
for r in "${RESULTS[@]}"; do echo "$r"; done
echo ""

if [[ -n "$PAYMENT_ID" ]]; then
  echo "ℹ️  Pix pendente (sandbox): payment_id=$PAYMENT_ID"
  echo "   Para aprovar: painel MP → pagamentos de teste, ou simule no app MP teste."
fi
if [[ -n "$SANDBOX_URL" ]]; then
  echo "ℹ️  Checkout Pro sandbox: $SANDBOX_URL"
fi
if [[ -n "$TEST_USER_ID" ]]; then
  echo "ℹ️  Comprador teste MP: id=$TEST_USER_ID (senha no JSON de criação — painel MP)"
fi

exit "$([[ $FAIL -eq 0 ]] && echo 0 || echo 1)"
