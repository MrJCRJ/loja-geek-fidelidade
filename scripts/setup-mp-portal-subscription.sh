#!/usr/bin/env bash
# Cria contas MP teste + portal geek e tenta ativar assinatura (sandbox).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck disable=SC1091
[[ -f .env ]] && set -a && source .env && set +a

API="${API_URL:-http://127.0.0.1:8787}"
MP_TOKEN="${MP_ACCESS_TOKEN:-}"
TS="$(date +%s)"

die() { echo "ERRO: $*" >&2; exit 1; }
[[ -n "$MP_TOKEN" ]] || die "MP_ACCESS_TOKEN ausente no .env"
curl -sf "$API/api/health" >/dev/null || die "API offline em $API"

echo "══════════════════════════════════════════════════════════"
echo "  Setup: contas teste MP + assinatura portal geek"
echo "══════════════════════════════════════════════════════════"

# 1) Comprador teste Mercado Pago
echo ""
echo "▶ 1. Criando comprador teste no Mercado Pago (MLB)…"
BUYER_JSON="$(curl -s -X POST "https://api.mercadopago.com/users/test_user" \
  -H "Authorization: Bearer $MP_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"site_id\":\"MLB\",\"description\":\"geek-portal-$TS\",\"profile\":\"buyer\"}")"

BUYER_ID="$(echo "$BUYER_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))")"
BUYER_EMAIL_MP="$(echo "$BUYER_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('email',''))")"
BUYER_PASS="$(echo "$BUYER_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('password',''))")"
BUYER_NICK="$(echo "$BUYER_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('nickname',''))")"

[[ -n "$BUYER_ID" ]] || die "Falha ao criar buyer MP: $BUYER_JSON"
echo "   ID: $BUYER_ID"
echo "   E-mail MP (login checkout): $BUYER_EMAIL_MP"
echo "   Senha MP: $BUYER_PASS"
echo "   Nick: $BUYER_NICK"

# 2) Conta no portal geek (e-mail válido para MP /v1/payments)
GEEK_EMAIL="geek.vip.$TS@example.com"
GEEK_PASS="GeekTest${TS: -4}!"
echo ""
echo "▶ 2. Registrando VIP no portal geek…"
REG="$(curl -s -X POST "$API/api/portal/register" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"VIP Teste $TS\",\"email\":\"$GEEK_EMAIL\",\"password\":\"$GEEK_PASS\",\"phone\":\"5575999999999\",\"consent\":true}")"
PORTAL_TOKEN="$(echo "$REG" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")"
CUSTOMER_ID="$(echo "$REG" | python3 -c "import sys,json; d=json.load(sys.stdin); print((d.get('customer') or {}).get('id',''))")"
[[ -n "$PORTAL_TOKEN" ]] || die "Registro portal falhou: $REG"
echo "   Portal: $GEEK_EMAIL / $GEEK_PASS"
echo "   Customer ID: $CUSTOMER_ID"

# 3) Checkout assinatura (modo atual do .env)
echo ""
echo "▶ 3. Iniciando assinatura 1 mês pelo portal…"
CHK="$(curl -s -X POST "$API/api/portal/checkout/subscription" \
  -H "Authorization: Bearer $PORTAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"months":1}')"

ORDER_ID="$(echo "$CHK" | python3 -c "import sys,json; o=json.load(sys.stdin).get('order') or {}; print(o.get('id',''))")"
PAYMENT_ID="$(echo "$CHK" | python3 -c "import sys,json; print(json.load(sys.stdin).get('pix',{}).get('paymentId',''))")"
CHECKOUT_URL="$(echo "$CHK" | python3 -c "import sys,json; print(json.load(sys.stdin).get('checkoutUrl',''))")"
IS_DEMO="$(echo "$CHK" | python3 -c "import sys,json; print('sim' if json.load(sys.stdin).get('demo') else 'nao')")"
AMOUNT="$(echo "$CHK" | python3 -c "import sys,json; o=json.load(sys.stdin).get('order') or {}; print(o.get('amount_reais', o.get('amountReais', 49.9)))")"

[[ -n "$ORDER_ID" ]] || die "Checkout assinatura falhou: $CHK"
echo "   Pedido: $ORDER_ID (demo=$IS_DEMO, R\$ $AMOUNT)"
echo "   Pix payment_id: $PAYMENT_ID"
echo "   Checkout Pro: $CHECKOUT_URL"

