# GeekLock — abrir mais rápido no reinício do PC

Atualizado em **2026-09-22**.  
**Status:** requisito documentado — **não implementado ainda**. Validar na loja o tempo real; implementar na volta.

---

## Dor

Quando o PC da estação **reinicia**, o GeekLock demora a aparecer (tela de trava / “Aguardando VIP”). Nesse intervalo o Windows fica usável sem trava — risco de cliente/staff entrar no desktop.

Pedido: o Lock deve **aparecer o mais cedo possível** após o login do Windows, sem esperar câmera/API/Central.

---

## Como está hoje (código)

| Peça | Comportamento |
|------|----------------|
| Autostart | `openAtLogin: true` + `openAsHidden: true` (`agent-windows/electron/main.cjs`) |
| Janela | Cria depois de `app.whenReady()` — Electron + Chromium frios |
| UI | Fase `boot` até `checkHealth` + `heartbeat` + `lockUi()` (`App.tsx`) |
| Central offline | Só então vai para `offline` e chama `lock()` |

Ou seja: o processo pode já estar no login, mas a **tela de trava só pinta depois** da API responder (timeout de fetch até ~12s se o Central ainda estiver subindo).

O Central também espera **~15s** no boot (`bootDelayMs`). Se a estação ligar junto com o controle, o Lock espera o Central — e parece “lento”.

---

## Objetivo (quando implementar)

1. Pintar **tela de trava imediatamente** (mesmo sem Central / sem câmera).  
2. Health + heartbeat + webcam em **background** (banner “Conectando…” / “Central offline”).  
3. Não bloquear o lock em `checkHealth`.  
4. Manter autostart; avaliar se `openAsHidden` atrasa a janela visível.  
5. Meta de aceite: **< 5s** após o login do Windows até a trava cobrir o desktop (PC da loja, SSD/HDD anotar).

Fora de escopo desta feature: estabilidade WS (já em [`CENTRAL-LOCK-MELHORIAS.md`](./CENTRAL-LOCK-MELHORIAS.md) como B); update do Lock.

---

## Checklist na loja (medir, não codar)

- [ ] Cronometrar: login Windows → tela GeekLock visível (anotar segundos + HDD/SSD)  
- [ ] A estação liga **antes** do Central? (pior caso)  
- [ ] Autostart do Lock está ativo? (Gestor de Tarefas → Inicialização)  
- [ ] Primeira abertura do dia vs. reinício com Lock já “aquecido”

Anotar no celular / neste arquivo na volta.

---

## Relacionados

- Autostart: [`exe-instalacao-autostart.md`](./exe-instalacao-autostart.md)  
- Central ↔ Lock: [`CENTRAL-LOCK-MELHORIAS.md`](./CENTRAL-LOCK-MELHORIAS.md)  
- Setup estações: [`PAIRING-CODIGO-CURTO.md`](./PAIRING-CODIGO-CURTO.md)  
