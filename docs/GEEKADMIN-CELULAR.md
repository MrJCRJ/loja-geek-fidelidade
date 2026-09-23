# GeekAdmin no celular — controle local + ver de casa

Atualizado em **2026-09-23**.  
**Status:** implementado no código (2026-09-23). Na loja: atualizar pelo GitHub.  
Hostname `admin.geekloja.com.br` no túnel + Cloudflare Access: checklist em [`REMOTE-MONITOR.md`](./REMOTE-MONITOR.md) (ops, não recria túnel).

---

## Em uma frase

O funcionário controla a loja pelo **navegador no celular**. O PC principal só é o motor (API + face + túnel + fala com os Locks).

**Quem controla de onde (2026-09-23 noite):** o **dono** opera de casa ou da loja. O **funcionário** só opera se o celular estiver na **mesma rede da Central** (Wi‑Fi da loja). Fora disso vê a página “Fora do Wi‑Fi da loja”. `geek.local` no Android **não** resolve — o link do dia a dia é `loja.geekloja.com.br`.

```
Celular (navegador / PWA)
    │
    ├─ Wi‑Fi da loja ──► https://loja.geekloja.com.br/admin
    │                    (dono e equipe controlam)
    │                         │
    │                         ▼
    │                   PC principal (motor, sem janela de controle)
    │                         │
    │                         ├── LAN/WS ──► GeekLocks
    │                         └── túnel já existente ──► api.geekloja.com.br
    │                                                      (portal + Pix)
    │
    └─ outra rede ──► mesmo link
                      dono: controla
                      equipe: página “fora do Wi‑Fi”
```

Os GeekLock **não** falam com o celular nem com a casa.

---

## Decisões fechadas (grilling)

| # | Pergunta | Escolha |
|---|----------|---------|
| 1 | O que sobra no PC | **Só motor** — sem painel Electron de controle |
| 2 | Controle dos PCs | **Dono** em qualquer lugar · **funcionário** só no Wi‑Fi da loja (mesma rede da Central, não `geek.local`) |
| 3 | Ver de casa | Dono controla · funcionário vê a página “fora do Wi‑Fi” |
| 4 | UI | GeekAdmin que já existe (`web/`), mobile-first — **sem app nativo, sem painel novo** |
| 5 | Contas | Cada um tem **usuário + senha**; dono cria/desativa |
| 6 | Papéis | **Dono** = tudo · **Funcionário** = opera (sem config/túnel/LGPD/contas) |
| 7 | Quem entra de casa | Dono opera. Funcionário entra e vê “fora do Wi‑Fi” (API recusa comando) |
| 8 | Abrir no celular | Link no navegador **e** “Adicionar à tela inicial” (PWA) |
| 9 | Equipe + auditoria | Aba **Equipe** (contas). Log “quem mexeu” na **Ajuda** (já existe), com o **nome** |
| 10 | Links | Dia a dia: `https://loja.geekloja.com.br/admin` · Casa (dono): `https://admin.geekloja.com.br` · `geek.local` é fallback (Android não resolve) |
| 11 | Quando implementar | **Só quando o dono mandar.** Fila atual não muda. |

---

## Defaults de implementação (fechados no desenho; não são pergunta)

Estes pontos não voltaram à fronteira — ficam assim para não reinventar na hora do código:

| Tema | Default |
|------|---------|
| Motor no PC | Continua o processo GeekCentral: autostart + **bandeja** (ícone “API ok”). Sem janela de operação. |
| Bootstrap do dono | Enquanto **não** existir conta dono, `ADMIN_PASSWORD` ainda entra. No primeiro acesso local, o GeekAdmin **obriga** criar usuário+senha do dono. Depois disso, senhas compartilhadas (`ADMIN_PASSWORD`, `CLERK_PASSWORD`) **deixam de autenticar**. |
| Login | Campo usuário + senha (hoje só tem senha). JWT continua; gravar `userId` + `username` + `role` no token. |
| Auditoria (G7) | Venda de hora, liberar/travar PC, PIN admin, comandos de estação: `actor` = nome do usuário, não `admin`/`clerk`. |
| Controle | **Dono** escreve em qualquer host do painel (`loja.` / `admin.` / LAN). **Funcionário** só se estiver na mesma rede da Central: host LAN (`192.168.x`, `geek.local`) **ou** (túnel + `CF-Connecting-IP` igual ao IPv4 público da loja / mesma /24). Não é o nome do Wi‑Fi — é o IP. |
| Fora do Wi‑Fi | Funcionário logado fora da rede vê página própria. API devolve `off_store_wifi` em comando/caixa. |
| `geek.local` | PC anuncia mDNS. Android/Chrome **não** resolvem. Não depende disso para a equipe. |
| Casa | **Novo hostname** no túnel **já existente** `loja-geek-api`. **Não** recriar domínio, túnel nem `api.geekloja.com.br`. |
| Access | Cloudflare Access só em `admin.geekloja.com.br`. **Não** colocar Access em `/api/health` nem `/api/portal/*` (quebra Pix). |
| Portal / Pix | Continuam em `https://api.geekloja.com.br`. |

