# Teorias de acontecimentos em produção — GeekLock / GeekCentral

Atualizado em **2026-08-25**.  
Objetivo: listar hipóteses do que pode ocorrer no chão da loja **sem soluções** — base para priorizar mitigações depois.

Contexto técnico atual (resumo):

- GeekLock libera por reconhecimento facial e mantém sessão com **presença** + countdown de ausência (`absentSecondsToLock`).
- Heartbeat da sessão **consome saldo de horas**; ao zerar pode encerrar com `time_depleted`.
- Presença com `customerId` tenta confirmar o VIP da sessão; sem isso, “há rosto” ≠ “é o dono”.
- Literatura de kiosk: sessões órfãs, idle timeout e detecção de presença vs identidade são falhas clássicas em dispositivos compartilhados.

---

## A. Sessão “órfã” / troca de pessoa no PC

### T1 — Cadeirada silenciosa
VIP reconhece o rosto, libera o PC, vai ao banheiro/balcão. Outra pessoa senta no intervalo do countdown de ausência. Enquanto houver “rosto presente” (mesmo que seja outro), a sessão do VIP original pode continuar aberta e o tempo segue descontando da conta dele.

### T2 — Amigo “segura” a cadeira
Dois amigos: A loga; B fica jogando “um pouco”. A presença detecta rosto (qualquer um / ou falha em exigir identidade contínua). Conta de A é consumida; A só descobre depois no extrato/saldo.

### T3 — Handoff falhou, sessão ficou
Sistema tenta trocar para outro VIP reconhecido, mas o match fica no limiar (quase, mas não). Resultado intermediário: PC liberado, identidade “antiga”, outro corpo na cadeira — zona cinzenta de accountability.

### T4 — Webcam “vê” o VIP de longe
VIP saiu, mas ainda aparece no fundo (corredor, outro PC). Presença continua “presente”. Terceiro usa o teclado enquanto a câmera acha que o dono ainda está ali.

### T5 — Máscara / boné / ângulo
VIP vira de lado ou abaixa a cabeça; miss streak sobe; countdown começa. Antes de travar, ele volta — ou outro senta e o ciclo de presença “reseta” de forma confusa (falso presente / falso ausente).

### T6 — Staff desbloqueia e esquece
Liberação admin/PIN para “só ajustar”. Cliente/irmão fica no PC com sessão staff ou sessão VIP ainda aberta. Conta ou máquina fica “dono fantasma”.

### T7 — Ghost session clássica (indústria de kiosk)
Usuário não encerra; idle timeout inexistente ou longo demais; próximo usuário herda cookies/apps/Steam/Discord logados no Windows — além do GeekLock.

---

## B. Horas acabam sem aviso (trava “do nada”)

### T8 — Corte seco no heartbeat
Saldo chega a zero no próximo tick de heartbeat. API devolve `time_depleted`; GeekLock trava/encerra. Jogo/partida some sem countdown de “faltam 5 minutos”.

### T9 — Cliente achava que tinha mais
Comprou 1h no portal, usou 50 min ontem, esqueceu. Hoje senta “com 1h na cabeça”; trava no meio da ranked. Na teoria dele: “bugou”. Na loja: saldo real ≠ expectativa.

### T10 — Consumo em background
Sessão aberta, VIP “ausente” mas countdown ainda não estourou (ou presença oscila). Heartbeat continua debitando. Ele volta e o saldo já sumiu “parado”.

### T11 — Dois PCs / sessão movida
VIP loga no PC1, depois no PC2 (sessão anterior encerrada/substituída). Percepção: “perdi tempo”. Ou residual: crédito consumido em máquina que ele não está mais usando por alguns segundos de overlap.

### T12 — Rede/túnel oscila
Heartbeats atrasam; de repente chega um lote de consumo ou a sessão fecha por falha. Sensação: travou sem aviso; causa real: API sumiu / face-service 503 / WS caiu.

