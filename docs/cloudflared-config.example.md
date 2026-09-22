# Cloudflare Tunnel — config.yml (exemplo Windows)

Copie para `%USERPROFILE%\.cloudflared\config.yml` e ajuste o caminho do JSON.

```yaml
tunnel: b9406016-bea4-4398-b6e4-48f43e398af5
credentials-file: C:\Users\SEU_USUARIO\.cloudflared\b9406016-bea4-4398-b6e4-48f43e398af5.json

ingress:
  - hostname: api.geekloja.com.br
    service: http://127.0.0.1:8787
  - service: http_status:404
```

Guia completo: [`SETUP-WINDOWS-LOJA.md`](./SETUP-WINDOWS-LOJA.md)
