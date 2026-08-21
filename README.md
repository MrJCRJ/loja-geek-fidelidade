# Loja Geek — Fidelidade VIP (reconhecimento facial)

Sistema **local na LAN**: 1 PC controle + N estações com webcam.

## O que tem no MVP

- Cadastro VIP com consentimento LGPD e níveis (bronze/prata/ouro)
- Enroll facial (3–5 amostras) — guarda embedding, não stream contínuo
- Estação kiosk: webcam → reconhece VIP → pontos / resgate
- PC controle: feed ao vivo, estações online, comandos (`reload`, `message`, `lock_screen`)
- Recompensas e ledger de pontos (1 pt / R$ 1, configurável)

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

## Docker no PC controle

```bash
cp .env.example .env
docker compose up -d --build
```

Acesse `http://IP-DO-PC-CONTROLE:8787`

## Ligar uma estação na loja

1. No admin, crie a estação **ou** na própria estação use o claim com o segredo (`STATION_SHARED_SECRET`).
2. Abra em kiosk:

```bash
chromium --kiosk "https://IP-DO-PC-CONTROLE/station?name=PC-03"
```

> Webcam exige **HTTPS** (ou localhost). Não use `http://IP:8787` na LAN — o navegador bloqueia a câmera.

## Estrutura

```
loja-geek-fidelidade/
  server/         # Fastify + SQLite + WebSocket
  face-service/   # OpenCV YuNet+SFace (opcional InsightFace)
  web/            # React admin + estação
  data/           # banco SQLite
  docker-compose.yml
```

## Agente Windows (GeekLock)

Pasta pronta para pendrive: `pendrive/GeekLock/`

```bash
# regenerar
bash scripts/pack-pendrive.sh
```

No Windows: edite `config.json` (`serverUrl`) e rode `GeekLock.exe`.
Admin com horas: http://IP:8787/admin → aba **Sessões / Horas**.
