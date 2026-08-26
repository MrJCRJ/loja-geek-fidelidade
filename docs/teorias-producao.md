# Teorias de acontecimentos em produção — GeekLock / GeekCentral

Atualizado em **2026-08-25**.  
Objetivo: hipóteses do chão da loja + **mitigações implementadas** (código).

Contexto técnico atual (resumo):

- GeekLock libera por reconhecimento facial e mantém sessão com **presença por identidade do VIP** + countdown de ausência (`absentSecondsToLock`).
- Heartbeat consome saldo **só com VIP presente**; em ausência envia `pauseBilling` e não debita o gap.
- Presença exige match do `customerId` da sessão, score com margem extra, e rosto grande o bastante (anti VIP no fundo).
- Aviso de saldo baixo no HUD + banner; modo Admin/PIN auto-trava.

---

## A. Sessão “órfã” / troca de pessoa no PC

### T1 — Cadeirada silenciosa
VIP reconhece o rosto, libera o PC, vai ao banheiro/balcão. Outra pessoa senta no intervalo do countdown de ausência. Enquanto houver “rosto presente” (mesmo que seja outro), a sessão do VIP original pode continuar aberta e o tempo segue descontando da conta dele.

**Mitigação:** presença com `customerId` — outro rosto = `other_vip`/`unknown` → countdown **imediato** (não espera 3 misses). Cobrança pausada durante ausência.

### T2 — Amigo “segura” a cadeira
Dois amigos: A loga; B fica jogando “um pouco”. A presença detecta rosto (qualquer um / ou falha em exigir identidade contínua). Conta de A é consumida; A só descobre depois no extrato/saldo.

**Mitigação:** mesma de T1 + handoff só após 2 frames fortes do outro VIP (troca de conta, não “segura” a do amigo).

### T3 — Handoff falhou, sessão ficou
Sistema tenta trocar para outro VIP reconhecido, mas o match fica no limiar (quase, mas não). Resultado intermediário: PC liberado, identidade “antiga”, outro corpo na cadeira — zona cinzenta de accountability.

**Mitigação:** limiar de presença = match normal + margem (`presence_score_margin`); falha de handoff inicia ausência na hora.

### T4 — Webcam “vê” o VIP de longe
VIP saiu, mas ainda aparece no fundo (corredor, outro PC). Presença continua “presente”. Terceiro usa o teclado enquanto a câmera acha que o dono ainda está ali.

**Mitigação:** `presenceMinFaceRatio` (config admin, padrão 0.12) → `face_too_far` = ausente.

### T5 — Máscara / boné / ângulo
VIP vira de lado ou abaixa a cabeça; miss streak sobe; countdown começa. Antes de travar, ele volta — ou outro senta e o ciclo de presença “reseta” de forma confusa (falso presente / falso ausente).

**Mitigação parcial:** `no_face`/`low_quality` ainda usam streak de 3 (tolerância ao dono); estranho na cadeira não tem essa folga. Ops: luz/câmera (T16/T17).

### T6 — Staff desbloqueia e esquece
Liberação admin/PIN para “só ajustar”. Cliente/irmão fica no PC com sessão staff ou sessão VIP ainda aberta. Conta ou máquina fica “dono fantasma”.

**Mitigação:** auto-trava do modo Admin após `staffUnlockMaxSeconds` (padrão 10 min, configurável).

### T7 — Ghost session clássica (indústria de kiosk)
Usuário não encerra; idle timeout inexistente ou longo demais; próximo usuário herda cookies/apps/Steam/Discord logados no Windows — além do GeekLock.

**Mitigação parcial:** countdown de ausência (padrão **60s**) + lock GeekLock + aviso no splash de boas-vindas (“logout Steam/Discord”). Contas Windows = procedimento de loja (perfil local).

---

## B. Horas acabam sem aviso (trava “do nada”)

### T8 — Corte seco no heartbeat
Saldo chega a zero no próximo tick de heartbeat. API devolve `time_depleted`; GeekLock trava/encerra. Jogo/partida some sem countdown de “faltam 5 minutos”.

**Mitigação:** `lowBalanceWarnSeconds` (padrão 300) → HUD “Saldo baixo” + banner “Restam Xm”. Ainda trava em zero, mas com aviso prévio.

### T9 — Cliente achava que tinha mais
Comprou 1h no portal, usou 50 min ontem, esqueceu. Hoje senta “com 1h na cabeça”; trava no meio da ranked. Na teoria dele: “bugou”. Na loja: saldo real ≠ expectativa.

**Mitigação:** HUD com saldo restante; splash de unlock mostra saldo; portal reforça “confira antes de sentar”.

### T10 — Consumo em background
Sessão aberta, VIP “ausente” mas countdown ainda não estourou (ou presença oscila). Heartbeat continua debitando. Ele volta e o saldo já sumiu “parado”.

**Mitigação:** heartbeat com `pauseBilling: true` enquanto ausente — atualiza `last_seen` sem consumir; ao voltar não cobra o gap.

### T11 — Dois PCs / sessão movida
VIP loga no PC1, depois no PC2 (sessão anterior encerrada/substituída). Percepção: “perdi tempo”. Ou residual: crédito consumido em máquina que ele não está mais usando por alguns segundos de overlap.

**Já existia:** `startSession` encerra sessão ativa em outro PC (`moved`).

### T12 — Rede/túnel oscila
Heartbeats atrasam; de repente chega um lote de consumo ou a sessão fecha por falha. Sensação: travou sem aviso; causa real: API sumiu / face-service 503 / WS caiu.

**Mitigação:** delta de cobrança capped em **45s**; banners WS caiu/voltou; face `service_down` não inicia ausência. Túnel estável = ops (`loja-ready.md`).

