# Vivo vs arquivo — monorepo `loja-geek-fidelidade`

Atualizado em **2026-10-03** (limpeza executada).

Mapa de negócio: [`NEGOCIO-GEEK.md`](./NEGOCIO-GEEK.md).

---

## Vivo (dia a dia)

| Caminho | Papel |
|---------|--------|
| `server/` | API Fastify |
| `web/` | Admin embutido / GeekCentral UI |
| `portal/` | Site cliente (Vercel) |
| `face-service/` | Reconhecimento facial |
| `agent-windows/` | GeekLock (estação) — **sem** `release/` local |
| `agent-central-windows/` | GeekCentral — **sem** `release/` local |
| `shared/` | Código compartilhado |
| `scripts/` | Pack pendrive, túnel, loja-ready |
| `docs/` | Documentação canônica |
| `deploy/` | Nginx / exemplos ops |
| Repo irmão `loja-geek-whatsapp` | Evolution + bot WA (VPS) |

**Docs canônicos:** `NEGOCIO-GEEK.md`, `PENDENCIAS.md`, `geeklock-handoff.md`, `GEEKADMIN-CELULAR.md`, `docs/README.md`.

---

## Regenerável (apagado / gitignored)

| Caminho | Nota |
|---------|------|
| `pendrive/` | Só `README.md`; regenerar com `scripts/pack-pendrive*.sh` |
| `agent-*/release/` | Build Electron local |
| `.cache/` | Cache de build |
| `index-*.js` na raiz | Chunk solto — não é fonte |
| `dist-release/` | gitignored; manter só o ZIP atual no disco se precisar |

---

## Arquivo (`docs/arquivo/`)

Histórico movido na limpeza: `AUDITORIA.md`, `DEMO.md`, `PENDENTE-cadastro-vip.txt`, `LISTA-COMPLETA.md`, `MELHORIAS.md`, `REFINO.md`, `portal-backlog.md`, `UX-LISTAS-E-COMPRA.md`.

Incidentes e snapshots (`ESTADO-SISTEMA-*`, `INCIDENTE-*`, `CORRECAO-*`) ficam em `docs/` — ainda úteis.

---

## Não misturar

| Projeto | Relação |
|---------|---------|
| `financas-familia` | Finanças pessoais |
| Futuro site financeiro Geek | Backlog — [`NEGOCIO-GEEK.md`](./NEGOCIO-GEEK.md) |