---

## Os dois links

| Uso | URL | Quem | O que pode |
|-----|-----|------|------------|
| Loja (dia a dia) | `https://loja.geekloja.com.br/admin` | Dono e equipe **no Wi‑Fi da loja** | Controle segundo o papel |
| Casa | `https://admin.geekloja.com.br` ou o mesmo `loja.` | Dono | Controla |
| Casa | mesmo link | Funcionário | Página “Fora do Wi‑Fi da loja” |
| API pública (já existe) | `https://api.geekloja.com.br` | Portal, MP, health | Sem GeekAdmin de operação |
| Fallback LAN | `http://192.168.3.70:8787/admin` | Equipe se o túnel não mandar o IP | Só no Wi‑Fi |

Túnel atual (`loja-geek-api`, UUID `b9406016-bea4-4398-b6e4-48f43e398af5`): acrescentar ingress, sem apagar o de `api.geekloja.com.br`:

```yaml
ingress:
  - hostname: api.geekloja.com.br
    service: http://127.0.0.1:8787
  - hostname: admin.geekloja.com.br
    service: http://127.0.0.1:8787
  - service: http_status:404
```

DNS CNAME `admin` → o mesmo túnel. Access self-hosted nesse hostname.

---

## Papéis (já existem no código; passam a ser por pessoa)

| Ação | Dono | Funcionário no Wi‑Fi | Funcionário fora | Dono em casa |
|------|------|----------------------|------------------|--------------|
| Ver estações / Saúde / VIP / caixa | sim | sim | página fora do Wi‑Fi | sim |
| Liberar / travar PC, vender hora | sim | sim | **não** | **sim** |
| Config, túnel, backup, LGPD | sim | não | não | sim |
| Criar/desativar contas (aba Equipe) | sim | não | não | sim |
| Pareamento (código 6 dígitos) | sim | sim | não | sim |

---

## Fora de escopo (desta feature)

- App nativo (Android/iOS) / ler o nome do Wi‑Fi (SSID) — só comparamos IP da Central × IP do pedido
- Painel novo além do GeekAdmin
- Recriar domínio / túnel `loja-geek-api`
- Estabilidade WS, setup avançado, update Lock, boot rápido do Lock — filas **já** documentadas; não misturar

---

## Critério de pronto

- [x] PC principal sobe o motor sem janela de controle (bandeja + autostart)
- [x] `http://geek.local` (mDNS) + fallback IP no status
- [x] Login usuário + senha; bootstrap do dono; Ajuda com nome
- [x] Aba Equipe (criar/desativar)
- [x] Funcionário sem Config / Equipe
- [x] PWA (manifest + service worker)
- [x] Dono controla de casa; funcionário só na rede da Central
- [x] Página “Fora do Wi‑Fi da loja” para a equipe fora da rede
- [ ] Na loja: CNAME `admin` no túnel existente + Cloudflare Access
- [ ] Validar celular + Lock na LAN

---

## Onde mexer (quando for a hora)

- `server` — contas, login usuário+senha, `actor` nominal, recusar comando fora da LAN
- `web` — login, aba Equipe, mobile/PWA, esconder comandos em casa
- `agent-central-windows` — motor sem janela; anúncio `geek.local`
- Túnel / DNS — hostname `admin` no túnel existente + Access
- Docs: marcar esta página como implementado; atualizar [`REMOTE-MONITOR.md`](./REMOTE-MONITOR.md)

---

## Relacionados

- [`REMOTE-MONITOR.md`](./REMOTE-MONITOR.md) — checklist Access (ops); o produto é este arquivo
- [`CENTRAL-LOCK-MELHORIAS.md`](./CENTRAL-LOCK-MELHORIAS.md) — próxima implementação = estabilidade WS
- [`UI-TELA-PEQUENA.md`](./UI-TELA-PEQUENA.md) — compacto no Electron; o controle passa a ser o celular
- [`SETUP-WINDOWS-LOJA.md`](./SETUP-WINDOWS-LOJA.md) — túnel e domínio já prontos (não refazer)
- [`LISTA-COMPLETA.md`](./LISTA-COMPLETA.md) — G7 (auditoria quem fez o quê) entra nesta feature
