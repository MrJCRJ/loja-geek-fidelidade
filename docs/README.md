# Documentação — Loja Geek

Atualizado em **2026-09-23**.  
Repo: https://github.com/MrJCRJ/loja-geek-fidelidade

Índice de **todos** os docs da pasta `docs/`. Comece pelo que a visita precisa; o resto é histórico ou backlog.

**Não commitar:** `.env`, token de estação, `cert.pem`, JSON do túnel, senhas.

---

## Começar por aqui (loja)

| Doc | Para quê |
|-----|----------|
| [PENDENCIAS.md](./PENDENCIAS.md) | Estado ops hoje (domínio, túnel, MP, o que falta) |
| [SETUP-WINDOWS-LOJA.md](./SETUP-WINDOWS-LOJA.md) | PC **principal** (GeekCentral) no Windows — sem recriar túnel |
| [GEEKLOCK-INSTALAR-ESTACOES.md](./GEEKLOCK-INSTALAR-ESTACOES.md) | Instalar / atualizar GeekLock nas estações (pendrive, LAN, o que **não** dá da rede) |
| [ATUALIZAR-GEEKLOCK-ESTACAO.md](./ATUALIZAR-GEEKLOCK-ESTACAO.md) | Prompt curto para o agent **no PC da estação** |
| [GEEKADMIN-CELULAR.md](./GEEKADMIN-CELULAR.md) | Controle no celular (`loja.geekloja.com.br` / `geek.local`); casa só lê |
| [PAIRING-CODIGO-CURTO.md](./PAIRING-CODIGO-CURTO.md) | Código de 6 dígitos (sem segredo longo) |

Prompts para colar no Cursor:

- PC principal: [PROMPT-PC-PRINCIPAL.txt](./PROMPT-PC-PRINCIPAL.txt)
- PC GeekLock: [PROMPT-PC-GEEKLOCK.txt](./PROMPT-PC-GEEKLOCK.txt)

---

## Central ↔ Lock

| Doc | Para quê |
|-----|----------|
| [CENTRAL-LOCK-MELHORIAS.md](./CENTRAL-LOCK-MELHORIAS.md) | Handoff: estabilidade, setup, update Lock (backlog) |
| [UPDATE-GEEKCENTRAL.md](./UPDATE-GEEKCENTRAL.md) | Atualizar Central via GitHub Releases |
| [GEEKLOCK-BOOT-RAPIDO.md](./GEEKLOCK-BOOT-RAPIDO.md) | Boot lento do Lock (documentado; não implementar sem pedido) |
| [estacao-modos.md](./estacao-modos.md) | Modos da estação |
| [exe-instalacao-autostart.md](./exe-instalacao-autostart.md) | Ideias de instalador / autostart |
| [rotacao-station-secret.md](./rotacao-station-secret.md) | Rotação do segredo da estação |
| [teorias-producao.md](./teorias-producao.md) | Riscos de produção (T6 staff unlock, saldo, presença) |
| [UI-TELA-PEQUENA.md](./UI-TELA-PEQUENA.md) | UI compacta no Central |

---

## Portal, túnel, dinheiro

| Doc | Para quê |
|-----|----------|
| [portal-api-tunnel.md](./portal-api-tunnel.md) | Túnel + portal + webhook |
| [cloudflared-config.example.md](./cloudflared-config.example.md) | Exemplo `config.yml` (sem credencial) |
| [loja-ready.md](./loja-ready.md) | Checklist `loja:ready` |
| [REMOTE-MONITOR.md](./REMOTE-MONITOR.md) | Ver de casa (`admin.geekloja.com.br`) — depois de estável |
| [portal-backlog.md](./portal-backlog.md) | Backlog do portal |
| [UX-LISTAS-E-COMPRA.md](./UX-LISTAS-E-COMPRA.md) | Listas / compra hora↔R$ |

---

## Incidentes e Cursor na loja

| Doc | Para quê |
|-----|----------|
| [CORRECAO-LOJA-2026-09-22.md](./CORRECAO-LOJA-2026-09-22.md) | `lan-discovery` fora do asar |
| [COMO-CORRIGIR-BUILD-LAN-DISCOVERY.md](./COMO-CORRIGIR-BUILD-LAN-DISCOVERY.md) | Como não repetir o erro no build |
| [CURSOR-PACK-LOJA.md](./CURSOR-PACK-LOJA.md) | Pack grill-me no pendrive `Cursor-Agent` |

---

## Visão larga / backlog (não fazer nesta visita)

| Doc | Para quê |
|-----|----------|
| [LISTA-COMPLETA.md](./LISTA-COMPLETA.md) | Lista histórica do sistema inteiro |
| [MELHORIAS.md](./MELHORIAS.md) | Melhorias |
| [REFINO.md](./REFINO.md) | Refino |
| [roadmap.md](./roadmap.md) | Roadmap |
| [ECOSSISTEMA.md](./ECOSSISTEMA.md) | Ferramentas externas (MP, quiosque, etc.) |
| [quiosque-windows.md](./quiosque-windows.md) | Assigned Access |
| [telemetria.md](./telemetria.md) | Telemetria |
| [litestream.md](./litestream.md) | Backup SQLite |
| [syncthing.md](./syncthing.md) | Sync de pastas |
| [uptime-kuma.md](./uptime-kuma.md) | Monitor de uptime |
| [whatsapp-evolution.md](./whatsapp-evolution.md) | WhatsApp Evolution |

Já escolhidos e **não recriar:** domínio `geekloja.com.br`, túnel `loja-geek-api`, API `https://api.geekloja.com.br`.
