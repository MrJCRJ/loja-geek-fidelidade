# Setup Windows — GeekCentral na loja (sem pendrive)

**Para o agent Cursor no PC da loja.**  
Repo: https://github.com/MrJCRJ/loja-geek-fidelidade  
Atualizado: **2026-09-22**.

---

## Estado já pronto (não refazer)

| Item | Valor |
|------|--------|
| Domínio | `geekloja.com.br` |
| API pública | `https://api.geekloja.com.br` |
| Túnel Cloudflare | nome `loja-geek-api` · id `b9406016-bea4-4398-b6e4-48f43e398af5` |
| Portal | https://loja-geek-portal.vercel.app |
| `VITE_API_URL` (Vercel) | `https://api.geekloja.com.br` (já redeployado) |
| Health | `https://api.geekloja.com.br/api/health` → `{"ok":true,...}` quando o túnel estiver up |

DNS Cloudflare: `nora.ns.cloudflare.com` / `terry.ns.cloudflare.com` (já Active).

**Não commitar / não colar no Git:** `.env`, `cert.pem`, `*.json` de credenciais do túnel, senhas.

---

## Prompt para colar no Cursor (PC Windows da loja)

```
Leia docs/SETUP-WINDOWS-LOJA.md e docs/PENDENCIAS.md neste repo.

Objetivo: configurar o GeekCentral neste Windows para a Loja Geek
SEM pendrive — só GitHub + Cloudflare.

Já existem (não recriar domínio/túnel/DNS):
- Domínio geekloja.com.br
- Túnel loja-geek-api (UUID b9406016-bea4-4398-b6e4-48f43e398af5)
- API pública https://api.geekloja.com.br
- Portal https://loja-geek-portal.vercel.app com VITE_API_URL certo

Faça nesta ordem:
1) Confirmar git pull na pasta do repo (ou clonar se não existir).
2) Instalar Node LTS + cloudflared (winget ou instalador oficial) se faltar.
3) Subir API/GeekCentral na porta 8787 (fluxo normal do projeto).
4) Autenticar Cloudflare neste PC: cloudflared tunnel login
   (conta que tem geekloja.com.br).
5) Colocar credenciais do túnel em %USERPROFILE%\.cloudflared\
   e gravar config.yml (modelo na seção abaixo deste arquivo).
   Se o JSON da credencial não existir neste PC: Cloudflare Zero Trust →
   Networks → Tunnels → loja-geek-api → Configure → regenerar/baixar
   credentials OU instalar connector Windows com token oficial.
6) GeekCentral → Config → Portal/Túnel:
   - Modo: Nomeado
   - Nome: loja-geek-api
   - URL pública: https://api.geekloja.com.br
   - Auto-start: ligado
7) Testar: https://api.geekloja.com.br/api/health e o portal
   (banner offline deve sumir).
8) .env local: PUBLIC_API_URL, PORTAL_ORIGIN, CLOUDFLARED_* —
   NUNCA commit; copiar de .env.example e preencher.
9) Se possível: STRICT_SECRETS=1 + trocar ADMIN_PASSWORD default.

Não apague o túnel nem mude o hostname DNS sem confirmar comigo.
```

---

## Pendrive USB (se levar o GEEKLOCK)

No pendrive já pode estar:

| Caminho | Conteúdo |
|---------|----------|
| `GeekCentral/.env` | `PUBLIC_API_URL`, portal, MP sandbox |
| `GeekCentral/data/.env` | cópia |
| `GeekCentral/resources/runtime/node/.env` | onde o dotenv da API lê |
| `GeekCentral/cloudflared-COPIAR-PARA-USERPROFILE/` | `cert.pem` + JSON + `config.yml` → copiar para `%USERPROFILE%\.cloudflared\` |
| `ENV-E-TUNEL.txt` | resumo na raiz do pendrive |

**Não** versionar esses arquivos no Git.


Pasta: `%USERPROFILE%\.cloudflared\`  
(ex.: `C:\Users\Loja\.cloudflared\`)

Arquivos necessários:

1. `cert.pem` — gerado por `cloudflared tunnel login`
2. `b9406016-bea4-4398-b6e4-48f43e398af5.json` — credencial do túnel  
   (baixada no Zero Trust se este PC ainda não tiver)
3. `config.yml` — criar com o modelo:

```yaml
tunnel: b9406016-bea4-4398-b6e4-48f43e398af5
credentials-file: C:\Users\SEU_USUARIO\.cloudflared\b9406016-bea4-4398-b6e4-48f43e398af5.json

