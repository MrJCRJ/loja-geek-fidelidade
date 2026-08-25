# Refino contínuo — lista viva

Atualizado em **2026-08-25**.  
Objetivo: código mais limpo/leve em partes pequenas, sem reescrever o sistema.

## Feito (parte 1)

- [x] Deduplicar payload de `/api/settings` (GET/PUT) num helper local
- [x] Normalizar `AdminSettings` num único helper no admin web
- [x] Abrir esta lista a partir da auditoria

---

## Backlog encontrado

### Alto (peso / risco de manutenção)

| # | Item | Onde | Nota |
|---|------|------|------|
| R1 | `routes.ts` ~1060 linhas | `server/src/routes.ts` | Partir em stations / customers / sessions / admin |
| R2 | `App.tsx` GeekLock ~1100 linhas | `agent-windows/src/App.tsx` | Separar scan/sessão/UI/WS |
| R3 | `ClientesTab` ~560 linhas | `web/src/admin/tabs/ClientesTab.tsx` | Extrair enroll + tabela |

### Médio (duplicação / clareza)

| # | Item | Onde | Nota |
|---|------|------|------|
| R4 | `cameraErrorMessage` triplicado | web / portal / GeekLock | Unificar em `shared/` (msgs por app ok) |
| R5 | Portal não usa `shared/camera.ts` | `portal/src/api.ts` | Alinhar ao shared (já usado no web/lock) |
| R6 | `formatDuration` / `formatHours` parecidos | web + portal + lock | Um módulo shared de tempo |
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

**Parte 2:** unificar `cameraErrorMessage` + opcionalmente portal → `shared/camera.ts` (ganho real, risco baixo).
