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

## Feito (parte 12)

- [x] R9: logs Electron gated (`GEEKLOCK_DEBUG` / dev)
- [x] R10: `useAdminEnrollCamera` — AdminPage ~370 → ~260
- [x] R11: tipagem `ZodError` + WS status + `db.ts` helpers
- [x] R12: ícone marca `icon-256.png` no GeekLock e GeekCentral

## Feito (parte 13)

- [x] GitHub Actions: server test/build, web, portal, GeekLock tsc, face-service pytest

## Feito (parte 14)

- [x] Admin responsivo: topbar, tabs com scroll + labels curtos, tabelas scrolláveis, toque 44px

## Feito (parte 15)

- [x] LGPD: `revoke-biometrics` (apaga face + consent, mantém conta)
- [x] Retenção `recognition_events` (config + purge agendado / manual)

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
| R9 | ~~`console.log/warn` em atalhos Electron~~ | — | **feito parte 12** (`electron/debug.cjs`, só dev/DEBUG) |
| R10 | ~~AdminPage enroll/câmera~~ | — | **feito parte 12** (`useAdminEnrollCamera`) |
| R11 | ~~Tipagem frouxa server~~ | — | **feito parte 12** (`app.ts` ZodError, `db.ts`) |
| R12 | ~~Ícone default Electron~~ | — | **feito parte 12** (`icon-256.png` + electron-builder) |

### Produto (não é só limpeza)

| # | Item |
|---|------|
| P1 | ~~Admin responsivo no celular~~ | — | **feito parte 14** |
| P2 | ~~CI GitHub Actions~~ | — | **feito parte 13** (`.github/workflows/ci.yml`) |
| P3 | ~~LGPD retenção fina~~ | — | **feito parte 15** (revogar biometria + purge eventos) |
| P4 | Multi-Central no mesmo portal |

---

## Próxima parte sugerida

**Parte 16:** Multi-Central no mesmo portal (P4) **ou** ops loja (`docs/loja-ready.md`).