ingress:
  - hostname: api.geekloja.com.br
    service: http://127.0.0.1:8787
  - service: http_status:404
```

Troque `SEU_USUARIO` pelo usuário Windows real.

### Alternativa: connector com token (serviço Windows)

Se preferir o instalador oficial da Cloudflare (túnel como serviço):

1. https://one.dash.cloudflare.com → **Networks** → **Tunnels** → **loja-geek-api**
2. Configure → Install connector → **Windows** → copiar comando com `--token ...`
3. API da loja só precisa escutar `127.0.0.1:8787`
4. No GeekCentral, se o serviço já mantém o túnel, pode deixar modo túnel **Off**  
   (ou Nomeado se usar `config.yml` + auto-start do Central — não rode os dois ao mesmo tempo)

---

## Variáveis `.env` (local, não Git)

```bash
PORT=8787
HOST=0.0.0.0
PUBLIC_API_URL=https://api.geekloja.com.br
CLOUDFLARED_TUNNEL_NAME=loja-geek-api
CLOUDFLARED_HOSTNAME=api.geekloja.com.br
PORTAL_ORIGIN=https://loja-geek-portal.vercel.app
PORTAL_PUBLIC_URL=https://loja-geek-portal.vercel.app
PORTAL_CHECKOUT_ENABLED=1
# MP_ACCESS_TOKEN=...  (sandbox TEST- ou produção APP_USR-)
# STRICT_SECRETS=1
# ADMIN_PASSWORD=...  (não usar admin123)
```

---

## Checklist rápido na loja

- [ ] `git pull` (branch `main`)
- [ ] Node + dependências / GeekCentral sobe
- [ ] API local: `http://127.0.0.1:8787/api/health`
- [ ] `cloudflared` no PATH ou em `data\cloudflared\`
- [ ] `%USERPROFILE%\.cloudflared\` com cert + json + config.yml
- [ ] GeekCentral túnel Nomeado + auto-start **ou** serviço Cloudflare com token
- [ ] `https://api.geekloja.com.br/api/health` → ok
- [ ] Portal abre e fala com a loja (sem banner offline permanente)
- [ ] (depois) Mercado Pago app + webhook na URL fixa — ver `docs/PENDENCIAS.md`
- [ ] (depois) Monitor no teu PC: Cloudflare Access + GeekAdmin Saúde — ver `docs/REMOTE-MONITOR.md`

## Correção loja 2026-09-22

Diálogo **"A JavaScript error occurred"** (não é Java/JDK): faltava `shared/lan-discovery.cjs` no pack do GeekLock **e** do GeekCentral.

Ver [`CORRECAO-LOJA-2026-09-22.md`](./CORRECAO-LOJA-2026-09-22.md). No pendrive: `resources/shared/lan-discovery.cjs` já com o módulo real.

**Próximo build (não feito ainda):**
- Pareamento por código de 6 dígitos — [`PAIRING-CODIGO-CURTO.md`](./PAIRING-CODIGO-CURTO.md)
- UI para tela pequena (responsivo + compacto) — [`UI-TELA-PEQUENA.md`](./UI-TELA-PEQUENA.md)

---

## Links

| Recurso | URL |
|---------|-----|
| Repo | https://github.com/MrJCRJ/loja-geek-fidelidade |
| Este guia | `docs/SETUP-WINDOWS-LOJA.md` |
| Pendências ops | `docs/PENDENCIAS.md` |
| Túnel / portal | `docs/portal-api-tunnel.md` |
| Portal | https://loja-geek-portal.vercel.app |
| Health API | https://api.geekloja.com.br/api/health |
| Cloudflare Zero Trust | https://one.dash.cloudflare.com |
| Registro.br | https://registro.br |
