# Roadmap — Loja Geek / Geeks

Atualizado em 2026-08-25.  
Portal: https://loja-geek-portal.vercel.app  
Projeto: `loja-geek-fidelidade`

**Backlog de melhorias priorizado:** [`MELHORIAS.md`](./MELHORIAS.md) (resumo do ciclo).  
**Lista do projeto todo:** [`LISTA-COMPLETA.md`](./LISTA-COMPLETA.md).  
Este arquivo resume arquitetura, o que já existe e prioridade de negócio/ops.

Planos Cursor antigos (GeekLock, portal, Melhorias Loja Geek, etc.) ficam supersedidos por estes docs.

---

## Arquitetura

```
Portal (Vercel) ──HTTPS túnel──► API Fastify :8787 ──► face-service :8100
                                      │
                    GeekAdmin / GeekLock (LAN) ──┘
                                      │
                                   SQLite
```

---

## Já implementado (incl. ciclo 2026-08-24)

### GeekLock / estação
- PIN Admin ilimitado, WS + comandos remotos, status ao vivo
- Autostart XDG, single-instance, bandeja, `start:linux`, `ensure_face_service`

### Portal cliente
- Marca navy/gold, landing 3 unidades, auth, checkout, enroll auto, OfflineBanner
- Editar perfil · recuperar senha (`/forgot`, `/reset` + reset no balcão)
- Histórico de consumo (`GET /api/portal/me/time-ledger`)
- CTA avaliação Google · página Termos LGPD (`/termos`)

### Admin / API / segurança
- Auto-enroll, preview facial, controles de estação
- Extrato de pontos, editar cliente, health Face/API, reset senha portal
- Marca dark/gold no GeekCentral
- `STRICT_SECRETS` / falha em defaults · hash admin (bcrypt) · tokens de estação SHA-256
- Rate limit login/recognize · auth face-service (`FACE_SERVICE_TOKEN`) · claim secret sem default na UI
- Suite Vitest + pytest + smoke · certs TLS · healthchecks Docker
- Checklist: `docs/loja-ready.md` + `scripts/loja-ready.sh` (`npm run loja:ready`)
- GeekCentral: wizard de primeiro boot, senha oculta no launcher, health Face honesto
- Admin modular: busca VIP, token+QR, mensagem custom, modais, toasts, WS reconnect, backup SQLite, export LGPD, unidade (multi-loja base)

### Pagamentos
- Mercado Pago Pix + webhook (stub sem token); validação `MP_WEBHOOK_SECRET` se definido

---

## Ainda depende da loja (ops humano)

- [ ] Túnel Cloudflare **nomeado** + URL fixa + autostart
- [ ] `MP_ACCESS_TOKEN` + webhook HTTPS
- [ ] Alinhar 3 fichas Google Business com URL do portal (conteúdo Maps)

### P3 — Depois
- [ ] Catálogo games / agendamento INSS via WhatsApp
- [ ] Multi-unidade GeekLock
- [ ] Backup automatizado SQLite · CI GitHub Actions
- [ ] LGPD retenção fina · service worker PWA
- [ ] Demais itens em [`MELHORIAS.md`](./MELHORIAS.md)

### UI (2026-08-25)
- Visual glass (formulários/painéis) no admin web, portal Vercel, GeekLock e GeekCentral

---

## Ordem sugerida

1. `npm run loja:ready` + túnel nomeado + Pix real
2. Confirmar `STRICT_SECRETS=1` em produção
3. Growth Maps (Google Business)
4. P3 conforme demanda da 2ª unidade

---

## Sugestões de negócio (Geeks)

1. Unificar marca digital nas 3 fichas Maps → portal + WhatsApp da unidade.
2. Pacote “primeira vez”: 1h + cadastro facial grátis.
3. Assinatura mensal (~R$50) com regra clara no balcão.
4. Funil Google: avaliação por unidade após Pix/enroll (já no portal).
5. WhatsApp Business como suporte oficial.
6. 1 PC controle por unidade até Pix + GeekLock estáveis.
7. Cartaz LGPD no balcão + treino staff.
8. Métricas semanais: VIPs, % reconhecimento, horas portal vs balcão.
9. Comunicar que saldo/face dependem da loja online.
