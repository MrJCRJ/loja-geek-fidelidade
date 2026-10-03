# GeekLock — handoff (2026-09-30)

Repo: https://github.com/MrJCRJ/loja-geek-fidelidade · pasta: `/home/treegunn/loja-geek-fidelidade`

## Combinado (não desfazer sem pedido)

- **Sem PIN na estação.** Sem botões PIN/Sair, sem `Ctrl+Shift+S`, sem IPC `quitWithPin`/`staffUnlock`. `staffPin` é apagado do `config.json` ao carregar/salvar.
- **Destravar / encerrar app:** só GeekCentral (aba Estações). Comando `quit_app`.
- **VIP sem crédito:** splash no mesmo formato da liberação; some quando não há face.
- **Uso/energia:** aba Uso no Central; coletor 15s no Lock (sem keylog).
- **IP LAN:** `192.168.3.70:8787`

## Versões

- Lock **1.1.9** · tag `lock-v*`
- Central **1.1.7** · tag `central-v*` = **latest** do GitHub

## Pendrive GEEKLOCK (~15 G, `sdb`)

- Instalador completo em `scripts/pendrive-geeklock/` (TEMP antes do UAC).
- `serverUrl` = `https://api.geekloja.com.br`
- Após release: baixar zip Lock e regravar USB + overlay do `.bat` + `GeekLock-harden.ps1`.
- 1.1.9: kiosk no lock, bloqueia atalhos/TaskMgr/USB storage no locked; webcam sempre livre; saúde (disco/RAM/uptime) no Central.

## Raspberry Pi 3 B+ (GeekCentral sem face)

- Scripts: `scripts/pi-geekcentral/` (install API `:8787` + cloudflared; sem face-service).
- Cartão: gravar Raspberry Pi OS Lite **64-bit** com `flash-and-configure.sh` (SSH user `geek`).
- Credenciais locais: `~/.agents/geekcentral-pi-credentials.txt` (não commit).
- Loja: Ethernet IP **192.168.3.70**, túnel `loja-geek-api` (login cloudflared na loja).
- Leitor USB Realtek: se `Write Protect is on`, destrave a trava do adaptador SD e regave.
