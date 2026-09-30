# GeekLock — handoff (2026-09-30)

Repo: https://github.com/MrJCRJ/loja-geek-fidelidade · pasta: `/home/treegunn/loja-geek-fidelidade`

## Combinado (não desfazer sem pedido)

- **Sem PIN na estação.** Sem botões PIN/Sair, sem `Ctrl+Shift+S`, sem IPC `quitWithPin`/`staffUnlock`. `staffPin` é apagado do `config.json` ao carregar/salvar.
- **Destravar / encerrar app:** só GeekCentral (aba Estações). Comando `quit_app`.
- **VIP sem crédito:** splash no mesmo formato da liberação; some quando não há face.
- **Uso/energia:** aba Uso no Central; coletor 15s no Lock (sem keylog).
- **IP LAN:** `192.168.3.70:8787`

## Versões

- Lock **1.1.8** · tag `lock-v*`
- Central **1.1.7** · tag `central-v*` = **latest** do GitHub

## Pendrive GEEKLOCK (~15 G, `sdb`)

- Instalador completo em `scripts/pendrive-geeklock/` (TEMP antes do UAC).
- Após release: baixar zip Lock e regravar USB + overlay do `.bat`.
