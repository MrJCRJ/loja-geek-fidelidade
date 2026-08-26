# Lista de melhorias — Loja Geek Fidelidade

Atualizado em **2026-08-25** (telemetria + P3).  
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
- [x] Fases 1–3 .exe (autostart, túnel, descoberta LAN / wizard)
- [x] Telemetria produção + aba Saúde — [`telemetria.md`](./telemetria.md)
- [x] Overlay de mensagem remota rico (título / nível / duração)
- [x] PWA portal (manifest + service worker)
- [x] Catálogo WhatsApp + unidades no `/api/portal/catalog`

---

## P0 — Ainda depende da loja (ops)

| # | Item |
|---|------|
| 1 | Túnel Cloudflare nomeado + URL fixa + autostart |
| 2 | Pix real: `MP_ACCESS_TOKEN` + webhook |
| 3 | Rodar `npm run loja:ready` e marcar checklist |
| 4 | `STRICT_SECRETS=1` no PC controle |
| 5 | Regenerar pendrive após estas mudanças (`pack:central` / `pack:lock`) |

## Exe Windows — instalação / túnel / boot

Lista dedicada: [`exe-instalacao-autostart.md`](./exe-instalacao-autostart.md)

**Fases 1–3 feitas** (autostart, túnel UI, descoberta LAN + assistente GeekLock).

---

## P2 / P3 — Próximas (código ou produto)

Lista de limpeza contínua: [`REFINO.md`](./REFINO.md).

| # | Item |
|---|------|
| 18 | ~~Admin responsivo no celular~~ **feito** (parte 14) |
| 20 | ~~Dashboard métricas no GeekCentral (além da aba Saúde)~~ **feito** (parte 17) |
| 23 | ~~Backup automático SQLite (agendado)~~ **feito** (Config → intervalo + retenção) |
| 24 | ~~CI GitHub Actions~~ **feito** (parte 13) |
| 25 | ~~Multi-unidade GeekLock avançada (vários Centrals no mesmo portal)~~ **feito** (parte 16) |
| 28 | ~~Retenção LGPD fina (apagar face sem apagar conta)~~ **feito** (parte 15) |

---

## Como subir em dev

```bash
npm run dev                 # face :8100 + API :8787 + web :5173
npm run compose:up          # Docker sem nginx
npm run compose:https       # Docker + HTTPS
```

Match remoto (debug): `FACE_MATCH_REMOTE=1` na API.
