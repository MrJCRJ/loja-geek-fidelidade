# Monitor remoto — teu PC enxerga a loja

Atualizado em **2026-09-23**.  
**Status:** plano documentado — **só ativar depois** do GeekCentral Windows estável na loja.  
**Produto:** [`GEEKADMIN-CELULAR.md`](./GEEKADMIN-CELULAR.md) — este arquivo é o checklist de ops (Access + hostname). Em conflito, vale o produto.

---

## Decisões fechadas

| # | Decisão | Escolha |
|---|--------|---------|
| 1 | O que ver | GeekAdmin **inteiro em leitura** — **não** controla PC |
| 2 | Como ver | Navegador, URL **com nome** |
| 3 | Quando | Túnel estável **e** quando o dono mandar o celular |
| 4 | Segurança | Access (e-mail do dono) + login **conta dono**. Funcionário **não** entra de casa |
| 5 | UI | GeekAdmin existente — sem painel novo |
| 6 | URL de casa | `https://admin.geekloja.com.br` (hostname novo no túnel existente — **não** recriar) |
| 7 | URL da loja | `http://geek.local` |
| 8 | Agora | Só doc — sem código novo |

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
         /api/health + webhooks MP              admin.geekloja.com.br
         (públicos — MP/portal)                 Cloudflare Access → dono
         api.geekloja.com.br                          │
                                                      ▼
                                              Navegador em casa
                                              Access + login conta dono
                                              (leitura; API recusa comando de PC)
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
3. [ ] Application domain: `admin.geekloja.com.br` (**não** o `api.` — portal e Pix ficam de fora)  
4. [ ] Proteger o hostname `admin` inteiro (painel + `/api/admin/*` nesse host)  
   - `api.geekloja.com.br` **sem** Access: `/api/health`, `/api/portal/*`, webhook MP  
5. [ ] Policy: Allow → e-mail(s) teus (OTP por e-mail)  
6. [ ] Testar do teu PC:  
   - Health sem login Access → 200  
   - Abrir `admin.geekloja.com.br` → challenge Cloudflare → login **conta dono**  
   - Tentar destrava de PC por esse link → API recusa  
7. [ ] Painel em leitura: estações + Saúde + resto visível, sem comando  

Docs Cloudflare: [Access self-hosted](https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/self-hosted-public-app/).

### URLs úteis (depois de no ar)

| O quê | URL |
|-------|-----|
| Health (público) | `https://api.geekloja.com.br/api/health` |
| Admin de casa (Access + conta dono) | `https://admin.geekloja.com.br` |
| Controle na loja | `http://geek.local` |
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

- [`GEEKADMIN-CELULAR.md`](./GEEKADMIN-CELULAR.md) — desenho do produto (fonte da verdade)  
- [`telemetria.md`](./telemetria.md) — o que o Central já coleta  
- [`SETUP-WINDOWS-LOJA.md`](./SETUP-WINDOWS-LOJA.md) — handoff Windows  
- [`PENDENCIAS.md`](./PENDENCIAS.md) — ops gerais  
