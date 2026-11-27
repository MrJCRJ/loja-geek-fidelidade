# GeekLock — handoff (2026-10-24)

Repo: https://github.com/MrJCRJ/loja-geek-fidelidade · pasta: `/home/treegunn/loja-geek-fidelidade`

## Combinado (não desfazer sem pedido)

- **Sem PIN na estação.** Sem botões PIN/Sair, sem `Ctrl+Shift+S`, sem IPC `quitWithPin`/`staffUnlock`. `staffPin` é apagado do `config.json` ao carregar/salvar.
- **Destravar / encerrar app:** só GeekCentral (aba Estações). Comando `quit_app`.
- **Cadastro no GeekLock e Caixa curta:** no ar desde 15/10. Conta nova só no PC. Texto em `/home/treegunn/diario/conversas/2026-10-14-geeklock-cadastro.md`.
- **VIP sem crédito:** splash no mesmo formato da liberação; some quando não há face.
- **Uso/energia:** aba Uso no Central; coletor 15s no Lock (sem keylog).
- **IP LAN:** `192.168.3.70:8787`

## Versões (conferido no GitHub em 2026-10-24)

`main` = `origin/main`, commit `c2b1631` (20/10). Não há commit local fora do GitHub.

| Peça | Código em `main` | Release de binário no GitHub |
|------|------------------|------------------------------|
| GeekLock | **1.1.23** (`agent-windows/package.json`, desde 17/10) | **lock-v1.1.15** (05/10) — `GeekLock-win-x64.zip` |
| GeekCentral | **1.1.9** | release **central-v1.1.9** (Dashboard insight/histórico); anterior Latest **1.1.8** (05/10) |

Não existe tag `lock-v1.1.16` … `lock-v1.1.23`. O handoff anterior misturava “publicado 1.1.22” e “publicado 1.1.21”; isso não está nas Releases. A versão instalada nos PCs não foi relida hoje (em 01/10 as cinco estações estavam em 1.1.8).

O que entrou no código depois da release 1.1.15, e ainda não virou ZIP no GitHub:

- 17/10 (`aa97468`): cadastro no Lock, Caixa curta, venda de hora, consoles, energia remota, sessão que não prende o cliente em outro PC. A versão no `package.json` saltou de 1.1.15 para 1.1.23.
- 20/10 (`c2b1631`): faxina de sessão fantasma na API (deploy na VPS nesse dia) e o Lock trata `session_closed`. O pacote Lock com esse comportamento ainda não foi publicado.

CI em 20/10: o job do GeekLock falhava no `tsc` porque o payload do comando em `App.tsx` não tinha `customerId` / `sessionId`. O tipo certo já estava em `StationCommandPayload` (`ws.ts`).

- Liberar no Central: na aba Estações, cliente já cadastrado com saldo. Venda de hora fica no Caixa, por horário ou por dinheiro, sem escolher PC. Consoles têm aba própria.
- Diagnóstico trava/desliga: `docs/DIAGNOSTICO-TRAVAR-DESLIGAR.md`
- Energia remota: comandos `shutdown` / `hibernate` no Central (confirmação). O Lock em `main` já tem esses comandos; o ZIP do GitHub (1.1.15) não.
## Atualizar estações

- **Dono** em Config → **Atualizar Locks** (API `ownerWriteGuard`; clerk não vê Config).
- Pacote: `GeekLock-win-x64.zip` + `version.json` em data `lock-updates/` (scp manual ok; não exige GitHub se o local for >= release).
- A partir de **1.1.12**, o ZIP traz `GeekLock-apply.cmd` (taskkill + rename); o Lock usa esse script ao aplicar.
- Estações em **1.1.10/1.1.11**: primeiro update pelo pendrive; depois o botão do dono basta.

## Pendrive GEEKLOCK (~15 G, `sdb`)

- Instalador completo em `scripts/pendrive-geeklock/` (TEMP antes do UAC).
- `serverUrl` = `https://api.geekloja.com.br`
- Após release: baixar zip Lock e regravar USB + overlay do `.bat` + `GeekLock-harden.ps1` + `GeekLock-apply.cmd`.
- 1.1.12: update remoto reforçado + apply empacotado; 1.1.11 tinha cadastro nuvem + tela cheia/kiosk/harden.

## Raspberry Pi 3 B+ (GeekCentral sem face)

- Scripts: `scripts/pi-geekcentral/` (install API `:8787` + cloudflared; sem face-service).
- Cartão: gravar Raspberry Pi OS Lite **64-bit** com `flash-and-configure.sh` (SSH user `geek`).
- Credenciais locais: `~/.agents/geekcentral-pi-credentials.txt` (não commit).
- Loja: Ethernet IP **192.168.3.70**, túnel `loja-geek-api` (login cloudflared na loja).
- Leitor USB Realtek: se `Write Protect is on`, destrave a trava do adaptador SD e regave.
