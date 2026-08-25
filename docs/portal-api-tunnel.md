# Expor a API para o portal (Cloudflare Tunnel)

O portal na Vercel precisa falar com a API Fastify da loja via HTTPS.

## Script rápido

```bash
# API da loja rodando em :8787
bash scripts/portal-tunnel.sh
```

A CLI imprime `https://….trycloudflare.com`. Atualize na Vercel:

- `VITE_API_URL` = essa URL
- Redeploy do projeto `loja-geek-portal`

Na API:

```bash
export PORTAL_ORIGIN=https://loja-geek-portal.vercel.app
```

## Túnel nomeado (produção — URL fixa)

1. `cloudflared tunnel login`
2. `cloudflared tunnel create loja-geek-api`
3. DNS `api.seudominio.com` → o túnel
4. `~/.cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL_UUID>
credentials-file: /home/SEU_USER/.cloudflared/<TUNNEL_UUID>.json

ingress:
  - hostname: api.seudominio.com
    service: http://127.0.0.1:8787
  - service: http_status:404
```

5. Autostart:

```bash
export CLOUDFLARED_TUNNEL_NAME=loja-geek-api
# systemd user ou adicionar ao linux-loja.sh:
bash scripts/portal-tunnel.sh
```

6. Portal: `VITE_API_URL=https://api.seudominio.com` (só rebuilda uma vez).

## CORS

```bash
export PORTAL_ORIGIN=https://loja-geek-portal.vercel.app
```

Sem `PORTAL_ORIGIN`, CORS fica aberto (dev).

## Mercado Pago Pix

Na loja (API):

```bash
export MP_ACCESS_TOKEN=APP_USR-...
# webhook: https://api.seudominio.com/api/portal/webhooks/mercadopago
```

Sem token, o checkout continua em modo demo (crédito imediato stub).

## Checklist rápido

Use também `bash scripts/loja-ready.sh` e o guia completo em [`docs/loja-ready.md`](loja-ready.md).

- [ ] API em `8787`
- [ ] Túnel HTTPS ativo (`portal-tunnel.sh`)
- [ ] `PORTAL_ORIGIN` = domínio Vercel
- [ ] Portal com `VITE_API_URL` correto
- [ ] Banner “lanhouse offline” some quando túnel + API sobem
- [ ] Register → Pix/stub → enroll automático → GeekLock
- [ ] `STRICT_SECRETS=1` + segredos não-default
- [ ] `MP_ACCESS_TOKEN` em produção
