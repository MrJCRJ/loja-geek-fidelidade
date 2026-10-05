# Diagnóstico — PC trava / “desliga sozinho” (GeekLock)

Checklist para a loja. O GeekLock **não** tem comando de shutdown automático no uso normal (só se a equipe mandar **Desligar** no Central).

## 1. O que aconteceu de verdade?

| Sintoma | Provável |
|---------|----------|
| Tela preta / Windows “Desligando” | Energia Windows, queda de luz, ou comando **Desligar** do Central |
| Desktop aparece, GeekLock sumiu | `quit_app`, update (`taskkill`), crash do app |
| Congela e depois reinicia | Hardware/driver/Windows Update — não é “fim de horas” |
| Trava e volta a tela do Lock | `end_session` / saldo zerou / ausência / Travar no Central |

## 2. No Central (celular ou PC)

1. Aba **Estações** — estação online? Versão do Lock?
2. Alguém clicou **Encerrar app**, **Desligar** ou **Atualizar Locks** na hora?
3. Sessão era **Aberto** (não debita horas) ou **Usar saldo / Venda**?

## 3. No PC da estação

1. Event Viewer → Windows Logs → System (Kernel-Power, Unexpected Shutdown).
2. `%TEMP%\geeklock-install.log` e pasta do Lock se houve update.
3. Energia: plano de energia / hibernação automática do Windows.

## 4. Causas no próprio GeekLock (código)

- `apply_update` / `GeekLock-apply.cmd` — mata o processo e reabre.
- Kiosk + harden — parece “travado”, mas o Windows está ligado.
- Fim de saldo / ausência — encerra sessão e trava de novo (não desliga o PC).

## 5. Depois do teste

Anotar: horário, nome do PC, se foi reboot ou só app, e se havia update/desligar no Central.
