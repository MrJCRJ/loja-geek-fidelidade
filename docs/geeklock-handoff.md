# GeekLock — handoff (2026-09-30)

Repo: https://github.com/MrJCRJ/loja-geek-fidelidade · pasta: `/home/treegunn/loja-geek-fidelidade`

## Combinado (não desfazer sem pedido)

- **Sem PIN na estação.** Sem botões PIN/Sair, sem `Ctrl+Shift+S`, sem IPC `quitWithPin`/`staffUnlock`. `staffPin` é apagado do `config.json` ao carregar/salvar.
- **Destravar / encerrar app:** só GeekCentral (aba Estações). Comando `quit_app`.
- **Cadastro no GeekLock e Caixa curta:** no ar desde 15/10. Conta nova só no PC. Texto em `/home/treegunn/diario/conversas/2026-10-14-geeklock-cadastro.md`.
- **VIP sem crédito:** splash no mesmo formato da liberação; some quando não há face.
- **Uso/energia:** aba Uso no Central; coletor 15s no Lock (sem keylog).
- **IP LAN:** `192.168.3.70:8787`

## Versões

- Lock publicado: **1.1.22** (16/10, tela só de entrar; criar conta é um passo menor e avisa que não abre o PC; hora em aberto fica 2 min em “pedido enviado”). Os PCs puxam ao ligar. A versão instalada neles não foi reconfirmada neste dia.
- Central na nuvem (`api.geekloja.com.br`) recebeu o painel e a limpeza de 16/10. API recriada nesse dia; health ok. O GeekLock publicado continua **1.1.21** — os PCs não foram religados nem receberam pacote novo.
- Liberar no Central: na aba Estações, cliente já cadastrado com saldo. Venda de hora fica no Caixa, por horário ou por dinheiro, sem escolher PC. Consoles têm aba própria.
- Central **1.1.8** · tag `central-v*` = **latest** do GitHub
- Diagnóstico trava/desliga: `docs/DIAGNOSTICO-TRAVAR-DESLIGAR.md`
- Energia remota (código local): comandos `shutdown` / `hibernate` no Central (confirmação); Lock precisa update.
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
