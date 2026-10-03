# WhatsApp automático (Evolution API)

Atualizado em **2026-08-26**.

O Geek já manda o cliente para `wa.me` (link). Com **Evolution API** (ou Baileys self-host), a loja pode **enviar** mensagem sozinha: Pix pago, saldo baixo.

## Variáveis no `.env` do Central

```bash
WHATSAPP_API_URL=https://sua-evolution:8080
WHATSAPP_API_KEY=sua-chave
WHATSAPP_INSTANCE=loja-geek
```

Endpoint usado: `POST {URL}/message/sendText/{instance}` com header `apikey` e body `{ number, text }` (padrão Evolution).

Sem essas variáveis = **desligado** (zero efeito).

## O que o código já dispara

| Evento | Mensagem |
|--------|----------|
| Pix/pedido **pago** e creditado | “pagamento confirmado + horas” + pedido educado de avaliação Google (se elegível) |
| Venda/liberação no balcão | mesmo fluxo; Central oferece `wa.me` se Evolution estiver off |
| Botão “Pedir avaliação” (ficha VIP) | só o pedido de avaliação |
| Saldo baixo na sessão | junto com web-push (se o VIP tem telefone no cadastro) |

**Avaliação Google:** link Maps da Loja GEEKS (aba reviews). Cooldown **60 dias** após o pedido; flag `review_ask_opt_out` na ficha VIP bloqueia. Não dá para saber se a pessoa publicou a nota.

## Sem Evolution

Continue com botões WhatsApp no portal (comprovante, lan). Evolution é opcional.

## Próximo (P3) — receber e responder

Hoje isto é só **envio**. Atendente automático no WhatsApp Business (FAQ + handoff humano, sem venda/liberação no v1): [issue #1](https://github.com/MrJCRJ/loja-geek-fidelidade/issues/1). Prioridade **depois** de RPi + Mercado Pago.

## Relacionados

- [`ECOSSISTEMA.md`](./ECOSSISTEMA.md)
- Web-push: `VAPID_*` no `.env.example`
