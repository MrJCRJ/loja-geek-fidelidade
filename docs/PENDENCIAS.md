# Pendências — Loja Geek (ops)

Atualizado em **2026-09-21**.  
Foco: **URL fixa**, **alternativas baratas**, **Mercado Pago** e o que falta para a loja rodar de verdade.

**Domínio escolhido:** `geekloja.com.br` → API `https://api.geekloja.com.br`  
**Túnel:** Cloudflare nomeado `loja-geek-api` · GeekCentral Windows  
**Handoff loja (Cursor no Windows):** [`SETUP-WINDOWS-LOJA.md`](./SETUP-WINDOWS-LOJA.md)

Legenda: `[ ]` falta · `[~]` parcial · `[x]` feito

---

## Resumo do estado hoje

| Área | Situação |
|------|----------|
| Código (API, portal, GeekLock) | `[x]` MVP pronto; mudanças locais não commitadas |
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

## 2. Alternativas mais baratas (ou sem domínio)

Comparação rápida para **expor a API `:8787`** ao portal e ao MP.

| Opção | Custo típico | URL fixa? | Webhook MP? | Notas |
|-------|--------------|-----------|-------------|--------|
| **Cloudflare Tunnel nomeado** | Domínio ~R$ 40/ano; túnel grátis | ✅ Sim | ✅ Sim | **Recomendado** — já tem script no repo |
| **Cloudflare quick** (`trycloudflare`) | Grátis | ❌ Muda sempre | ⚠️ Ruim | Só dev/teste rápido |
| **Tailscale Funnel** | Grátis (plano pessoal) | ⚠️ Subdomínio Tailscale | ✅ Se HTTPS estável | Bom se já usa Tailscale na loja |
| **ngrok** | Grátis limitado; fixo ~US$ 8/mês | ✅ No plano pago | ✅ | Fácil; custo mensal |
| **localhost.run / serveo** | Grátis | ❌ | ❌ | Não usar em produção |
| **IP público + roteador** | Grátis (se ISP der IP fixo) | ⚠️ Depende ISP | ✅ | Precisa abrir porta, certificado TLS, DDNS se IP dinâmico |
| **VPS barata** (Hetzner, Contabo, etc.) | ~€4–6/mês | ✅ Com domínio | ✅ | API na nuvem; loja só face/LAN local — mais trabalho |
| **Só LAN** (sem portal remoto) | R$ 0 | N/A | ❌ | Clientes não compram pelo site fora da loja |

### Se o orçamento apertar

1. **Mínimo viável:** domínio barato + Cloudflare Tunnel (só paga o domínio 1×/ano).
2. **Sem domínio por enquanto:** ngrok free para testes; migrar antes de abrir a loja.
3. **Não usar** quick tunnel (`trycloudflare`) em produção — webhook MP quebra quando reinicia.

### Pendências (escolher caminho)

- [ ] Decidir: **Cloudflare + domínio** vs **ngrok pago** vs **VPS**
- [ ] Se Cloudflare: registrar/comprar domínio e apontar DNS para Cloudflare
- [ ] Se ngrok: conta, reservar subdomain, documentar URL no `.env` e Vercel
- [ ] Documentar URL escolhida em `PUBLIC_API_URL` e no painel Vercel

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
| O2 | Commitar mudanças locais (GeekLock, portal, túnel, payments) | Média |
| O3 | Regenerar pendrives: `pack:central` / `pack:lock` | Alta (após URL + MP) |
| O4 | `npm run loja:ready` com checklist completo | Alta |
| O5 | Backup automático `data/` testado | Média |
| O6 | WhatsApp Evolution (instância real) | Baixa |
| O7 | Túnel nomeado no GeekCentral Windows (validar na loja) | Média |

---

## 5. Ordem sugerida (fazer nesta sequência)

```
1. Domínio + Cloudflare Tunnel nomeado     → URL fixa
2. Vercel VITE_API_URL + redeploy          → portal fala com a loja
3. App “Loja Geek” no MP + token novo      → credenciais válidas
4. Webhook MP na URL fixa                  → Pix credita sozinho
5. Teste compra + assinatura (sandbox)     → scripts/test-mercadopago.sh
6. STRICT_SECRETS + loja:ready             → segurança
7. Token APP_USR- produção                 → cobrar de verdade
8. Regenerar GeekCentral / GeekLock        → PCs da loja
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
