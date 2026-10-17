# Plano para aumentar os testes

Escopo: API do GeekCentral (`server/`). O GeekLock dos PCs fica de fora. Nada disto publica na nuvem.

Hoje: 26 arquivos em `server/tests/`, cerca de 100 casos, mais um smoke Playwright em `web/e2e/admin.spec.ts` que não roda no `npm test`.

## Já coberto

- Login do dono e da equipe, controle pelo link da loja.
- Venda por valor com Pix, cartão ou dinheiro, e o evento no audit.
- Liberar PC com saldo, quando a conta já tem hora.
- Hora em aberto, consoles, sessão, backup, LGPD, update do Lock.
- O site não cria conta (`POST /api/portal/register` → 403).

## Correção desta leva

Arquivo `server/tests/caixa-regras.test.ts`. Quatro regras que a loja usa e o suite antigo não travava:

1. Venda sem `paymentMethod` responde 400.
2. Venda por horário (`hours: 1`) credita 3600 segundos.
3. Equipe (`CLERK_PASSWORD`) apaga a conta.
4. Liberar por saldo, com conta sem hora, responde 400.

## Feito na leva seguinte

- Três vendas (R$ 10 Pix, R$ 20 cartão, R$ 5 dinheiro) aparecem em `today.payments`.
- Hora em aberto paga em Pix grava `payment_method` e `paid_at`. Pagar de novo responde 400. A lista de pendentes fica vazia.

## Feito agora

- Login sem hora responde `no_credit`, não abre sessão, e outra conta com hora entra no mesmo PC. Senha errada responde 401.
- Uma conta em dois PCs já estava em `lock-account.test.ts` (`already_in_use`).
- Equipe no host `api.geekloja.com.br` não apaga a conta (403). No host `loja.geekloja.com.br`, apaga.

## Próximas levas, nesta ordem

1. **Smoke do painel.** O arquivo `web/e2e/admin.spec.ts` abre o GeekCentral num navegador, entra com a senha e clica nas abas. Não faz parte do `npm test` do servidor. O painel agora tem `npm test` em `web/` para a venda de hora e o liberar.

## Fora deste plano

- Refatorar `ConfigTab.tsx`, Dashboard ou `station-routes.ts`.
- Teste do instalador Windows e dos cinco PCs.
- Reescrever o restante de `docs/`.
