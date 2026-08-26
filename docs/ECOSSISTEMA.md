# Ferramentas e projetos úteis — Loja Geek

Atualizado em **2026-08-25**.

Este texto é um **guia em português simples**: o que cada coisa faz na prática da loja, sem jargão.

Pense assim:

- **Projeto / serviço** = um produto externo (site, app, conta) que a loja pode usar.
- **Plugin / biblioteca** = pedaço de código que se encaixa no GeekCentral, GeekLock ou no site.

Não precisa instalar tudo. Use a ordem de prioridade no final.

---

## 1. O que o Geek já tem (não precisa trocar)

| Nome | Em uma frase |
|------|----------------|
| **GeekCentral** | O PC da loja que controla tudo (cadastro, estações, config). |
| **GeekLock** | O app em cada PC de jogo que trava até reconhecer o VIP. |
| **Portal (site)** | O site do cliente (saldo, Pix, cadastro facial). |
| **Mercado Pago** | Já está no código para receber Pix / checkout. |
| **Cloudflare Tunnel** | “Túnel” para o site na internet falar com o PC da loja. |
| **Vercel** | Onde o site do cliente fica hospedado. |
| **SQLite** | O arquivo de banco de dados na pasta `data/` do Central. |

---

## 2. Dinheiro (Pix e cartão)

| Nome | Para que serve na loja | Quando vale a pena |
|------|------------------------|--------------------|
| **Mercado Pago (ativar de verdade)** | Cliente paga no site e o saldo sobe sozinho. | **Agora** — já está pronto no código; falta só a conta + token. |
| **Asaas** | Bom para cobrança mensal (assinatura) e boleto/Pix. | Se a assinatura for o produto principal. |
| **Pagar.me / Stone** | Outro meio de receber; às vezes taxa melhor no cartão. | Se a loja crescer e negociar taxa. |
| **InfinitePay / Cora** | Pix barato no celular/maquininha. | Mais para **balcão**, não substitui o site sozinho. |

**Resumo:** continue com **Mercado Pago**. Os outros só se a taxa ou a assinatura pedirem.

---

## 3. Deixar os PCs da loja mais “à prova de cliente”

| Nome | Para que serve | Em português simples |
|------|----------------|----------------------|
| **Modo quiosque do Windows** (Assigned Access) | O PC só abre o GeekLock (ou quase). | Impede o cliente de abrir Chrome e bagunçar o Windows. |
| **AutoHotkey** | Atalhos no teclado / scripts no Windows. | Ex.: staff aperta uma tecla e força logout do Steam. |
| **Playnite** (ou launcher parecido) | Organiza jogos e pode fechar tudo ao sair. | Ajuda quando um VIP sai e o próximo herda o Steam logado. |
| **nssm** ou serviço Windows | Mantém a API / túnel ligados mesmo se fechar a janela. | O “motor” da loja não cai porque alguém fechou um terminal. |

**Resumo:** GeekLock já trava a tela. Essas peças evitam o que o GeekLock **não controla** (Steam, Discord, Windows).

---

## 4. Rosto / câmera (melhorar o reconhecimento)

| Nome | Para que serve | Precisa trocar o que já temos? |
|------|----------------|--------------------------------|
| **OpenCV (YuNet + SFace)** | Já é o que reconhece o VIP. | Não — é o coração atual. |
| **MediaPipe** (Google) | Ajuda a ver se o rosto está de lado, longe, tapado. | Não obrigatório; seria um “assistente” de qualidade. |
| **ONNX Runtime** | Roda o modelo de face mais leve em PC fraco. | Só se a estação for muito lenta. |

**Resumo:** o reconhecimento já funciona. Só mexa aqui se a loja reclamar de luz/câmera demais.

---

## 5. Não perder dados / ver se está online

| Nome | Para que serve | Em português simples |
|------|----------------|----------------------|
| **Backup que o Geek já faz** | Copia o banco SQLite de tempos em tempos. | Já existe na Config do Central. |
| **Litestream** | Copia o banco **o tempo todo** para a nuvem/outro PC. | Seguro extra se o HD do Central queimar. |
| **Syncthing** | Sincroniza a pasta `data/` com outro computador. | Backup “caseiro” entre dois PCs. |
| **Uptime Kuma** | Painel “está no ar?” (API, site, túnel). | Você vê no celular se a loja caiu. |
| **Sentry** | Avisa quando o site ou a API dão erro. | Em vez de o cliente só falar “bugou”. |

**Resumo:** backup local já tem. Litestream/Syncthing = não perder a loja. Uptime/Sentry = saber rápido quando cai.

---

## 6. Site do cliente (portal)

| Nome | Para que serve |
|------|----------------|
| **Avisos no celular (web-push)** | “Seu saldo está acabando” mesmo com o site fechado. |
| **Workbox** | Deixa o app do site (PWA) mais estável offline. |
| **Evolution API** ou **Baileys** | Robô de **WhatsApp** (saldo, Pix, “PC livre”). |
| **QR Code** | Cliente escaneia no balcão para pagar / ver saldo. |

**Resumo:** WhatsApp automático e aviso de saldo no celular são os que mais melhoram a experiência do cliente.

---

## 7. Internet da loja ↔ site

| Nome | Para que serve |
|------|----------------|
| **Cloudflare Tunnel com nome fixo** | O site sempre acha a mesma URL da API (não muda toda vez). |
| **Tailscale** ou **ZeroTier** | Plano B: uma “VPN” simples se o túnel Cloudflare falhar. |

**Resumo:** o P0 da loja é o **túnel com nome fixo**. Sem isso, Pix e portal quebram quando a URL muda.

---

## 8. Atualizar GeekLock / GeekCentral sem pendrive

| Nome | Para que serve |
|------|----------------|
| **electron-updater** | O app baixa atualização sozinho (como um app de celular). |
| **Assinatura de código (code signing)** | Windows reclama menos de “app desconhecido / vírus”. |

**Resumo:** hoje você copia pasta/pendrive. Com updater, a loja atualiza com bem menos trabalho.

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

1. **Mercado Pago real** + webhook (cliente paga e ganha hora).  
2. **Túnel Cloudflare com nome fixo** (site sempre encontra a loja).  
3. **Regenerar GeekLock/Central** com as mitigações novas (saldo, ausência, etc.).  
4. **Backup extra** (Litestream ou Syncthing) — não perder o banco.  
5. **Sentry** ou **Uptime Kuma** — saber quando cai.  
6. **electron-updater** — atualizar sem pendrive.  
7. **WhatsApp automático** — se a loja já usa muito WhatsApp.  
8. Só depois: Asaas, MediaPipe, modo quiosque Windows avançado.

---

## 11. O que *não* precisa agora

- Trocar OpenCV por outra face “mágica” na nuvem (custa, LGPD, internet).  
- Stripe (foco Brasil / Pix → Mercado Pago basta).  
- Microserviços / Redis / Kubernetes (o monorepo local já resolve a loja).

---

## Relacionados

- Checklist da loja: [`loja-ready.md`](./loja-ready.md)  
- Problemas de sessão e mitigações: [`teorias-producao.md`](./teorias-producao.md)  
- Melhorias gerais: [`MELHORIAS.md`](./MELHORIAS.md)
