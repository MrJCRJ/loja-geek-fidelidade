# Incidente — GeekLock “Central não está respondendo” (2026-09-30)

Repo: https://github.com/MrJCRJ/loja-geek-fidelidade  
Loja: PC principal `DESKTOP-5L1741K` · pasta motor `C:\GeekCentral`  
Relacionado: [`ESTADO-SISTEMA-2026-09-30.md`](./ESTADO-SISTEMA-2026-09-30.md) (túnel/DNS no mesmo dia)

**Não contém** secrets (`.env`, tokens, `cert.pem`).

---

## Sintoma

Nos PCs GeekLock: mensagem de que o **Central não está respondendo** / offline.  
URL pública (`api.geekloja.com.br`) e painel celular **não** eram o problema deste incidente.

---

## Causa raiz

O GeekLock fala **só na LAN** com:

`http://192.168.3.70:8787`

O PC do Central estava com IP **DHCP** na Wi‑Fi e mudou para:

`192.168.3.116`

- Health em `http://127.0.0.1:8787` → **ok** (motor vivo)
- Health em `http://192.168.3.116:8787` → **ok**
- Health / ping em `http://192.168.3.70:8787` → **falha / timeout** (IP antigo sumiu)
- Ethernet do PC principal sem IP de rede útil (`169.254.x.x` APIPA)

Ou seja: **não era bug do GeekLock nem da API** — as estações apontavam para um IP que não era mais o Central.

---

## Evidência (check na loja ~13:00 UTC−3)

| Check | Resultado |
|-------|-----------|
| `GeekCentral.exe` + Node `:8787` | Rodando (desde 2026-09-28) |
| Wi‑Fi na hora do erro | `192.168.3.116` (DHCP) |
| IP documentado / `serverUrl` dos Locks | `192.168.3.70` |
| Gateway Wi‑Fi | `192.168.3.1` |
| Rede Wi‑Fi | perfil Private (`GEEKS`) |

Docs que já fixavam `.70`: [`GEEKLOCK-INSTALAR-ESTACOES.md`](./GEEKLOCK-INSTALAR-ESTACOES.md), [`PROMPT-PC-GEEKLOCK.txt`](./PROMPT-PC-GEEKLOCK.txt).

---

## Correção aplicada (2026-09-30)

No PC principal, Wi‑Fi passou a IP **manual**:

| Campo | Valor |
|-------|--------|
| IP | `192.168.3.70` |
| Máscara | `255.255.255.0` (/24) |
| Gateway | `192.168.3.1` |
| DNS | `192.168.3.1` + `1.1.1.1` |

Validação pós-fix:

- `http://192.168.3.70:8787/api/health` → `{"ok":true,...}`
- `https://api.geekloja.com.br/api/health` → ok
- GeekCentral + cloudflared continuaram no ar

**Nos GeekLocks:** não foi preciso mudar `config.json` (já usavam `.70`). Se algum PC ainda mostrar offline, reiniciar o `GeekLock.exe`.

---

## Por que isso importa para o projeto

1. Locks com `serverUrl` fixo quebram se o Central pegar outro DHCP.  
2. Discovery LAN ajuda no 1º pareamento; depois o IP salvo no `config.json` manda.  
3. Ethernet APIPA + só Wi‑Fi DHCP = IP da loja instável.  
4. Mesmo dia: incidente de **túnel por DNS** (ver snapshot) — rede do PC da loja é ponto frágil.

---

## Follow-ups sugeridos (não implementados neste push)

- [ ] Reserva DHCP / IP fixo no **roteador** para o MAC da Wi‑Fi do Central (reforço se alguém resetar o Windows para DHCP)
- [ ] Opcional: alerta no painel se o IP LAN do Central ≠ o esperado (`192.168.3.70`)
- [ ] Confirmar Ethernet (cabo/dongle) — hoje a LAN útil é Wi‑Fi
- [ ] Não recriar túnel/domínio; não mudar URL pública por causa deste incidente

---

## Checklist se repetir

1. No Central: `Get-NetIPAddress -AddressFamily IPv4` — IP ainda é `192.168.3.70`?  
2. `http://192.168.3.70:8787/api/health`  
3. No Lock: `serverUrl` em `C:\GeekLock\config.json` deve ser `http://192.168.3.70:8787` (http + porta)  
4. Se o IP do Central mudou de novo: refixar `.70` **ou** atualizar todos os Locks (pior)

---

## Histórico

| Hora (aprox.) | Evento |
|---------------|--------|
| manhã/meio-dia | Túnel instável por DNS (outro incidente) |
| ~12:50–13:00 | GeekLock “não responde”; diagnóstico = IP `.116` |
| ~12:59 | Wi‑Fi fixada em `192.168.3.70` + DNS `1.1.1.1` |
| ~13:02 | Health LAN/público ok; Locks devem voltar após restart se necessário |
