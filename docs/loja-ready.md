# Checklist — loja pronta (túnel + Pix)

Atualizado em 2026-08-24. Rodar na máquina da loja com a API em `:8787`.

```bash
bash scripts/loja-ready.sh
```

O script verifica health da API/face, presença de variáveis e (opcional) o túnel. Os itens abaixo exigem ação humana na conta Cloudflare / Mercado Pago.

---

## 1. API e face

- [ ] Face-service em `:8100` (`/health` ok)
- [ ] API em `:8787` (`/api/health` com `faceService: true`)
- [ ] Segredos de produção definidos (não usar defaults):
  - `ADMIN_PASSWORD`
  - `JWT_SECRET`
  - `STATION_SHARED_SECRET`
  - `STRICT_SECRETS=1` (ou `NODE_ENV=production`)

## 2. Túnel Cloudflare (URL fixa)

Seguir [`docs/portal-api-tunnel.md`](portal-api-tunnel.md):

- [ ] `cloudflared tunnel login`
- [ ] `cloudflared tunnel create loja-geek-api`
- [ ] DNS `api.seudominio.com` → túnel
- [ ] `~/.cloudflared/config.yml` apontando para `http://127.0.0.1:8787`
- [ ] Autostart: `CLOUDFLARED_TUNNEL_NAME=loja-geek-api` (systemd user ou junto do `linux-loja.sh`)
- [ ] `bash scripts/portal-tunnel.sh` sobe sem erro
- [ ] `curl -sf https://api.seudominio.com/api/health` responde

## 3. Portal Vercel

- [ ] `VITE_API_URL=https://api.seudominio.com` (redeploy após mudar)
- [ ] `PORTAL_ORIGIN=https://loja-geek-portal.vercel.app` na API da loja
- [ ] Banner “lanhouse offline” some no celular com túnel + API up

## 4. Checkout do portal (compras)

Por padrão o portal **não vende** horas/assinatura (`PORTAL_CHECKOUT_ENABLED` ausente ou `0`).
Botões ficam “Em breve”; a API responde 403 em `/api/portal/checkout/*`.

### Demonstração Mercado Pago (sem crédito)

Para **mostrar** Pix + Checkout Pro funcionando, sem creditar horas:

```bash
export PORTAL_PAYMENT_DEMO=1
export PORTAL_PUBLIC_URL=https://loja-geek-portal.vercel.app
export MP_ACCESS_TOKEN=TEST-...   # token sandbox Mercado Pago
```

- Dashboard: banner “Demonstração”, botões ativos, QR Pix + “Checkout Mercado Pago”
- Pagamento aprovado → status `demo_ok`, **saldo não muda**
- Não use `PORTAL_CHECKOUT_ENABLED=1` ao mesmo tempo (live tem prioridade)

- [ ] Só quando for cobrar de verdade: `export PORTAL_CHECKOUT_ENABLED=1` e reiniciar a API
- [ ] Até lá: recarga no balcão / WhatsApp da lan

## 5. Mercado Pago Pix

Na conta MP da loja (só após liberar checkout):

- [ ] `PORTAL_CHECKOUT_ENABLED=1`
- [ ] Criar aplicação → copiar `ACCESS_TOKEN` de **produção**
- [ ] Na API: `export MP_ACCESS_TOKEN=APP_USR-...`
- [ ] Webhook: `https://api.seudominio.com/api/portal/webhooks/mercadopago`
- [ ] (Recomendado) `MP_WEBHOOK_SECRET` se usar validação de assinatura
- [ ] Testar compra de 1h no portal → QR Pix → crédito após pagamento

Sem `MP_ACCESS_TOKEN` (e com checkout ligado), o checkout continua em **stub** (crédito imediato demo).

## 6. Fluxo ponta a ponta

- [ ] Register no portal → (com checkout on) Pix → saldo creditado
- [ ] Enroll facial no celular
- [ ] GeekLock reconhece o VIP
- [ ] GeekCentral vê estação online e status ao vivo

## Variáveis de referência

```bash
export PORT=8787
export HOST=0.0.0.0
export ADMIN_PASSWORD='…senha-forte…'
export JWT_SECRET='…segredo-longo…'
export STATION_SHARED_SECRET='…outro-segredo…'
export STRICT_SECRETS=1
export PORTAL_ORIGIN=https://loja-geek-portal.vercel.app
# PORTAL_CHECKOUT_ENABLED=1   # cobrança real
# PORTAL_PAYMENT_DEMO=1         # demo MP sem crédito
# PORTAL_PUBLIC_URL=https://loja-geek-portal.vercel.app
export MP_ACCESS_TOKEN=TEST-...
export FACE_SERVICE_URL=http://127.0.0.1:8100
export FACE_SERVICE_TOKEN='…mesmo-token-no-face…'
export CLOUDFLARED_TUNNEL_NAME=loja-geek-api
```
