# Estado do sistema — Loja Geek (snapshot 2026-09-30)

Documento para análise remota (casa / Cursor / GitHub).  
**Não contém** `.env`, tokens, senhas, `cert.pem` nem JSON de credencial do túnel.

Repo: https://github.com/MrJCRJ/loja-geek-fidelidade  
Snapshot loja: **2026-09-30 ~12:35 (UTC−3)**.  
Revisão casa/GitHub: **2026-09-30 ~15:40 (UTC−3)** — releases + pendrive 1.1.6.

---

## Em uma frase

O **PC principal** roda o **GeekCentral** (motor: API + face + túnel + LAN com os Locks).  
O **celular** controla pelo navegador. Os **GeekLocks** só falam com o Central na LAN.  
Portal/Pix/público passam por **`https://api.geekloja.com.br`** (túnel Cloudflare nomeado).

```
Celular (dono / equipe)
        │
        ▼
https://loja.geekloja.com.br  (e/ou geek.local na LAN)
        │
        ▼
PC principal Windows — C:\GeekCentral\
  ├── GeekCentral.exe (bandeja; sem janela de controle)
  ├── API Node :8787
  ├── face (python)
  └── cloudflared → túnel loja-geek-api
            │
            ├── api.geekloja.com.br   (público / portal / Pix)
            └── admin.geekloja.com.br (monitor / Access — ver REMOTE-MONITOR)
            │
            └── LAN/WS ──► GeekLocks (estações)
```

---

## O que NÃO recriar

| Item | Valor |
|------|--------|
| Domínio | `geekloja.com.br` (Registro.br; NS Cloudflare `nora` / `terry`) |
| Túnel Cloudflare | nome `loja-geek-api` · UUID `b9406016-bea4-4398-b6e4-48f43e398af5` |
| API pública | `https://api.geekloja.com.br` |
| Portal | `https://loja-geek-portal.vercel.app` · `VITE_API_URL=https://api.geekloja.com.br` |
| Pasta do motor na loja | `C:\GeekCentral\` (dados em `C:\GeekCentral\data\`) |

---

## Versões (GitHub agora vs loja no snapshot)

| Componente | Loja (~12:35) | GitHub agora (~15:40) | Situação |
|------------|---------------|------------------------|----------|
| GeekCentral | **1.1.3** em `C:\GeekCentral\` | **`central-v1.1.4` = Latest** | Loja **atrás** — atualizar via botão Central / ZIP |
| GeekLock (estações) | misto / pendrive antigo | **`lock-v1.1.6`** (`GeekLock-win-x64.zip`) | Atualizar estações (celular dono **ou** pendrive 1.1.6) |
| Código `main` | `2489b25` na loja | `6b57c44` (+ ci latest=Central) | Loja pode `git pull` no clone; motor = release, não a pasta git |
| Pendrive USB GEEKLOCK | tinha `.exe` de **24/09** + bat 1.1.5 | pack **1.1.6** gravado em casa (~15:15) | Reinstalar pelo `.bat` na loja com este USB |

### Releases GitHub (lista atual)

- GeekCentral **1.1.4** (`central-v1.1.4`) — **Latest** (updater do Central lê `/releases/latest`)  
- GeekLock **1.1.6** (`lock-v1.1.6`) — zip `GeekLock-win-x64.zip` (não é o Latest do repo)  
- GeekLock 1.1.5 (`v1.1.5`) — NSIS legado  
- GeekCentral 1.1.3 / Lock 1.1.4 …  

Atualizar Central: [`UPDATE-GEEKCENTRAL.md`](./UPDATE-GEEKCENTRAL.md).  
Atualizar Lock: Config no celular (dono) ou [`GEEKLOCK-INSTALAR-ESTACOES.md`](./GEEKLOCK-INSTALAR-ESTACOES.md) / pendrive.

### Checklist validar na loja (pós 1.1.4 / 1.1.6)

- [ ] Central: `C:\GeekCentral\VERSION.txt` = **1.1.4** (Atualizar mantendo `data\`)  
- [ ] Health: `http://192.168.3.70:8787/api/health` e `https://api.geekloja.com.br/api/health`  
- [ ] IP Wi‑Fi ainda **manual** `.70` (não voltou para DHCP)  
- [ ] Em cada estação: Lock **1.1.6** (`VERSION.txt` / Config → Atualizar GeekLock)  
- [ ] 1 VIP + 1 destravar equipe; WS reconecta se derrubar API (feature B)

