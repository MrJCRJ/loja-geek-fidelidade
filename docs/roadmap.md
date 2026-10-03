# Roadmap — Loja Geek / Geeks

Atualizado em **2026-10-03**.  
**Canônico de negócio:** [`NEGOCIO-GEEK.md`](./NEGOCIO-GEEK.md) · **ops:** [`PENDENCIAS.md`](./PENDENCIAS.md)  
Portal: https://loja-geek-portal.vercel.app · API: https://api.geekloja.com.br

Listas longas de agosto: [`arquivo/MELHORIAS.md`](./arquivo/MELHORIAS.md), [`arquivo/LISTA-COMPLETA.md`](./arquivo/LISTA-COMPLETA.md) — histórico, não a fila.

---

## Foco ~30 dias

1. **Pix portal ponta a ponta** — webhook MP + compra real.  
2. **Avaliações Google** — writereview + WhatsApp pós-venda (já em código; validar na loja).  
3. **Estabilidade** Central/Lock — IP `.70`, WS, updates, túnel UI alinhada.

---

## Backlog ~6 meses

- Site **financeiro Geek** (app separado, multi-unidade; dono + balcão de confiança) — ver NEGOCIO  
- Quiosque Windows / limpeza de sessão Steam  
- Bot WA com mais auto em FAQ simples  
- Assinatura / planos mais claros  
- Litestream / Uptime extras  
- Multi-unidade GeekLock se houver 2ª sala

---

## Arquitetura (resumo)

```
Portal (Vercel) ──HTTPS──► API (loja + api.geekloja.com.br) ──► face-service
                              │
         GeekCentral / GeekLock (LAN) ──┘
                              │
                           SQLite
WhatsApp ──► Evolution + bot (loja-geek-whatsapp / VPS)
```

---

## Já implementado (marco)

- GeekLock / GeekCentral Windows, VIP facial, Liberar balcão, Caixa de horas  
- Portal: auth, checkout MP, enroll, `/avaliar`, CTA Google  
- WhatsApp: Evolution na VPS; pedido de avaliação pós-pago/venda (cooldown + opt-out)  
- Domínio + túnel nomeado `api.geekloja.com.br`  
- Admin celular com regra dono vs Wi‑Fi loja  

Detalhe ops e checklists: [`PENDENCIAS.md`](./PENDENCIAS.md).

---

## Sugestões de negócio (ainda válidas)

1. Unificar marca digital nas 3 fichas Maps → portal + WhatsApp da unidade.  
2. Pacote “primeira vez”: 1h + cadastro facial.  
3. Assinatura mensal com regra clara no balcão.  
4. Funil Google: avaliação após Pix/venda (em andamento).  
5. Cartaz LGPD no balcão + treino staff.  
6. Métricas semanais: VIPs, reconhecimento, horas portal vs balcão.
