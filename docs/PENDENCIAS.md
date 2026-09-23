# Pendências — Loja Geek (ops)

Atualizado em **2026-09-23** (noite).  
Foco: **Mercado Pago**, **secrets**, **primeira release do Central**. URL fixa e túnel **já escolhidos** — não reabrir.

**Domínio escolhido:** `geekloja.com.br` → API `https://api.geekloja.com.br`  
**Túnel:** Cloudflare nomeado `loja-geek-api` · GeekCentral Windows  
**Handoff loja (Cursor no Windows):** [`SETUP-WINDOWS-LOJA.md`](./SETUP-WINDOWS-LOJA.md)  
**Monitor no teu PC (depois da loja estável):** [`REMOTE-MONITOR.md`](./REMOTE-MONITOR.md) + produto [`GEEKADMIN-CELULAR.md`](./GEEKADMIN-CELULAR.md) — dono controla de casa (`admin.geekloja.com.br` / `loja.geekloja.com.br`); funcionário só no Wi‑Fi da loja  
**Incidente loja 2026-09-22:** [`CORRECAO-LOJA-2026-09-22.md`](./CORRECAO-LOJA-2026-09-22.md) — `lan-discovery.cjs` fora do asar (JavaScript error)  
**Pareamento (próximo build):** [`PAIRING-CODIGO-CURTO.md`](./PAIRING-CODIGO-CURTO.md) — código 6 dígitos no Central; sem digitar segredo longo  
**UI tela pequena (mesmo build):** [`UI-TELA-PEQUENA.md`](./UI-TELA-PEQUENA.md) — responsivo + modo compacto  
**Atualizar Central:** [`UPDATE-GEEKCENTRAL.md`](./UPDATE-GEEKCENTRAL.md) — de casa publica release; na loja o botão instala; **0 releases** ainda  
**Central ↔ Lock (próximas melhorias):** [`CENTRAL-LOCK-MELHORIAS.md`](./CENTRAL-LOCK-MELHORIAS.md) — estabilidade WS + celular no código; na loja validar + CNAME `admin`  
**GeekLock boot lento no reinício:** [`GEEKLOCK-BOOT-RAPIDO.md`](./GEEKLOCK-BOOT-RAPIDO.md) — documentado; medir na loja  
**Cursor na loja (grill-me):** [`CURSOR-PACK-LOJA.md`](./CURSOR-PACK-LOJA.md) — pack no pendrive `Cursor-Agent\cursor-pack\`  
**Índice de todos os docs:** [`README.md`](./README.md)  
**GeekLock nas estações (instalar / LAN / timer):** [`GEEKLOCK-INSTALAR-ESTACOES.md`](./GEEKLOCK-INSTALAR-ESTACOES.md)

Legenda: `[ ]` falta · `[~]` parcial · `[x]` feito

---

## Resumo do estado hoje

| Área | Situação |
|------|----------|
| Código (API, portal, GeekLock) | `[x]` no GitHub (`main`); HUD + instalador + equipe só no Wi‑Fi da loja |
| Release GeekCentral | `[ ]` **0 releases** — botão Atualizar na loja sem ZIP; de casa só dá para *publicar* |
| Domínio | `[x]` `geekloja.com.br` ativo (Registro.br, expira 2027-09-21) |
| Cloudflare zona | `[x]` NS `nora`/`terry` — zona Active (SOA AA) |
| Túnel | `[x]` nomeado `loja-geek-api` → `api.geekloja.com.br` (credenciais em `~/.cloudflared/`) |
| Login Cloudflare (cloudflared) | `[x]` `cert.pem` ok |
| URL fixa | `[x]` `https://api.geekloja.com.br` — health público OK (2026-09-22) |
| Autostart Windows (GeekCentral) | `[ ]` copiar credenciais + modo Nomeado na loja |
| Mercado Pago | `[~]` token `TEST-` (pode estar expirado); **sem app “Loja Geek”** no painel |
| Checkout | `[~]` `.env` em modo live sandbox; produção (`APP_USR-`) pendente |
| Portal Vercel | `[x]` `VITE_API_URL=https://api.geekloja.com.br` (redeploy 2026-09-21) |

---

## 1. Cloudflare — URL fixa (recomendado)

**Custo:** R$ 0/mês no túnel + **domínio** (~R$ 40/ano `.com.br` ou similar).  
**Por quê:** portal na Vercel, webhook MP e clientes precisam de HTTPS estável.

### Checklist

- [x] **Domínio** `geekloja.com.br` no Registro.br
- [x] **Nameservers Cloudflare** (`nora.ns.cloudflare.com` / `terry.ns.cloudflare.com`)
- [x] Zona Cloudflare **Active**
- [x] `cloudflared tunnel login` (`~/.cloudflared/cert.pem`)
- [x] `CLOUDFLARED_HOSTNAME=api.geekloja.com.br bash scripts/cloudflare-named-setup.sh`
- [x] Health público: `https://api.geekloja.com.br/api/health` → `{"ok":true,...}` (2026-09-22)
- [x] `.env` da loja com `PUBLIC_API_URL` / `CLOUDFLARED_*`
- [x] Túnel rodando neste PC: `CLOUDFLARED_TUNNEL_NAME=loja-geek-api bash scripts/portal-tunnel.sh`
- [ ] **Autostart na loja (Windows):** copiar `~/.cloudflared/` + GeekCentral → Config → Portal/Túnel → **Nomeado** + auto-start
- [x] Vercel (portal): `VITE_API_URL=https://api.geekloja.com.br` + redeploy
- [ ] GeekCentral: copiar URL pública / webhook MP na aba Config
- [ ] Validar: `PUBLIC_API_URL=https://api.geekloja.com.br bash scripts/loja-ready.sh` (ainda falha STRICT_SECRETS / admin123)