---

## Processos e portas (PC principal, no momento do check)

| Processo | Papel | Observação |
|----------|--------|------------|
| `GeekCentral.exe` | Electron / bandeja | Vários processos filhos (normal) |
| `node.exe` (runtime do Central) | API em **0.0.0.0:8787** | `...\resources\runtime\node\server\dist\index.js` |
| `cloudflared.exe` | Túnel nomeado `loja-geek-api` | Binário sob `C:\GeekCentral\data\cloudflared\` |
| `python` | Face service | Health reporta `faceService: true` quando ok |

Tarefa agendada: **`GeekCentral-ManterLigado`** (estado Ready) — religa o motor/túnel se cair.

Health esperado:

- Local: `http://127.0.0.1:8787/api/health` → `{"ok":true,"faceService":true,...}`  
- Público: `https://api.geekloja.com.br/api/health` → mesmo formato  

No check de 2026-09-30 ambos respondiam **ok**.

---

## Rede / DNS (relevante para queda do “sistema”)

Interfaces vistas no PC da loja:

| Interface | DNS |
|-----------|-----|
| Ethernet | provedor (`177.53.147.127`, `177.53.146.32`) |
| Wi-Fi | gateway (`192.168.3.1`) |

Quando o Windows fica sem servidor DNS configurado, o **cloudflared morre** (não resolve `argotunnel.com`) e o portal/celular parecem “fora”, mesmo com a API local viva.

---

## Incidente 2026-09-30 — “Central caiu”

### Sintoma
Loja / portal / celular sem API pública.

### O que NÃO caiu
- `GeekCentral.exe` e API Node **:8787** — up desde **2026-09-28**.
- `faceService` no health local.

### O que caiu
- **Túnel Cloudflare (`cloudflared`)** em loop de falha/relançamento.

### Evidência (logs locais, sem secrets)

`C:\GeekCentral\data\cloudflared-tunnel.err.log` (~15:26Z):

- `Nenhum servidor DNS configurado para o sistema local.`
- Falha de lookup em `argotunnel.com` / SRV `_v2-origintunneld._tcp.argotunnel.com`
- Túnel encerra (`Tunnel server stopped`)

`C:\GeekCentral\data\manter-ligado.log` (~11:48–12:26 hora local):

- Várias linhas `cloudflared ausente - religando tunel`
- `tunel publico down - reiniciando cloudflared`

### Recuperação
DNS voltou nas interfaces; cloudflared estabilizou (~12:28 local); health público `ok` de novo.  
Código já tem religamento automático do túnel (commit `2489b25` no `main`).

### Mitigação
Parcialmente aplicada no incidente seguinte (IP fixo + DNS `1.1.1.1` na Wi‑Fi).  
Não mudar hostname do túnel nem recriar `loja-geek-api`.

---

## Incidente 2026-09-30 (tarde) — GeekLock “não está respondendo”

Doc completo: [`INCIDENTE-GEEKLOCK-IP-2026-09-30.md`](./INCIDENTE-GEEKLOCK-IP-2026-09-30.md).

### Sintoma
Estações GeekLock marcavam Central offline / sem resposta.

### Causa
Wi‑Fi do Central saiu de `192.168.3.70` (DHCP) para **`192.168.3.116`**.  
Locks continuavam em `http://192.168.3.70:8787`. API local estava ok.

### Correção
IP **manual** na Wi‑Fi: `192.168.3.70` /24, gateway `192.168.3.1`, DNS `192.168.3.1` + `1.1.1.1`.  
Health LAN e público ok de novo. Sem mudar `config.json` dos Locks.

---

## Papéis e URLs de uso

