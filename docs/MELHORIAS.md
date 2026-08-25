# Lista de melhorias — Loja Geek Fidelidade

Atualizado em **2026-08-25** (pós-implementação P1).  
Repo: https://github.com/MrJCRJ/loja-geek-fidelidade  
Portal: https://loja-geek-portal.vercel.app

---

## Feito nesta rodada (código)

- [x] Remover Pillow / InsightFace / Haar; face só OpenCV YuNet+SFace
- [x] Face-service com lifespan + CORS restrito (`FACE_CORS_ORIGINS`)
- [x] Match facial **local na API** (não manda galeria ao face a cada frame)
- [x] Nginx opcional: `docker compose --profile https` / `npm run compose:https`
- [x] GeekLock pack: target `dir` (alinhado aos scripts)
- [x] Helpers de câmera em `shared/camera.ts`
- [x] `npm run dev` → face + server + web (`scripts/dev-all.sh`)
- [x] Empty states no admin (clientes, feed, estações, sessões, recompensas)
- [x] Doc modos de estação: [`estacao-modos.md`](./estacao-modos.md)
- [x] Visual glass (admin, portal, GeekLock, GeekCentral) — commits anteriores

---

## P0 — Ainda depende da loja (ops)

| # | Item |
|---|------|
| 1 | Túnel Cloudflare nomeado + URL fixa + autostart |
| 2 | Pix real: `MP_ACCESS_TOKEN` + webhook |
| 3 | Rodar `npm run loja:ready` e marcar checklist |
| 4 | `STRICT_SECRETS=1` no PC controle |
| 5 | Regenerar pendrive após estas mudanças (`pack:central` / `pack:lock`) |

---

## P2 / P3 — Próximas (código ou produto)

| # | Item |
|---|------|
| 18 | Admin responsivo no celular |
| 20 | Dashboard métricas no GeekCentral |
| 21 | Overlay de mensagem remota mais rico no GeekLock |
| 22 | URL do portal nas 3 fichas Google Business |
| 23 | Backup automático SQLite |
| 24 | CI GitHub Actions |
| 25 | Multi-unidade GeekLock |
| 26 | PWA no portal |
| 27 | Catálogo games / WhatsApp |
| 28 | Retenção LGPD fina (apagar face sem apagar conta) |

---

## Como subir em dev

```bash
npm run dev                 # face :8100 + API :8787 + web :5173
npm run compose:up          # Docker sem nginx
npm run compose:https       # Docker + HTTPS
```

Match remoto (debug): `FACE_MATCH_REMOTE=1` na API.