**Docs:** [`portal-api-tunnel.md`](./portal-api-tunnel.md) · [`loja-ready.md`](./loja-ready.md)

---

## 2. Alternativas de túnel — **já decidido**

Escolhido: **Cloudflare Tunnel nomeado** + domínio `geekloja.com.br`. Não reabrir ngrok / VPS / quick tunnel.  
Histórico da comparação: [`portal-api-tunnel.md`](./portal-api-tunnel.md).

---

## 3. Mercado Pago

**Custo:** sem mensalidade; taxa por transação Pix/cartão.  
**Situação:** testes rodaram em **sandbox** na conta pessoal; não há app nomeada “Loja Geek”.

### Checklist — conta e aplicação

- [ ] Entrar em [Suas integrações](https://www.mercadopago.com.br/developers/panel/app)
- [ ] **Criar aplicação** “Loja Geek” (Checkout Pro ou Checkout API, pagamentos online)
- [ ] Copiar **Access Token de teste** (`TEST-...`) → `.env` → `MP_ACCESS_TOKEN`
- [ ] (Depois) Copiar **Access Token de produção** (`APP_USR-...`) — só quando for cobrar de verdade
- [ ] Configurar MCP no Cursor (`.cursor/mcp.json` + `MP_ACCESS_TOKEN` no ambiente) — OAuth deu 403; usar token no header
- [ ] Rodar: `bash scripts/test-mercadopago.sh`

### Checklist — webhook e Pix

- [ ] URL fixa da API pronta (seção 1 ou 2 acima)
- [ ] No painel MP → app Loja Geek → **Webhooks**:
  - Teste: `https://api.SEU-DOMINIO.com.br/api/portal/webhooks/mercadopago`
  - Produção: mesma URL quando for live
  - Evento: **Payments** (`payment`)
- [ ] (Recomendado) `MP_WEBHOOK_SECRET` no `.env` + validação no painel MP
- [ ] Testar compra 1h no portal → Pix ou cartão teste → saldo/assinatura sobe
- [ ] Confirmar movimentação no painel (**modo teste**, não extrato real) ou via API

### Checklist — produção (quando abrir a loja)

- [ ] `.env`:
  ```bash
  PORTAL_CHECKOUT_ENABLED=1
  # PORTAL_PAYMENT_DEMO=0   # desligado
  MP_ACCESS_TOKEN=APP_USR-...
  ```
- [ ] Conta MP **verificada** (CNPJ/CPF, dados bancários para receber)
- [ ] Testar assinatura + compra de horas ponta a ponta
- [ ] Script de setup: `bash scripts/setup-mp-portal-subscription.sh` (sandbox antes)

### Limitações do projeto (saber antes)

- “Assinatura” no geek = **pagamento único** de X meses (não é cobrança recorrente automática do MP Subscriptions).
- E-mails `@testuser.com` e `@*.local` **não funcionam** no Pix `/v1/payments` — o código já corrige para `@example.com` quando necessário.
- Pagamentos sandbox **não aparecem** no extrato real da conta MP.

**Docs:** [`loja-ready.md`](./loja-ready.md) · [`portal-api-tunnel.md`](./portal-api-tunnel.md)

---

## 4. Outras pendências da loja (não esquecer)

| # | Item | Prioridade |
|---|------|------------|
| O1 | `STRICT_SECRETS=1` + trocar `ADMIN_PASSWORD` / `JWT_SECRET` default | Alta |
| O2 | Primeira GitHub Release do Central (`GeekCentral-win-x64.zip`) | Alta |
| O3 | Regenerar pendrives: `pack:central` / `pack:lock` | Alta (após URL + MP) |
| O4 | `npm run loja:ready` com checklist completo | Alta |
| O5 | Backup automático `data/` testado | Média |
| O6 | WhatsApp Evolution (instância real) | Baixa |
| O7 | Túnel nomeado no GeekCentral Windows (validar na loja) | Média |

---

## 5. Ordem sugerida (fazer nesta sequência)

```
1. [x] Domínio + Cloudflare Tunnel nomeado
2. [x] Vercel VITE_API_URL + redeploy
3. [ ] App “Loja Geek” no MP + token novo
4. [ ] Webhook MP na URL fixa
5. [ ] Teste compra + assinatura (sandbox)
6. [ ] STRICT_SECRETS + loja:ready
7. [ ] Token APP_USR- produção
8. [ ] Primeira release do Central + atualizar na loja
```

---

## 6. Comandos úteis

```bash
# URL fixa (após login Cloudflare)
export CLOUDFLARED_HOSTNAME=api.seudominio.com.br
bash scripts/cloudflare-named-setup.sh
CLOUDFLARED_TUNNEL_NAME=loja-geek-api bash scripts/portal-tunnel.sh

# Testes MP
bash scripts/test-mercadopago.sh
bash scripts/setup-mp-portal-subscription.sh

# Checklist loja
PUBLIC_API_URL=https://api.seudominio.com.br bash scripts/loja-ready.sh
```

---

## Links

| Recurso | URL |
|---------|-----|
| Repo | https://github.com/MrJCRJ/loja-geek-fidelidade |
| Portal | https://loja-geek-portal.vercel.app |
| MP integrações | https://www.mercadopago.com.br/developers/panel/app |
| Cloudflare Zero Trust | https://one.dash.cloudflare.com/ |

Lista histórica mais ampla: [`LISTA-COMPLETA.md`](./LISTA-COMPLETA.md) · [`MELHORIAS.md`](./MELHORIAS.md)