# 4) Tentar aprovar com cartão sandbox (APRO) ligado ao pedido geek
echo ""
echo "▶ 4. Pagando com cartão teste APRO (sandbox)…"
CARD_TOKEN_JSON="$(curl -s -X POST "https://api.mercadopago.com/v1/card_tokens" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MP_TOKEN" \
  -d '{
    "card_number": "5031433215406351",
    "security_code": "123",
    "expiration_month": "11",
    "expiration_year": "2030",
    "cardholder": {
      "name": "APRO",
      "identification": { "type": "CPF", "number": "12345678909" }
    }
  }')"
CARD_TOKEN="$(echo "$CARD_TOKEN_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))")"

if [[ -z "$CARD_TOKEN" ]]; then
  echo "   ⚠ Token de cartão falhou: $(echo "$CARD_TOKEN_JSON" | head -c 200)"
else
  PAY_JSON="$(curl -s -X POST "https://api.mercadopago.com/v1/payments" \
    -H "Authorization: Bearer $MP_TOKEN" \
    -H "Content-Type: application/json" \
    -H "X-Idempotency-Key: geek-sub-$ORDER_ID" \
    -d "{
      \"transaction_amount\": $AMOUNT,
      \"token\": \"$CARD_TOKEN\",
      \"description\": \"geeks assinatura teste\",
      \"installments\": 1,
      \"payment_method_id\": \"master\",
      \"external_reference\": \"$ORDER_ID\",
      \"payer\": {\"email\": \"payer_$TS@example.com\"}
    }")"
  APPROVED_ID="$(echo "$PAY_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))")"
  APPROVED_STATUS="$(echo "$PAY_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status', d.get('message','?')))")"
  echo "   Pagamento cartão: id=$APPROVED_ID status=$APPROVED_STATUS"

  if [[ "$APPROVED_STATUS" == "approved" && -n "$APPROVED_ID" ]]; then
  echo ""
  echo "▶ 5. Disparando webhook + sync do pedido…"
  curl -s -X POST "$API/api/portal/webhooks/mercadopago" \
    -H "Content-Type: application/json" \
    -d "{\"type\":\"payment\",\"data\":{\"id\":\"$APPROVED_ID\"}}" | python3 -m json.tool
  fi
fi

# 6) Estado final
echo ""
echo "▶ 6. Estado final da assinatura…"
FINAL="$(curl -s "$API/api/portal/orders/$ORDER_ID" -H "Authorization: Bearer $PORTAL_TOKEN")"
echo "$FINAL" | python3 -c "
import sys, json
d = json.load(sys.stdin)
o = d.get('order', {})
c = d.get('customer', {})
print('   Pedido status:', o.get('status'))
print('   Demo:', d.get('demo'))
print('   Creditado:', d.get('credited'))
print('   Assinatura:', c.get('subscriptionStatus'))
print('   Expira:', c.get('subscriptionExpiresAt'))
"

ME="$(curl -s "$API/api/portal/me" -H "Authorization: Bearer $PORTAL_TOKEN")"
echo "$ME" | python3 -c "
import sys, json
c = json.load(sys.stdin)
print('   /me subscriptionStatus:', c.get('subscriptionStatus'))
print('   /me subscriptionExpiresAt:', c.get('subscriptionExpiresAt'))
"

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  CREDENCIAIS (guarde para testar no site)"
echo "══════════════════════════════════════════════════════════"
echo "  Portal geek:  $GEEK_EMAIL"
echo "  Senha portal: $GEEK_PASS"
echo "  Site:         ${PORTAL_PUBLIC_URL:-https://loja-geek-portal.vercel.app}"
echo ""
echo "  MP comprador: $BUYER_EMAIL_MP"
echo "  Senha MP:     $BUYER_PASS"
echo "  (use no Checkout Pro sandbox se pagar manualmente)"
echo ""
echo "  Checkout URL: $CHECKOUT_URL"
echo "══════════════════════════════════════════════════════════"

if echo "$FINAL" | python3 -c "import sys,json; d=json.load(sys.stdin); c=d.get('customer',{}); exit(0 if c.get('subscriptionStatus')=='active' else 1)" 2>/dev/null; then
  echo "✅ Assinatura ATIVA no portal geek."
elif echo "$FINAL" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('order',{}).get('status')=='demo_ok' else 1)" 2>/dev/null; then
  echo "ℹ️  Modo DEMO: pagamento MP ok mas assinatura NÃO ativa (esperado)."
  echo "   Para ativar de verdade: PORTAL_CHECKOUT_ENABLED=1 e PORTAL_PAYMENT_DEMO=0 no .env"
else
  echo "⚠️  Assinatura ainda pendente — pague no Checkout Pro ou aguarde webhook."
fi
