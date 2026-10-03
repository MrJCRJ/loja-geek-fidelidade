# Backlog do portal — Geeks

Atualizado em 2026-08-24. Site: https://loja-geek-portal.vercel.app  
Roadmap completo: [`docs/roadmap.md`](roadmap.md) · Checklist loja: [`docs/loja-ready.md`](loja-ready.md)

## Já resolvido

- Reset de cadastro facial (`DELETE /api/portal/enroll` + **Refazer cadastro facial**)
- Zerar amostras no GeekCentral (`DELETE /api/customers/:id/enroll`)
- Redesign navy/gold + BrandHeader + logo
- Landing com 3 unidades, Maps, WhatsApp, horários
- Enroll guiado + auto + OfflineBanner
- Editar perfil (nome / telefone / senha logado)
- Recuperar senha (`/forgot`, `/reset` + botão **Reset senha portal** no GeekCentral)
- Histórico de consumo lan (`time_ledger`) além das compras web
- CTA avaliação Google pós-compra/enroll
- Página de termos LGPD (`/termos`)
- Checkout Mercado Pago Pix (código; ativar token na loja)
- Hardening API (segredos, hash tokens, rate limit, face-service auth)

## Ainda falta (operação na loja)

### Operação (P0)
- [ ] Túnel Cloudflare **nomeado** + URL fixa + autostart (`scripts/portal-tunnel.sh` + `docs/portal-api-tunnel.md`)
- [ ] Pix em produção: `MP_ACCESS_TOKEN` + webhook público Mercado Pago
- [ ] Rodar `bash scripts/loja-ready.sh` / `npm run loja:ready` e marcar checklist em `docs/loja-ready.md`

### Crescimento (P2 — conteúdo / Google Business)
- [ ] Nas 3 fichas do Google Business, adicionar URL do portal (ação humana no Maps)
- [ ] Pacotes promo sazonais

### Depois (P3)
- [ ] Catálogo games / agendamento INSS via WhatsApp
- [ ] Multi-unidade GeekLock
- [ ] Service worker (PWA offline real)
