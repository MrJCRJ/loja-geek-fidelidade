# Auditoria e backlog — Loja Geek Fidelidade

Registro para continuar o trabalho em outro PC.  
Data: **2026-08-25** · Repo: https://github.com/MrJCRJ/loja-geek-fidelidade

## Visão rápida do sistema

| Peça | Pasta | Papel |
|------|--------|--------|
| API | `server/` | Fastify + SQLite + JWT + WebSocket (`:8787`) |
| Face | `face-service/` | FastAPI + OpenCV YuNet/SFace (`:8100`) |
| Web | `web/` | React: admin, home, estação browser |
| GeekCentral | `agent-central-windows/` | Electron: sobe API+face e abre admin |
| GeekLock | `agent-windows/` | Electron: trava OS até reconhecer VIP |
| Deploy | `docker-compose.yml`, `deploy/nginx/` | face + api + nginx HTTPS |

**Dois modos de estação (importante):**

- **Browser** (`StationPage`): pontos / resgate + WebSocket (recebe comandos do admin).
- **GeekLock**: sessão / horas + overlay; **não** conecta no `/ws` hoje (comandos Lock/Reload/Msg do admin não chegam).

---

## Melhorias (fazer)

### Rápidas

1. **WebSocket no GeekLock** — conectar no `/ws` e tratar `reload`, `message`, `lock_screen`, `unlock_screen` (hoje só a estação browser obedece).
2. **UI para APIs sem tela**
   - Extrato: `GET /api/ledger`, `GET /api/customers/:id/ledger`
   - Editar VIP: `PATCH /api/customers/:id`
   - Renomear estação: `PATCH /api/stations/:id`
3. **Match facial na API (ou cache de galeria)** — em `/api/recognize` a galeria inteira vai ao face-service a cada ciclo; cosine já existe em `face-service` (`/match`). Preferir embed + match local na API.
4. **Docker** — `depends_on` do `api` com `condition: service_healthy` (face já tem healthcheck; hoje usa `service_started`).
5. **Limpeza trivial**
   - `import path` não usado em `server/src/index.ts`
   - Rota `/admin/*` duplicada em `web/src/App.tsx`
   - Alinhar `agent-windows` `build.win.target` (`portable` no package vs `dir` nos scripts de pack)
6. **Segredos no 1º boot do GeekCentral** — exigir override de `admin123`, `JWT_SECRET`, `STATION_SHARED_SECRET`, PIN staff.
7. **Dev** — `npm run dev` na raiz sobe só server+web; documentar ou orquestrar o face (`dev:face`).

### Médio prazo

8. **Unificar produto de estação** — pontos (browser) vs horas (GeekLock). Fundir ou documentar claramente qual a loja usa.
9. **Helpers de câmera** — `openUserCamera` / `captureFrame` / `cameraErrorMessage` duplicados em `web/src/api.ts` e `agent-windows/src/api.ts`.
10. **Quebrar `web/src/pages/AdminPage.tsx`** (~834 linhas) em abas/componentes.
11. **Testes mínimos** — match cosine, claim de estação, ledger, start/end session, limiar facial.
12. **Face-service** — lifespan em vez de `@app.on_event("startup")`; CORS mais fechado se só a API chama; falhar se ONNX não carregar (não cair no Haar em silêncio).
13. **Nginx opcional no Compose** — `profiles: [https]`; GeekLock puro não precisa de 80/443 sempre.
14. **Fase 2 (túnel + Vercel)** — só quando for prioridade; ver seção no README.

---

## Remover / reduzir ruído (manter a mesma função)

| Item | Onde | Motivo |
|------|------|--------|
| `Pillow` | `face-service/requirements.txt`, `requirements-win.txt` | Não importado em `main.py` |
| InsightFace opcional | `requirements-insightface.txt` + ramo `FACE_MODE=insightface` em `main.py` | Runtime real = `FACE_MODE=opencv` |
| Fallback Haar + histograma | `face-service/main.py` | Embeddings incompatíveis com SFace |
| `GET /api/admin/me` | `server/src/routes.ts` | Sem uso no front |
| Target `portable` | `agent-windows/package.json` | Pack real usa `dir` |
| Senha claim pré-preenchida | `StationPage` | Ruído + risco em demo |
| Texto “fase 2 Vercel” no README | Pode virar issue até existir código | Documentação adiantada |

### Artefatos locais (já gitignored — apagar no disco se precisar de espaço)

Regeneráveis com `scripts/prepare-central-runtime.sh` + `scripts/pack-pendrive*.sh`:

- `pendrive/`
- `agent-*/release/`
- `agent-central-windows/runtime/`
- `.cache/`
- `face-service/.venv`, `*/node_modules`

### Não remover sem decisão de produto

- `StationPage` + nginx (kiosk browser / HTTPS para webcam)
- Seed de rewards em `server` / db
- Dual GeekCentral + GeekLock

---

## Ordem sugerida de ataque

1. Cortar insightface / Haar / Pillow + limpar artefatos locais  
2. WebSocket no GeekLock (admin passa a controlar estações de verdade)  
3. UI de ledger / editar VIP  
4. Match na API + health no compose (mais leve em PC fraco)  
5. Unificar pontos vs horas  

---

## Riscos a lembrar

- Defaults fracos de demo em “produção” da loja (`admin123`, secrets, CORS aberto).
- Embeddings biométricos em SQLite — cuidado LGPD (consentimento já existe; falta fluxo fino de retenção/export).
- GeekLock não é kiosk OS completo (Ctrl+Alt+Del etc.).
- Backup do SQLite: incluir `-wal`/`-shm` ou fazer checkpoint.
- Sem testes automatizados hoje.

---

## Como rodar (atalho)

```bash
# Dev (3 terminais) — ver README
# Face :8100 | API :8787 | Web :5173

docker compose up -d --build   # PC controle Linux
bash scripts/pack-pendrive-central.sh   # → pendrive/GeekCentral/
bash scripts/pack-pendrive.sh           # → pendrive/GeekLock/
```

Admin: senha padrão `admin123` (trocar).  
Estação browser: claim com `STATION_SHARED_SECRET`.
