# Auditoria — Loja Geek Fidelidade

Documento **histórico** de 2026-08-25.  
A lista **atual** de melhorias (o que ainda falta) está em:

→ **[`docs/MELHORIAS.md`](./docs/MELHORIAS.md)**

Roadmap: [`docs/roadmap.md`](./docs/roadmap.md) · Checklist loja: [`docs/loja-ready.md`](./docs/loja-ready.md)

## Visão rápida

| Peça | Pasta | Papel |
|------|--------|--------|
| API | `server/` | Fastify + SQLite + JWT + WebSocket (`:8787`) |
| Face | `face-service/` | FastAPI + OpenCV YuNet/SFace (`:8100`) |
| Web | `web/` | React admin + estação browser |
| Portal | `portal/` | Site do cliente (Vercel) |
| GeekCentral | `agent-central-windows/` | PC controle (Electron) |
| GeekLock | `agent-windows/` | Estação travada (Electron) |

Muitos itens da auditoria original (WS no GeekLock, ledger UI, Docker healthy, testes, STRICT_SECRETS, visual glass) **já foram feitos** — não use este arquivo como backlog ativo.
