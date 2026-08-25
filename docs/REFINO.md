# Refino contínuo — lista viva

Atualizado em **2026-08-25**.  
Objetivo: código mais limpo/leve em partes pequenas, sem reescrever o sistema.

## Feito (parte 1)

- [x] Deduplicar payload de `/api/settings` (GET/PUT) num helper local
- [x] Normalizar `AdminSettings` num único helper no admin web
- [x] Abrir esta lista a partir da auditoria

## Feito (parte 5)

- [x] `face-routes.ts` — recognition events, presence, recognize
- [x] `session-routes.ts` — start / heartbeat / end / list
- [x] `routes.ts` ~920 → ~570 linhas

---

## Backlog encontrado

### Alto (peso / risco de manutenção)

| # | Item | Onde | Nota |
|---|------|------|------|
| R1 | ~~`routes.ts` monolito~~ | — | Partes 4–5: stations/face/sessions; sobra admin+customers |
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

**Parte 6:** extrair rotas de customers/rewards (o que sobra em `routes.ts`) **ou** começar a partir o GeekLock `App.tsx`.
