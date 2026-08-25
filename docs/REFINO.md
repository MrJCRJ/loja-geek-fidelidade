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

---

## Backlog encontrado

### Alto (peso / risco de manutenção)

| # | Item | Onde | Nota |
|---|------|------|------|
| R1 | ~~`routes.ts` monolito~~ | — | **feito partes 4–6** (stations/face/sessions/customers) |
| R2 | ~~GeekLock `App.tsx` monolito~~ | — | **feito partes 7–8** (~634 linhas; hooks scan/presença) |
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

**Parte 9:** partir `ClientesTab` (enroll + tabela) **ou** R8 `ApiError` shared.
