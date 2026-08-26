# Uptime Kuma — “a loja está no ar?”

Atualizado em **2026-08-26**.

Uptime Kuma é um painel leve (self-host) que avisa se a API, o portal ou o túnel caíram.

## O que monitorar

| Monitor | URL / checagem |
|---------|----------------|
| Portal | `https://loja-geek-portal.vercel.app` (HTTP 200) |
| API via túnel | `https://SUA-URL-FIXA/api/health` |
| Face (opcional) | só na LAN do Central |

## Instalação rápida (Docker)

```bash
docker run -d --restart=always \
  -p 3001:3001 \
  -v uptime-kuma:/app/data \
  --name uptime-kuma \
  louislam/uptime-kuma:1
```

Abra `http://PC:3001`, crie conta, adicione monitores HTTP.

## Alertas

- Telegram / Discord / e-mail no próprio Kuma.
- Combine com **Sentry** (`SENTRY_DSN`) para erros de código; Kuma cobre “site fora”.

## Relacionados

- [`ECOSSISTEMA.md`](./ECOSSISTEMA.md)
- [`loja-ready.md`](./loja-ready.md)