### T13 — Assinante vs crédito de horas
Cliente confunde “assinatura ativa” com “horas ilimitadas” (ou desconto). Acaba o pacote de horas avulso e trava; ele acha que assinante não podia acabar.

**Mitigação:** portal — copy “assinatura = desconto, não ilimitado”; aviso de saldo baixo no PC.

---

## C. Reconhecimento e falsa identidade

### T14 — Gêmeos / irmãos parecidos
Match no limiar: VIP B libera como VIP A (ou o contrário). Conta errada debitada; briga no balcão.

**Mitigação parcial:** unlock exige score ≥ **0.62** num frame ou 2 frames; presença com margem **+0.10**. Enroll de qualidade (T15).

### T15 — Enroll fraco
Poucas amostras, luz ruim no cadastro. Em produção: às vezes não libera o dono; às vezes libera “quase”. Staff força unlock manual → volta ao T6.

**Mitigação parcial:** portal sugere mais amostras se &lt; 3; ops re-enroll; staff auto-trava.

### T16 — Luz da loja muda
Manhã ok, noite neon/reflexo no monitor. Taxa de false absent sobe → countdown constante → irritação → cliente pede liberação permanente “porque a câmera é ruim”.

**Ops:** posição da câmera / luz; ajustar limiar facial e `absentSecondsToLock`.

### T17 — Câmera tapada / virada
Alguém vira a webcam “pra não ficar olhando”. Presença vira miss → trava. Ou: câmera aponta pra parede → countdown → trava com pessoa sentada.

**Comportamento intencional** (protege a conta). Staff PIN se precisar ajustar.

---

## D. Social / fraude / conflito na loja

### T18 — Conta compartilhada de propósito
Família usa o mesmo VIP facial. Um gasta o saldo do outro sem “invasão” técnica — conflito comercial/LGPD (“foi ele”).

**Mitigação parcial:** aviso no portal (face pessoal). Política da loja + LGPD revoke/re-enroll.

### T19 — Furto de tempo deliberado
Observa o VIP sair, senta antes do lock. Objetivo: jogar de graça na conta alheia. Teoria operacional: janela do `absentSecondsToLock` é o “tempo de crime”.

**Mitigação:** countdown imediato + cobrança pausada; padrão de ausência **60s** (antes 90).

### T20 — Menor / terceiro sem cadastro
Só o responsável tem face. Filho joga na sessão do pai. Pai cobra a loja (“alguém usou minha conta”); loja vê sessão contínua com presença.

**Igual T18** se o rosto do pai continua no frame; senão vira T1/T19. Aviso de conta pessoal no portal.

### T21 — Cliente alega trava injusta no clutch
Horas acabaram de fato, mas sem aviso prévio vira reclamação pública / review ruim — problema de percepção + retenção, não só técnico.

**Mitigação:** T8 (aviso de saldo baixo) + T9 (saldo visível).

---

## E. Operação / infraestrutura (parece bug de sessão)

### T22 — Face-service reiniciou no meio
Presença falha (`service_down`); streaks de miss; countdown; lock. Cliente: “expulsou do nada”.

**Já existia:** `service_down` zera miss streak (não inicia ausência).

### T23 — PC trava o Windows, não o GeekLock
RAM/jogo pesado. Cliente associa ao fim de horas. Teoria mista: coincidência temporal com saldo baixo.

**Ops** (hardware / fechar apps). Sem mitigação de software além do aviso de saldo.

### T24 — Relógio do PC errado
Skew de horário bagunça `last_seen_at` / delta do heartbeat → consumo estranho ou sessão “inválida”. Raro, mas clássico em PCs de lan.

**Mitigação:** delta capped **45s**. NTP na loja recomendado.

### T25 — Admin encerra remoto sem contexto
Central manda `end_session` / lock. No PC parece “horas acabaram” ou “expulsaram”.

**Mitigação:** banner “A loja encerrou esta sessão pelo GeekCentral — não foi falta de horas.”

---

## F. Combinações (as mais “sujas” em produção)

### T26 — T1 + T8
Outro senta na conta; gasta o resto das horas; trava sem aviso. Dono original volta e acha que a loja roubou crédito.

**Mitigação:** T1 (pausa + countdown) + T8 (aviso). Invasor na janela ainda joga, mas sem debitar o dono ausente.

### T27 — T10 + T21
Foi ao banheiro; countdown longo; saldo zerou “parado”; volta e já está locked. Review: “não avisa e come crédito parado”.

**Mitigação:** T10 (não come parado) + T8.

### T28 — T4 + T19
Câmera ainda “vê” o VIP no fundo; invasor joga estável até o VIP sumir de vez do frame — aí começa o countdown.

**Mitigação:** T4 (`face_too_far`).

---

## Padrão + o que o código faz agora

| Família | Risco | Mitigação no código |
|--------|--------|---------------------|
| Identidade vs presença | Detectar *alguém* ≠ *dono* | Match do VIP + margem + `face_too_far` |
| Janela de ausência | Tempo de abuso | Countdown imediato p/ estranho; reduzir `absentSecondsToLock` |
| Saldo | Corte seco / consumo parado | `pauseBilling` + aviso `lowBalanceWarn` |
| Expectativa | Cliente mente o saldo | HUD com saldo restante |
| Staff unlock | Dono fantasma | Auto-trava `staffUnlockMaxSeconds` |

Config no GeekCentral → **Config**: aviso de saldo, auto-trava admin, ratio mínimo de presença.

Relacionados: [`loja-ready.md`](./loja-ready.md) · [`telemetria.md`](./telemetria.md) · [`REFINO.md`](./REFINO.md).