| Quem | Onde | Doc |
|------|------|-----|
| Dono | Qualquer rede → painel (`loja.geekloja.com.br` / admin) | [`GEEKADMIN-CELULAR.md`](./GEEKADMIN-CELULAR.md) |
| Equipe | Só Wi‑Fi da loja | idem |
| Cliente / portal | Vercel + API pública | [`portal-api-tunnel.md`](./portal-api-tunnel.md) |
| Estação | GeekLock → Central na LAN | [`GEEKLOCK-INSTALAR-ESTACOES.md`](./GEEKLOCK-INSTALAR-ESTACOES.md) · [`PAIRING-CODIGO-CURTO.md`](./PAIRING-CODIGO-CURTO.md) |

Prompts Cursor na loja:

- PC principal: [`PROMPT-PC-PRINCIPAL.txt`](./PROMPT-PC-PRINCIPAL.txt)  
- Estação: [`PROMPT-PC-GEEKLOCK.txt`](./PROMPT-PC-GEEKLOCK.txt)  

---

## O que já está feito (resumo ops)

- Domínio + zona Cloudflare Active  
- Túnel nomeado `loja-geek-api` → `api.geekloja.com.br`  
- GeekCentral **1.1.3** instalado em `C:\GeekCentral` com `data\` preservada  
- Motor só na bandeja (sem janela de controle)  
- Keepalive Windows `GeekCentral-ManterLigado`  
- Religa túnel se cloudflared sumir ou health público der 530  
- Portal Vercel apontando para a API fixa  
- Pareamento Lock por LAN (sem código de 6 dígitos)  
- Update Central/Lock via release GitHub (fluxo documentado)  
- Controle celular (dono remoto / equipe só na LAN) no código  
- Wi‑Fi do Central em IP manual `192.168.3.70` (+ DNS `1.1.1.1`) após incidente GeekLock  

Detalhe dia a dia: [`PENDENCIAS.md`](./PENDENCIAS.md).

---

## Pendências conhecidas (não reabrir decisões fechadas)

| Área | Situação |
|------|----------|
| Atualizar Central **1.1.4** na loja | `[ ]` (GitHub já tem; loja ainda em 1.1.3 no snapshot) |
| Atualizar Locks **1.1.6** | `[ ]` celular dono e/ou USB GEEKLOCK (pack 1.1.6 em casa) |
| Mercado Pago | Ainda sandbox / token `TEST-`; app “Loja Geek” e `APP_USR-` live pendentes |
| STRICT_SECRETS / senha admin default | Melhorar depois; cuidado com `loja:ready` |
| IP LAN do Central | `[x]` Wi‑Fi manual `192.168.3.70` + DNS `192.168.3.1`/`1.1.1.1` (após GeekLock offline) |
| Reserva DHCP no roteador | `[ ]` reforço para o MAC da Wi‑Fi não perder `.70` se resetar Windows |
| Alerta painel se IP LAN ≠ `.70` | `[ ]` melhoria sugerida (incidente IP) |
| CNAME `admin` + Cloudflare Access | Checklist em [`REMOTE-MONITOR.md`](./REMOTE-MONITOR.md) — validar se já está completo na conta CF |
| Estabilidade WS Lock (feature B) | Código/banners ok; **validar na loja** — [`CENTRAL-LOCK-MELHORIAS.md`](./CENTRAL-LOCK-MELHORIAS.md) |
| Uso/energia estações (aba Uso) | Código local antigo / não entrou no `lock-v1.1.6` do workflow — só se pedir |
| Setup avançado / boot rápido Lock / MP live | Bloqueados no prompt da loja até o dono confirmar |

## Melhorias priorizadas (casa · 2026-09-30)

Ordem sugerida a partir dos incidentes de hoje (sem reabrir domínio/túnel):

| Pri | Melhoria | Tipo | Por quê |
|-----|----------|------|---------|
| 1 | Atualizar Central 1.1.4 + Locks 1.1.6 na loja | ops | Releases já no GitHub; pendrive 1.1.6 pronto |
| 2 | Reserva DHCP no roteador (MAC Wi‑Fi → `.70`) | ops | Evita repetir incidente `.116` se Windows voltar a DHCP |
| 3 | Alerta no painel se IP LAN do Central ≠ `.70` | código | Diagnóstico imediato quando Locks “não respondem” |
| 4 | Validar feature B (WS offline/voltou) na loja | ops/QA | Já no código; falta prova multi-PC |
| 5 | DNS estável (já tem `1.1.1.1`; documentar no roteador) | ops | Evita queda do `cloudflared` |
| 6 | Ethernet no PC principal (além/em vez de só Wi‑Fi) | ops | Menos APIPA/`169.254` e DHCP surpresa |
| 7 | Mercado Pago app + sandbox → live | negócio | Checkout real |
| 8 | `STRICT_SECRETS` + senha admin | segurança | Antes de expor mais o admin remoto |
| 9 | Uso/energia (aba Uso) em release futuro | produto | Só após ops estável |

Detalhe da fila ops: [`PENDENCIAS.md`](./PENDENCIAS.md).

---

## Pastas e logs úteis no PC da loja

| Caminho | Conteúdo |
|---------|----------|
| `C:\GeekCentral\` | Instalação do motor |
| `C:\GeekCentral\data\` | Banco, config, logs (não apagar) |
| `C:\GeekCentral\data\manter-ligado.log` | Keepalive / religamentos |
| `C:\GeekCentral\data\cloudflared-tunnel.err.log` | Erros do túnel |
| `C:\GeekCentral\data\electron-main.log` / `electron-out.log` | Electron |
| `%USERPROFILE%\.cloudflared\` | `cert.pem`, JSON do túnel, `config.yml` (secrets — não commit) |
| `C:\Users\Loja Geeks\loja-geek-fidelidade\` | Clone git (docs + código; **não** é a pasta do `.exe` em produção) |

---

## Checklist rápido se “cair de novo”

1. `http://127.0.0.1:8787/api/health` — se ok, o motor está vivo.  
2. `http://192.168.3.70:8787/api/health` — se falhar com local ok → IP da Wi‑Fi mudou (Locks quebram).  
3. `https://api.geekloja.com.br/api/health` — se falhar com local ok → túnel/DNS.  
4. `Get-Process cloudflared` — ausente? Ver `manter-ligado.log` e `cloudflared-tunnel.err.log`.  
5. `Get-DnsClientServerAddress -AddressFamily IPv4` — precisa ter servidores DNS.  
6. Não recriar túnel/domínio; só religar cloudflared / corrigir DNS/IP.  
7. Versão Central: `C:\GeekCentral\VERSION.txt` vs release `central-v*` no GitHub.

