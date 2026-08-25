# Lista de melhorias — Loja Geek Fidelidade

Atualizado em **2026-08-25**.  
Repo: https://github.com/MrJCRJ/loja-geek-fidelidade  
Portal: https://loja-geek-portal.vercel.app  
Roadmap geral: [`roadmap.md`](./roadmap.md) · Checklist loja: [`loja-ready.md`](./loja-ready.md)

Este arquivo lista o que **ainda dá para fazer** no código (e o que já foi fechado recentemente).

---

## Já feito (recente)

- Visual glass (painéis / formulários) em `web/`, `portal/`, GeekLock e GeekCentral
- WebSocket + comandos remotos no GeekLock
- Extrato de pontos / editar VIP / health Face·API no admin
- Wizard de 1º boot no GeekCentral · backup SQLite · export LGPD
- Hardening: `STRICT_SECRETS`, bcrypt, rate limit, token face-service
- Testes Vitest + pytest + smoke · Docker `service_healthy`
- Portal: auth, enroll, Pix (código), termos, histórico de horas

---

## P0 — Operação da loja (alto impacto, pouco código)

| # | Melhoria | Onde / como |
|---|----------|-------------|
| 1 | Túnel Cloudflare **nomeado** + URL fixa + autostart | `scripts/portal-tunnel.sh`, `docs/portal-api-tunnel.md` |
| 2 | Pix real: `MP_ACCESS_TOKEN` + webhook HTTPS | API + painel Mercado Pago |
| 3 | Rodar `npm run loja:ready` e marcar checklist | `docs/loja-ready.md` |
| 4 | Confirmar `STRICT_SECRETS=1` (ou `NODE_ENV=production`) no PC controle | GeekCentral / `.env` |
| 5 | Regenerar pendrive GeekCentral/GeekLock após o visual glass | `scripts/pack-pendrive*.sh` |

---

## P1 — Código rápido (1 sessão)

| # | Melhoria | Detalhe |
|---|----------|---------|
| 6 | Remover `Pillow` dos requirements do face | Não é importado em `main.py` |
| 7 | Remover ramo InsightFace + `requirements-insightface.txt` | Runtime real = OpenCV |
| 8 | Remover fallback Haar (ou falhar se ONNX não carregar) | Evita embeddings incompatíveis |
| 9 | Face-service: lifespan em vez de `@app.on_event("startup")` | FastAPI moderno |
| 10 | Fechar CORS do face se só a API local chama | Segurança |
| 11 | Match facial na API (cache de galeria / cosine local) | Menos payload a cada frame — melhor em PC fraco |
| 12 | Nginx opcional no Compose (`profiles: [https]`) | GeekLock puro não precisa 80/443 |
| 13 | Alinhar `agent-windows` build `portable` vs pack `dir` | Menos confusão no pack |
| 14 | Extrair helpers de câmera compartilhados | Duplicados em `web/src/api.ts` e `agent-windows/src/api.ts` |
| 15 | `npm run dev` na raiz orquestrar face + server + web | DX |

---

## P2 — Produto / UX

| # | Melhoria | Detalhe |
|---|----------|---------|
| 16 | Unificar estação: pontos (browser) vs horas (GeekLock) | Documentar modo oficial da loja **ou** fundir fluxos |
| 17 | Empty states no admin | “Nenhum VIP”, “Nenhuma sessão” + CTA |
| 18 | Mobile do admin | Tabelas/formulários usáveis no celular do balcão |
| 19 | Feedback visual unificado GeekLock ↔ portal | Mesma linguagem de estados (scan / ok / erro) |
| 20 | Dashboard simples no GeekCentral | VIPs hoje, horas consumidas, estações online |
| 21 | Mensagens remotas ricas no GeekLock | Toast/overlay melhor para `message` do admin |
| 22 | Google Business: URL do portal nas 3 fichas | Ops humano no Maps |

---

## P3 — Depois / escala

| # | Melhoria | Detalhe |
|---|----------|---------|
| 23 | Backup automático SQLite (cron / GeekCentral) | Incluir checkpoint WAL |
| 24 | CI GitHub Actions (test + build web/portal) | Regressão |
| 25 | Multi-unidade GeekLock | 2ª loja / N PCs controle |
| 26 | PWA no portal (service worker) | Offline real além do banner |
| 27 | Catálogo games / agendamento via WhatsApp | Crescimento |
| 28 | Retenção LGPD fina | Prazo de embeddings, apagar face sem apagar conta |
| 29 | Admin remoto via túnel estável | Já esboçado no README; depende do P0#1 |

---

## Remover / reduzir ruído (mesma função)

| Remover | Motivo |
|---------|--------|
| `Pillow`, InsightFace, Haar fallback | Código morto / caminho perigoso |
| Artefatos locais regeneráveis (`pendrive/`, `*/release/`, `.cache/`, `.venv`) | Liberam GBs no disco |
| Docs desatualizados que contradizem este arquivo | Manter `docs/MELHORIAS.md` + `roadmap.md` como fonte |

**Não remover sem decidir produto:** `StationPage` + nginx (kiosk browser), dual GeekCentral/GeekLock, seed de rewards.

---

## Ordem sugerida

1. **P0** — túnel + Pix + `loja:ready` + pack pendrive com visual novo  
2. **P1 #6–11** — limpar face-service + match mais leve (PC de 4 GB / HDD)  
3. **P2 #16–20** — produto claro e UX do balcão  
4. **P3** conforme 2ª unidade / demanda  

---

## Riscos a lembrar ao mexer

- GeekLock não é kiosk OS completo (Ctrl+Alt+Del etc.)
- Biometria em SQLite → LGPD (consentimento ok; retenção ainda fraca)
- Portal na Vercel **depende** da API da loja online (túnel)
- Backup: incluir `-wal`/`-shm` ou fazer checkpoint antes de copiar o `.db`
