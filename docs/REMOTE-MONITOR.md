# Monitor remoto — teu PC enxerga a loja

Atualizado em **2026-09-22**.  
**Status:** plano documentado — **só ativar depois** do GeekCentral Windows estável na loja.

---

## Decisões fechadas

| # | Decisão | Escolha |
|---|--------|---------|
| 1 | O que ver | Estações GeekLock online/offline + alertas (face, disco, etc.) — aba **Saúde** |
| 2 | Como ver | Navegador no teu PC, quando quiser |
| 3 | Quando | Depois do setup Windows na loja (túnel no ar 24/7) |
| 4 | Segurança | **Cloudflare Access** na frente do admin |
| 5 | UI | GeekAdmin existente pela URL pública (sem painel novo) |
| 6 | Agora | Só este doc — sem código novo |

---

## Como funciona (arquitetura)

```
GeekLock (PCs da lan) ──LAN/WS──► GeekCentral (PC loja)
                                      │
                                      │ telemetria local (system_events, station_status)
                                      │
                                      ▼
                         Cloudflare Tunnel → api.geekloja.com.br
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
         /api/health + webhooks MP              /admin + /api/admin/*
         (públicos — MP/portal)                 Cloudflare Access → tu
                                                      │
                                                      ▼
                                              Teu PC (navegador)
                                              login Access + login admin
```

Os GeekLock **não** falam com o teu PC. Eles reportam ao Central; tu lê o Central pela internet.

---

## Pré-requisito

- [ ] GeekCentral na loja com túnel **Nomeado** + auto-start  
- [ ] `https://api.geekloja.com.br/api/health` → `{"ok":true}` de casa  
- [ ] Senha admin **não** é `admin123` + `STRICT_SECRETS=1`  

Ver [`SETUP-WINDOWS-LOJA.md`](./SETUP-WINDOWS-LOJA.md).

---

## Checklist — Cloudflare Access (quando for a hora)

1. [ ] Zero Trust → **Access** → Applications → Add  
2. [ ] Application type: **Self-hosted**  
3. [ ] Application domain: `api.geekloja.com.br`  
4. [ ] **Path policy (importante):**  
   - Proteger: `/` do admin estático (ex. caminhos do painel) e `/api/admin/*`  
   - **Bypass / não exigir Access** em:  
     - `/api/health`  
     - `/api/portal/*` (cliente + webhook Mercado Pago)  
     - WebSocket das estações se passar pelo mesmo host (só LAN costuma; se WS público, tratar à parte)  
5. [ ] Policy: Allow → e-mail(s) teus (OTP por e-mail)  
6. [ ] Testar do teu PC:  
   - Health sem login Access → 200  
   - Abrir admin → challenge Cloudflare → depois login admin Geek  
7. [ ] Aba **Saúde**: estações + alertas/telemetria  

Docs Cloudflare: [Access self-hosted](https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/self-hosted-public-app/).

### URLs úteis (depois de no ar)

| O quê | URL |
|-------|-----|
| Health (público) | `https://api.geekloja.com.br/api/health` |
| Admin (Access + senha) | `https://api.geekloja.com.br/` (Abrir admin / rota do GeekAdmin) |
| Portal cliente | `https://loja-geek-portal.vercel.app` |

---

## O que NÃO fazer

- Não expor admin só com senha fraca na internet sem Access.  
- Não colocar Access em cima do webhook do Mercado Pago (quebra Pix).  
- Não pedir que GeekLock conecte no teu PC — escala e NAT viram dor.  
- Não implementar isto antes do túnel estável na loja.

---

## Depois (opcional, fora deste plano)

- Telegram quando health cair (Uptime Kuma — [`uptime-kuma.md`](./uptime-kuma.md))  
- Página só-status sem cadastro/saldo  

---

## Relacionados

- [`telemetria.md`](./telemetria.md) — o que o Central já coleta  
- [`SETUP-WINDOWS-LOJA.md`](./SETUP-WINDOWS-LOJA.md) — handoff Windows  
- [`PENDENCIAS.md`](./PENDENCIAS.md) — ops gerais  
