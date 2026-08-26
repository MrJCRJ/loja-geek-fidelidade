# Ferramentas e projetos úteis — Loja Geek

Atualizado em **2026-08-26** (pesquisa + implementação parcial no código).

Este texto é um **guia em português simples**: o que cada coisa faz na prática da loja, sem jargão.

Pense assim:

- **Projeto / serviço** = um produto externo (site, app, conta) que a loja pode usar.
- **Plugin / biblioteca** = pedaço de código que se encaixa no GeekCentral, GeekLock ou no site.

Não precisa instalar tudo. Use a ordem de prioridade no final.

**Legenda de status:** `[x]` no código · `[~]` base pronta / falta conta · `[ ]` só doc · `[ops]` só na loja

---

## 1. O que o Geek já tem (não precisa trocar)

| Nome | Em uma frase | Status |
|------|----------------|--------|
| **GeekCentral** | O PC da loja que controla tudo (cadastro, estações, config). | `[x]` |
| **GeekLock** | O app em cada PC de jogo que trava até reconhecer o VIP. | `[x]` |
| **Portal (site)** | O site do cliente (saldo, Pix, cadastro facial). | `[x]` |
| **Mercado Pago** | Já está no código para receber Pix / checkout. | `[~]` falta token live |
| **Cloudflare Tunnel** | “Túnel” para o site na internet falar com o PC da loja. | `[ops]` nome fixo |
| **Vercel** | Onde o site do cliente fica hospedado. | `[x]` |
| **SQLite** | O arquivo de banco de dados na pasta `data/` do Central. | `[x]` |

---

## 2. Dinheiro (Pix e cartão)

| Nome | Para que serve na loja | Quando vale a pena | Status |
|------|------------------------|--------------------|--------|
| **Mercado Pago (ativar de verdade)** | Cliente paga no site e o saldo sobe sozinho. | **Agora** — código pronto; falta conta + `MP_ACCESS_TOKEN` + webhook HTTPS. | `[ops]` |
| **Asaas** | Cobrança mensal (assinatura) e boleto/Pix. | Se a assinatura for o produto principal. | `[ ]` |
| **Pagar.me / Stone** | Outro meio de receber; às vezes taxa melhor no cartão. | Se a loja crescer e negociar taxa. | `[ ]` |
| **InfinitePay / Cora** | Pix barato no celular/maquininha. | Mais para **balcão**, não substitui o site. | `[ ]` |

**Resumo:** continue com **Mercado Pago**. Os outros só se a taxa ou a assinatura pedirem.

---

## 3. Deixar os PCs da loja mais “à prova de cliente”

| Nome | Para que serve | Em português simples | Status |
|------|----------------|----------------------|--------|
| **Modo quiosque do Windows** (Assigned Access) | O PC só abre o GeekLock (ou quase). | Impede o cliente de abrir Chrome e bagunçar o Windows. | `[~]` [`quiosque-windows.md`](./quiosque-windows.md) |
| **AutoHotkey** | Atalhos no teclado / scripts no Windows. | Ex.: staff aperta uma tecla e força logout do Steam. | `[ ]` |
| **Playnite** (ou launcher parecido) | Organiza jogos e pode fechar tudo ao sair. | Ajuda quando um VIP sai e o próximo herda o Steam logado. | `[ ]` |
| **nssm** ou serviço Windows | Mantém a API / túnel ligados mesmo se fechar a janela. | O “motor” da loja não cai porque alguém fechou um terminal. | `[~]` GeekCentral já sobe serviços |

**Resumo:** GeekLock já trava a tela. Essas peças evitam o que o GeekLock **não controla** (Steam, Discord, Windows).

---

## 4. Rosto / câmera (melhorar o reconhecimento)

| Nome | Para que serve | Precisa trocar o que já temos? | Status |
|------|----------------|--------------------------------|--------|
| **OpenCV (YuNet + SFace)** | Já é o que reconhece o VIP. | Não — é o coração atual. | `[x]` |
| **MediaPipe** (Google) | Ajuda a ver se o rosto está de lado, longe, tapado. | Não obrigatório; portal já usa tasks-vision no enroll. | `[~]` |
| **ONNX Runtime** | Roda o modelo de face mais leve em PC fraco. | Só se a estação for muito lenta. | `[ ]` |

**Resumo:** o reconhecimento já funciona. Só mexa aqui se a loja reclamar de luz/câmera demais.

---

## 5. Não perder dados / ver se está online

| Nome | Para que serve | Em português simples | Status |
|------|----------------|----------------------|--------|
| **Backup que o Geek já faz** | Copia o banco SQLite de tempos em tempos. | Já existe na Config do Central. | `[x]` |
| **Litestream** | Copia o banco **o tempo todo** para S3/R2. | Seguro extra se o HD do Central queimar. Preferir **Cloudflare R2** (egress barato). | `[~]` ver [`litestream.md`](./litestream.md) |
| **Syncthing** | Sincroniza a pasta `data/` com outro computador. | Backup “caseiro” entre dois PCs. | `[~]` [`syncthing.md`](./syncthing.md) |
| **Uptime Kuma** | Painel “está no ar?” (API, site, túnel). | Você vê no celular se a loja caiu. Self-host leve. | `[~]` [`uptime-kuma.md`](./uptime-kuma.md) |
| **Sentry** | Avisa quando o site ou a API dão erro. | Liga com `SENTRY_DSN` / `VITE_SENTRY_DSN`. | `[~]` no código |

