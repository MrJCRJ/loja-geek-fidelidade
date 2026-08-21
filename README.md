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

Gere as pastas do pendrive (no Linux de build):

```bash
bash scripts/pack-pendrive-central.sh   # → pendrive/GeekCentral/
bash scripts/pack-pendrive.sh           # → pendrive/GeekLock/
```

No PC controle:

1. Copie a pasta `GeekCentral` para o disco (ex.: `C:\GeekCentral`).
2. Execute `GeekCentral.exe` e espere **Online**.
3. Anote o IP da LAN e abra o admin (senha padrão `admin123`).

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
| Admin | http://localhost:5173/admin — senha `admin123` |
| Estação | http://localhost:5173/station?name=Balcao-1 |

## Docker no PC controle (Linux)

```bash
cp .env.example .env
docker compose up -d --build
```

Acesse `http://IP-DO-PC-CONTROLE:8787` (ou HTTPS via nginx na pasta `deploy/`).

## Ligar uma estação na loja (browser)

1. No admin, crie a estação **ou** na própria estação use o claim com o segredo (`STATION_SHARED_SECRET`).
2. Abra em kiosk:

```bash
chromium --kiosk "https://IP-DO-PC-CONTROLE/station?name=PC-03"
```

> Webcam no **navegador** exige **HTTPS** (ou localhost). O **GeekLock.exe** não precisa de HTTPS.

## Estrutura

```
loja-geek-fidelidade/
  server/                  # Fastify + SQLite + WebSocket
  face-service/            # OpenCV YuNet+SFace
  web/                     # React admin + estação
  agent-windows/           # GeekLock (estação)
  agent-central-windows/   # GeekCentral (PC controle)
  scripts/                 # pack pendrive + prepare runtime
  data/                    # banco SQLite (dev/docker)
  docker-compose.yml
```

## Admin de qualquer lugar (fase 2 — ainda não implementado)

A Vercel só hospeda o **front**. A API/WebSocket/facial precisam continuar no PC controle.

Caminho previsto:

1. No PC com GeekCentral online, expor a porta `8787` com **Cloudflare Tunnel** (ou similar) → URL HTTPS pública.
2. Deploy do front `web/` na **Vercel** com variável apontando para essa URL (`VITE_API_BASE` / WebSocket).
3. GeekLock nas estações pode continuar na LAN (`http://IP:8787`) ou usar a URL do túnel.

Enquanto o PC da loja estiver desligado, o admin remoto não controla as máquinas.

## Repositório

GitHub (privado): https://github.com/MrJCRJ/loja-geek-fidelidade