### T13 — Assinante vs crédito de horas
Cliente confunde “assinatura ativa” com “horas ilimitadas” (ou desconto). Acaba o pacote de horas avulso e trava; ele acha que assinante não podia acabar.

---

## C. Reconhecimento e falsa identidade

### T14 — Gêmeos / irmãos parecidos
Match no limiar: VIP B libera como VIP A (ou o contrário). Conta errada debitada; briga no balcão.

### T15 — Enroll fraco
Poucas amostras, luz ruim no cadastro. Em produção: às vezes não libera o dono; às vezes libera “quase”. Staff força unlock manual → volta ao T6.

### T16 — Luz da loja muda
Manhã ok, noite neon/reflexo no monitor. Taxa de false absent sobe → countdown constante → irritação → cliente pede liberação permanente “porque a câmera é ruim”.

### T17 — Câmera tapada / virada
Alguém vira a webcam “pra não ficar olhando”. Presença vira miss → trava. Ou: câmera aponta pra parede → countdown → trava com pessoa sentada.

---

## D. Social / fraude / conflito na loja

### T18 — Conta compartilhada de propósito
Família usa o mesmo VIP facial. Um gasta o saldo do outro sem “invasão” técnica — conflito comercial/LGPD (“foi ele”).

### T19 — Furto de tempo deliberado
Observa o VIP sair, senta antes do lock. Objetivo: jogar de graça na conta alheia. Teoria operacional: janela do `absentSecondsToLock` é o “tempo de crime”.

### T20 — Menor / terceiro sem cadastro
Só o responsável tem face. Filho joga na sessão do pai. Pai cobra a loja (“alguém usou minha conta”); loja vê sessão contínua com presença.

### T21 — Cliente alega trava injusta no clutch
Horas acabaram de fato, mas sem aviso prévio vira reclamação pública / review ruim — problema de percepção + retenção, não só técnico.

---

## E. Operação / infraestrutura (parece bug de sessão)

### T22 — Face-service reiniciou no meio
Presença falha (`service_down`); streaks de miss; countdown; lock. Cliente: “expulsou do nada”.

### T23 — PC trava o Windows, não o GeekLock
RAM/jogo pesado. Cliente associa ao fim de horas. Teoria mista: coincidência temporal com saldo baixo.

### T24 — Relógio do PC errado
Skew de horário bagunça `last_seen_at` / delta do heartbeat → consumo estranho ou sessão “inválida”. Raro, mas clássico em PCs de lan.

### T25 — Admin encerra remoto sem contexto
Central manda `end_session` / lock. No PC parece “horas acabaram” ou “expulsaram”.

---

## F. Combinações (as mais “sujas” em produção)

### T26 — T1 + T8
Outro senta na conta; gasta o resto das horas; trava sem aviso. Dono original volta e acha que a loja roubou crédito.

### T27 — T10 + T21
Foi ao banheiro; countdown longo; saldo zerou “parado”; volta e já está locked. Review: “não avisa e come crédito parado”.

### T28 — T4 + T19
Câmera ainda “vê” o VIP no fundo; invasor joga estável até o VIP sumir de vez do frame — aí começa o countdown.

---

## Padrão (ainda sem solução)

| Família | O que “acontece” na prática |
|--------|------------------------------|
| Identidade vs presença | Detectar *alguém* ≠ garantir que é *o dono* o tempo todo |
| Janela de ausência | Tempo entre sair e travar = tempo de abuso ou de irritação |
| Saldo | Consumo contínuo no heartbeat; fim pode ser abrupto |
| Expectativa | Cliente mente o saldo; UI não “gritou” antes |
| Ambiente | Luz, câmera, rede, staff unlock amplificam tudo |

---

## Próximo passo sugerido

1. Priorizar top 5 teorias com a loja (impacto × frequência).  
2. Só então desenhar mitigações (produto + ops + copy na UI).

Relacionados: [`loja-ready.md`](./loja-ready.md) · [`telemetria.md`](./telemetria.md) · [`REFINO.md`](./REFINO.md).
