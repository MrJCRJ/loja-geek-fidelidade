# Documentação — Loja Geek

Atualizado em **2026-10-03**.  
Repo: https://github.com/MrJCRJ/loja-geek-fidelidade

**Não commitar:** `.env`, token de estação, `cert.pem`, JSON do túnel, senhas.  
**Não recriar:** domínio `geekloja.com.br`, túnel `loja-geek-api`, API `https://api.geekloja.com.br`.

**Mapa do negócio (canônico):** [`NEGOCIO-GEEK.md`](./NEGOCIO-GEEK.md) — unidades, dinheiro, sistemas, 30 dias + backlog.  
**Ops do dia a dia:** [`PENDENCIAS.md`](./PENDENCIAS.md).  
**Vivo vs arquivo no monorepo:** [`VIVO-VS-ARQUIVO.md`](./VIVO-VS-ARQUIVO.md).  
**Snapshot loja (set/2026):** [`ESTADO-SISTEMA-2026-09-30.md`](./ESTADO-SISTEMA-2026-09-30.md).

---

## Agora

| Tema | Onde está |
|------|-----------|
| Negócio Geek (unidades, WA, roadmap 30d/6m) | [NEGOCIO-GEEK.md](./NEGOCIO-GEEK.md) |
| O que falta / foco ops | [PENDENCIAS.md](./PENDENCIAS.md) |
| Handoff Lock / versões | [geeklock-handoff.md](./geeklock-handoff.md) |
| Quem controla de onde (dono / equipe / Wi‑Fi) | [GEEKADMIN-CELULAR.md](./GEEKADMIN-CELULAR.md) |
| Atualizar o GeekCentral | [UPDATE-GEEKCENTRAL.md](./UPDATE-GEEKCENTRAL.md) |
| Avaliação Google / textos | [atracao/TEXTOS-AVALIAR.txt](./atracao/TEXTOS-AVALIAR.txt) |

---

## Loja (PC e estações)

| Doc | Para quê |
|-----|----------|
| [SETUP-WINDOWS-LOJA.md](./SETUP-WINDOWS-LOJA.md) | PC **principal** no Windows — sem recriar túnel |
| [GEEKLOCK-INSTALAR-ESTACOES.md](./GEEKLOCK-INSTALAR-ESTACOES.md) | Instalar / atualizar Lock nas estações (pendrive; SMB não empurra) |
| [ATUALIZAR-GEEKLOCK-ESTACAO.md](./ATUALIZAR-GEEKLOCK-ESTACAO.md) | Prompt curto no PC da estação |
| [PAIRING-CODIGO-CURTO.md](./PAIRING-CODIGO-CURTO.md) | Pareamento LAN (sem código) |
| [PROMPT-PC-PRINCIPAL.txt](./PROMPT-PC-PRINCIPAL.txt) | Colar no Cursor do PC principal |
| [PROMPT-PC-GEEKLOCK.txt](./PROMPT-PC-GEEKLOCK.txt) | Colar no Cursor do GeekLock |

---

## Casa e painel

| Doc | Para quê |
|-----|----------|
| [GEEKADMIN-CELULAR.md](./GEEKADMIN-CELULAR.md) | `loja.geekloja.com.br` — dono de qualquer lugar; equipe só no Wi‑Fi da loja |
| [REMOTE-MONITOR.md](./REMOTE-MONITOR.md) | CNAME `admin` + Cloudflare Access (ops; depois de estável) |

---

## Túnel, portal, dinheiro

| Doc | Para quê |
|-----|----------|
| [portal-api-tunnel.md](./portal-api-tunnel.md) | Túnel + portal + webhook |
| [cloudflared-config.example.md](./cloudflared-config.example.md) | Exemplo `config.yml` (sem credencial) |
| [loja-ready.md](./loja-ready.md) | Checklist `loja:ready` |

---

## Central ↔ Lock (backlog — não implementar sem pedido)

| Doc | Para quê |
|-----|----------|
| [CENTRAL-LOCK-MELHORIAS.md](./CENTRAL-LOCK-MELHORIAS.md) | Estabilidade WS, setup, update Lock |
| [GEEKLOCK-BOOT-RAPIDO.md](./GEEKLOCK-BOOT-RAPIDO.md) | Boot lento (só medir na loja) |
| [UI-TELA-PEQUENA.md](./UI-TELA-PEQUENA.md) | UI compacta (já no código) |
| [estacao-modos.md](./estacao-modos.md) | Modos da estação |
| [exe-instalacao-autostart.md](./exe-instalacao-autostart.md) | Ideias de instalador |
| [rotacao-station-secret.md](./rotacao-station-secret.md) | Rotação do segredo |
| [teorias-producao.md](./teorias-producao.md) | Riscos T6 staff unlock, saldo, presença |

---

## Incidentes e Cursor na loja

| Doc | Para quê |
|-----|----------|
| [ESTADO-SISTEMA-2026-09-30.md](./ESTADO-SISTEMA-2026-09-30.md) | Snapshot loja + incidente túnel/DNS 2026-09-30 |
| [INCIDENTE-GEEKLOCK-IP-2026-09-30.md](./INCIDENTE-GEEKLOCK-IP-2026-09-30.md) | GeekLock offline: Central perdeu IP `.70` (DHCP → `.116`) |
| [CORRECAO-LOJA-2026-09-22.md](./CORRECAO-LOJA-2026-09-22.md) | `lan-discovery` fora do asar |
| [COMO-CORRIGIR-BUILD-LAN-DISCOVERY.md](./COMO-CORRIGIR-BUILD-LAN-DISCOVERY.md) | Como não repetir no build |
| [CURSOR-PACK-LOJA.md](./CURSOR-PACK-LOJA.md) | Pack grill-me no pendrive |

---

## Histórico / ideias (não é a fila de hoje)

Ver também [`VIVO-VS-ARQUIVO.md`](./VIVO-VS-ARQUIVO.md). Prioridade de produto = [`NEGOCIO-GEEK.md`](./NEGOCIO-GEEK.md) + topo de [`roadmap.md`](./roadmap.md).

| Doc | Para quê |
|-----|----------|
| [arquivo/](./arquivo/) | Docs históricos (LISTA-COMPLETA, MELHORIAS, REFINO, etc.) |
| [roadmap.md](./roadmap.md) | Roadmap (topo alinhado 2026-10-03) |
| [ECOSSISTEMA.md](./ECOSSISTEMA.md) | Ferramentas externas |
| [quiosque-windows.md](./quiosque-windows.md) | Assigned Access |
| [telemetria.md](./telemetria.md) | Telemetria |
| [litestream.md](./litestream.md) | Backup SQLite |
| [syncthing.md](./syncthing.md) | Sync de pastas |
| [uptime-kuma.md](./uptime-kuma.md) | Monitor de uptime |
| [whatsapp-evolution.md](./whatsapp-evolution.md) | WhatsApp Evolution |
