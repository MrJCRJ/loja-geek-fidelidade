# Refino contínuo — lista viva

Atualizado em **2026-08-25**.  
Objetivo: código mais limpo/leve em partes pequenas, sem reescrever o sistema.

## Feito (parte 1)

- [x] Deduplicar payload de `/api/settings` (GET/PUT) num helper local
- [x] Normalizar `AdminSettings` num único helper no admin web
- [x] Abrir esta lista a partir da auditoria

## Feito (parte 7)

- [x] GeekLock: `kiosk-helpers.ts`, `LockedScreen`, `OfflineScreen`, `RemoteBannerOverlay`
- [x] `App.tsx` ~1116 → ~920 (lógica de scan/sessão ainda centralizada — próximo corte: hooks)

## Feito (parte 8)

- [x] GeekLock: `hooks/useRecognizeLoop.ts`, `hooks/usePresenceLoop.ts`
- [x] `App.tsx` ~920 → ~634 (scan locked + presença/handoff unlocked)

## Feito (parte 9)

- [x] Admin: `ClientesListPanel`, `ClienteEnrollPanel`, `ClienteManagePanel`
- [x] `ClientesTab` ~560 → ~180 (orquestrador)
- [x] `shared/api-error.ts` — `ApiError` unificado (web, portal, GeekLock)

## Feito (parte 10)

- [x] Server: `portal-routes.ts` partido em public, account, checkout, enroll + catalog/guards
- [x] `portal-routes.ts` ~500 → ~12 (orquestrador)

## Feito (parte 11)

- [x] Portal: `dashboard/` (alerts, balance, checkout, history, header, skeleton)
- [x] Hooks `useDashboardData` + `useDashboardCheckout`
- [x] `DashboardPage` ~470 → ~65 (orquestrador)

---

## Backlog encontrado

### Alto (peso / risco de manutenção)

| # | Item | Onde | Nota |
|---|------|------|------|
| R1 | ~~`routes.ts` monolito~~ | — | **feito partes 4–6** (stations/face/sessions/customers) |
| R2 | ~~GeekLock `App.tsx` monolito~~ | — | **feito partes 7–8** (~634 linhas; hooks scan/presença) |
| R3 | ~~`ClientesTab` monolito~~ | — | **feito parte 9** (list + enroll + manage) |

### Médio (duplicação / clareza)

| # | Item | Onde | Nota |
|---|------|------|------|
| R4 | ~~`cameraErrorMessage` triplicado~~ | — | **feito parte 2** |
| R5 | ~~Portal não usa `shared/camera.ts`~~ | — | **feito parte 2** |
| R6 | ~~`formatDuration` / `formatHours` parecidos~~ | — | **feito parte 3** |
| R7 | ~~`portal-routes` monolito~~ | — | **feito parte 10** |
| R7b | ~~`DashboardPage` monolito~~ | — | **feito parte 11** (dashboard/ + hooks) |
| R8 | ~~`ApiError` duplicado~~ | — | **feito parte 9** (`shared/api-error.ts`) |

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

**Parte 11:** CI GitHub Actions (P2) **ou** cortar `DashboardPage` (portal front).