---

## Índice relacionado

- Índice geral: [`README.md`](./README.md)  
- Fila ops: [`PENDENCIAS.md`](./PENDENCIAS.md)  
- Setup Windows: [`SETUP-WINDOWS-LOJA.md`](./SETUP-WINDOWS-LOJA.md)  
- Incidente build 2026-09-22: [`CORRECAO-LOJA-2026-09-22.md`](./CORRECAO-LOJA-2026-09-22.md)  
- Incidente IP/GeekLock 2026-09-30: [`INCIDENTE-GEEKLOCK-IP-2026-09-30.md`](./INCIDENTE-GEEKLOCK-IP-2026-09-30.md)  
- Melhorias futuras Central↔Lock: [`CENTRAL-LOCK-MELHORIAS.md`](./CENTRAL-LOCK-MELHORIAS.md)  

---

## Histórico curto (para quem analisa depois)

| Data | Evento |
|------|--------|
| 2026-09-22 | Fix `lan-discovery` fora do asar; health público ok |
| 2026-09-23–24 | Releases Central 1.1.x / Lock 1.1.x; celular + update via GitHub |
| 2026-09-24 | Loja atualizada para Central **1.1.3** (ZIP release, `data\` preservada) |
| 2026-09-28 | Release Lock **1.1.5**; Central na loja segue 1.1.3 |
| 2026-09-30 | Queda do **túnel por DNS**; motor local intacto; snapshot deste doc |
| 2026-09-30 | GeekLock offline: Central DHCP foi para `.116`; Wi‑Fi fixada de volta em `.70` + DNS `1.1.1.1` |
| 2026-09-30 ~14h | Releases **Central 1.1.4** (Latest) + **Lock 1.1.6** (`lock-v*`); CI: Latest = Central |
| 2026-09-30 ~15h | USB GEEKLOCK regravado com zip oficial 1.1.6 (antes tinha exe antigo + bat 1.1.5) |