**Notas 2026 (pesquisa):**

- Litestream replica o WAL do SQLite para storage S3-compatível; em produção use systemd/Docker e teste `litestream restore`.
- Sentry: SDK Node (Fastify) + React (Vite). Sem DSN = desligado (zero custo).
- Uptime Kuma continua a melhor opção caseira de “está no ar?” — não precisa de código no monorepo.

**Resumo:** backup local já tem. Litestream = não perder a loja. Uptime/Sentry = saber rápido quando cai.

---

## 6. Site do cliente (portal)

| Nome | Para que serve | Status |
|------|----------------|--------|
| **Avisos no celular (web-push)** | “Seu saldo está acabando” com o site fechado. VAPID; no **iPhone** só funciona se o PWA estiver na Tela de Início. | `[~]` VAPID + SW + dashboard |
| **Workbox / PWA** | Portal mais estável offline (precache + network-first HTML). | `[~]` `portal/public/sw.js` (estratégias estilo Workbox) |
| **Evolution API** ou **Baileys** | Robô de **WhatsApp** (saldo, Pix pago). | `[~]` código + [`whatsapp-evolution.md`](./whatsapp-evolution.md); falta instância |
| **QR Code** | Cliente escaneia no balcão. | `[x]` estações no Central |

**Resumo:** WhatsApp automático e aviso de saldo no celular são os que mais melhoram a experiência do cliente.

---

## 7. Internet da loja ↔ site

| Nome | Para que serve | Status |
|------|----------------|--------|
| **Cloudflare Tunnel com nome fixo** | O site sempre acha a mesma URL da API. | `[ops]` P0 |
| **Tailscale** ou **ZeroTier** | Plano B: VPN simples se o túnel falhar. | `[ ]` |

**Resumo:** o P0 da loja é o **túnel com nome fixo**. Sem isso, Pix e portal quebram quando a URL muda.

---

## 8. Atualizar GeekLock / GeekCentral sem pendrive

| Nome | Para que serve | Status |
|------|----------------|--------|
| **electron-updater** | O app baixa atualização sozinho via GitHub Releases (`latest.yml`). | `[~]` base no código |
| **Assinatura de código (code signing)** | Windows reclama menos de “app desconhecido / vírus”. | `[ops]` certificado |

**Notas 2026:** no Windows o update confiável precisa de build **NSIS** (não só pasta `dir` do pendrive) + release no GitHub. Código assinado reduz falso positivo do Defender.

**Resumo:** hoje você copia pasta/pendrive. Com updater + release, a loja atualiza com bem menos trabalho.

---

## 9. Extensões no Cursor (só para quem programa)

Isso **não** aparece para o cliente da loja. Ajuda você a editar o código:

| Extensão | Ajuda em quê |
|----------|----------------|
| **ESLint / Prettier** | Código mais organizado, menos erro bobo. |
| **Python (Pylance)** | Editar o serviço de face com menos erro. |
| **SQLite Viewer** | Abrir o banco `data/*.db` e ver clientes/sessões. |
| **REST Client** ou Thunder Client | Testar “a API responde?” sem inventar tela. |
| **GitLens** | Ver quem mudou o quê no GitHub. |
| **Context7** (MCP) | Buscar documentação atualizada de libs (Fastify, etc.). |
| **Docker** | Subir face+API com um comando. |
| **Error Lens** | Mostra erro vermelho na linha do código. |

---

## 10. Ordem recomendada (o que fazer primeiro)

Faça nesta ordem — do que destrava a loja para o que é “nice to have”:

1. **Mercado Pago real** + webhook (cliente paga e ganha hora). `[ops]`  
2. **Túnel Cloudflare com nome fixo** (site sempre encontra a loja). `[ops]`  
3. **Regenerar GeekLock/Central** com as mitigações novas (saldo, ausência, etc.). `[ops]`  
4. **Backup extra** (Litestream → R2) — não perder o banco. `[~]` docs + exemplo  
5. **Sentry** (e/ou Uptime Kuma) — saber quando cai. `[~]` Sentry + doc Kuma  
6. **electron-updater** + release NSIS — atualizar sem pendrive. `[~]` base  
7. **Web-push** + **WhatsApp Evolution** (saldo / Pix pago). `[~]` falta VAPID + Evolution na loja  
8. Só depois: Asaas, MediaPipe extra, quiosque Windows (doc já existe).

---

## 11. O que *não* precisa agora

- Trocar OpenCV por outra face “mágica” na nuvem (custa, LGPD, internet).  
- Stripe (foco Brasil / Pix → Mercado Pago basta).  
- Microserviços / Redis / Kubernetes (o monorepo local já resolve a loja).  
- Firebase Cloud Messaging só para push — **web-push + VAPID** basta (Chrome/Firefox/Safari).

---

## Relacionados

- Checklist da loja: [`loja-ready.md`](./loja-ready.md)  
- Litestream: [`litestream.md`](./litestream.md) · Syncthing: [`syncthing.md`](./syncthing.md) · Uptime: [`uptime-kuma.md`](./uptime-kuma.md)  
- WhatsApp: [`whatsapp-evolution.md`](./whatsapp-evolution.md) · Quiosque: [`quiosque-windows.md`](./quiosque-windows.md)  
- Problemas de sessão: [`teorias-producao.md`](./teorias-producao.md)  
- Melhorias: [`MELHORIAS.md`](./MELHORIAS.md) · Lista: [`LISTA-COMPLETA.md`](./LISTA-COMPLETA.md)
