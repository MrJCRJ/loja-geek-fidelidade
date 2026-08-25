# Refino contínuo — lista viva

Atualizado em **2026-08-25**.  
Objetivo: código mais limpo/leve em partes pequenas, sem reescrever o sistema.

## Feito (parte 1)

- [x] Deduplicar payload de `/api/settings` (GET/PUT) num helper local
- [x] Normalizar `AdminSettings` num único helper no admin web
- [x] Abrir esta lista a partir da auditoria

## Feito (parte 6)

- [x] `customer-routes.ts` — VIPs, enroll, pontos, tempo, rewards, ledger
- [x] `routes.ts` ficou só admin (health, settings, backup, telemetria) ~240 linhas

---

## Backlog encontrado

### Alto (peso / risco de manutenção)

| # | Item | Onde | Nota |
|---|------|------|------|
| R1 | ~~`routes.ts` monolito~~ | — | **feito partes 4–6** (stations/face/sessions/customers) |
| R2 | `App.tsx` GeekLock ~1100 linhas | `agent-windows/src/App.tsx` | Separar scan/sessão/UI/WS |
| R3 | `ClientesTab` ~560 linhas | `web/src/admin/tabs/ClientesTab.tsx` | Extrair enroll + tabela |

### Médio (duplicação / clareza)

| # | Item | Onde | Nota |
|---|------|------|------|
| R4 | ~~`cameraErrorMessage` triplicado~~ | — | **feito parte 2** |
| R5 | ~~Portal não usa `shared/camera.ts`~~ | — | **feito parte 2** |
| R6 | ~~`formatDuration` / `formatHours` parecidos~~ | — | **feito parte 3** |
| R7 | `DashboardPage` / `payments` / `portal-routes` ~500 linhas | portal + server | Cortar em pedaços quando tocar |
| R8 | `ApiError` duplicado | web/portal/lock | Shared fino ou aceitar por fronteira |

### Baixo (polimento)

| # | Item | Onde | Nota |
|---|------|------|------|
| R9 | `console.log/warn` em atalhos Electron | GeekLock `main.cjs` | Só em dev / nível debug |
| R10 | AdminPage ainda concentra enroll + tabs | `web/src/pages/AdminPage.tsx` | Já modular; dá para afinar |
| R11 | Testes de tipagem `server` frouxos | `app.ts` / `db.ts` | Ajustar tipos sem mudar runtime |
| R12 | Ícone default Electron | packs | Branding no builder |

### Produto (não é só limpeza)

| # | Item |
|---|------|
| P1 | Admin responsivo no celular |
| P2 | CI GitHub Actions |
| P3 | LGPD retenção fina |
| P4 | Multi-Central no mesmo portal |

---

## Próxima parte sugerida

**Parte 7:** partir GeekLock `App.tsx` (scan / sessão / overlay) **ou** `ClientesTab` no admin.
