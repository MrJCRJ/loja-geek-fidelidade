# Loja Geek — Fidelidade VIP (reconhecimento facial)

Sistema **local na LAN**: 1 PC controle + N estações com webcam.

## O que tem no MVP

- Cadastro VIP com consentimento LGPD e níveis (bronze/prata/ouro)
- Enroll facial (3–5 amostras) — guarda embedding, não stream contínuo
- Estação kiosk: webcam → reconhece VIP → pontos / resgate
- PC controle: feed ao vivo, estações online, comandos (`reload`, `message`, `lock_screen`)
- Recompensas e ledger de pontos (1 pt / R$ 1, configurável)
- **GeekCentral.exe** (Windows): sobe API + facial + admin sem Docker
- **GeekLock.exe** (Windows): trava a estação até reconhecer VIP

## PC controle Windows (recomendado na loja)

**Sem pendrive (GitHub + Cursor na loja):** siga [`docs/SETUP-WINDOWS-LOJA.md`](docs/SETUP-WINDOWS-LOJA.md) — domínio/túnel `api.geekloja.com.br` já estão prontos; o agent no Windows só clona, sobe o Central e autentica o Cloudflare.

Gere as pastas do pendrive (no Linux de build):

```bash
bash scripts/pack-pendrive-central.sh   # → pendrive/GeekCentral/
bash scripts/pack-pendrive.sh           # → pendrive/GeekLock/
```

No PC controle:

1. Copie a pasta `GeekCentral` para o disco (ex.: `C:\GeekCentral`).
2. Execute `GeekCentral.exe` e espere **Online**.
3. No primeiro boot, defina a senha admin e os segredos (wizard obrigatório). Depois abra o admin.

Nas estações: pasta `GeekLock`, `config.json` com `"serverUrl": "http://IP-DO-CONTROLE:8787"`, rode `GeekLock.exe`.

> Copie a **pasta inteira**, não só o `.exe`. Dados ficam em `GeekCentral\data\` (faça backup).

## Desenvolvimento (3 terminais)

```bash
# 1) Face service
cd face-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8100

# 2) API
cd server && npm install && npm run dev

# 3) Web
cd web && npm install && npm run dev
```

| Tela | URL |
|------|-----|
| Home | http://localhost:5173/ |
| Admin | http://localhost:5173/admin — senha do `.env` / setup |
| Estação | http://localhost:5173/station?name=Balcao-1 |

## Docker no PC controle (Linux)

```bash
cp .env.example .env
npm run compose:up          # face + api (HTTP :8787)
# npm run compose:https     # + nginx 80/443 (webcam no browser)
```

Acesse `http://IP-DO-PC-CONTROLE:8787`. Modos de estação: [`docs/estacao-modos.md`](docs/estacao-modos.md).

### Modo Linux nativo (apps do sistema — sem navegador)

```bash
# Sobe API/face + GeekCentral (Electron) + GeekLock (Electron)
bash scripts/linux-loja.sh start
# ou: npm run linux:start
```

| App | Papel |
|-----|--------|
| **GeekCentral** | PC controle — cadastro VIP, enroll, estações |
| **GeekLock** | Estação — trava, reconhecimento, sessão |

Não use Firefox/Chrome. Tudo abre em janela Electron.

```bash
bash scripts/linux-loja.sh admin      # só GeekCentral
bash scripts/linux-loja.sh geeklock   # só GeekLock
bash scripts/linux-loja.sh droidcam IP_DO_CELULAR
bash scripts/linux-loja.sh stop
```

## Ligar uma estação na loja (browser)

1. No admin, crie a estação **ou** na própria estação use o claim com o segredo (`STATION_SHARED_SECRET`).
2. Abra em kiosk:

```bash
chromium --kiosk "https://IP-DO-PC-CONTROLE/station?name=PC-03"
```

> Webcam no **navegador** exige **HTTPS** (ou localhost). O **GeekLock.exe** não precisa de HTTPS.

## Portal do cliente (Vercel)

App em `portal/` (Vite + React): cadastro, saldo, compra de horas (stub), assinatura e enroll facial pelo celular.

```bash
cd portal && npm install && VITE_API_URL=http://127.0.0.1:8787 npm run dev
# → http://localhost:5175
```

Na Vercel: Root Directory `portal`, `VITE_API_URL=https://api.seudominio.com`.  
Na API da loja: `PORTAL_ORIGIN=https://seu-portal.vercel.app`.  
Expor a API: ver [`docs/portal-api-tunnel.md`](docs/portal-api-tunnel.md).

## Estrutura

```
loja-geek-fidelidade/
  server/                  # Fastify + SQLite + WebSocket + /api/portal/*
  face-service/            # OpenCV YuNet+SFace
  web/                     # React GeekCentral (admin) + estação
  portal/                  # Portal do cliente (deploy Vercel)
  agent-windows/           # GeekLock (estação)
  agent-central-windows/   # GeekCentral (PC controle)
  docs/                    # Tunnel CORS, etc.
  scripts/                 # pack pendrive + prepare runtime
  data/                    # banco SQLite (dev/docker)
  docker-compose.yml
```

## Admin remoto / túnel

A Vercel hospeda só o **front do portal** (e, se quiser, o admin). A API/WebSocket/facial ficam no PC da loja.

1. Expor `8787` com **Cloudflare Tunnel** → URL HTTPS (`docs/portal-api-tunnel.md`).
2. Deploy `portal/` na Vercel com `VITE_API_URL` apontando para o túnel.
3. GeekLock nas estações pode continuar na LAN (`http://IP:8787`).

Enquanto o PC da loja estiver desligado, o portal não credita nem reconhece.

## Documentação

| Doc | Uso |
|-----|-----|
| [`docs/roadmap.md`](docs/roadmap.md) | Planejamento consolidado |
| [`docs/portal-backlog.md`](docs/portal-backlog.md) | Pendências do portal |
| [`docs/loja-ready.md`](docs/loja-ready.md) | Checklist túnel + Pix |
| [`docs/teorias-producao.md`](docs/teorias-producao.md) | Teorias de incidentes em produção (GeekLock) |
| [`docs/ECOSSISTEMA.md`](docs/ECOSSISTEMA.md) | Ferramentas/projetos úteis (explicado em português simples) |
| [`docs/UX-LISTAS-E-COMPRA.md`](docs/UX-LISTAS-E-COMPRA.md) | UX: histórico top 15, compra por hora ou R$ |
| [`docs/LISTA-COMPLETA.md`](docs/LISTA-COMPLETA.md) | Melhorias do **projeto todo** (ops, apps, Pix, portal…) |
| [`docs/portal-api-tunnel.md`](docs/portal-api-tunnel.md) | Cloudflare Tunnel |

```bash
npm run loja:ready
# ou: bash scripts/loja-ready.sh
```

## Repositório

GitHub (privado): https://github.com/MrJCRJ/loja-geek-fidelidade

## Continuar em outro PC

- **Lista de melhorias (atual):** [`docs/MELHORIAS.md`](./docs/MELHORIAS.md)
- Modos GeekLock vs browser: [`docs/estacao-modos.md`](./docs/estacao-modos.md)
- Roadmap: [`docs/roadmap.md`](./docs/roadmap.md)
- Auditoria histórica: [`AUDITORIA.md`](./AUDITORIA.md)
