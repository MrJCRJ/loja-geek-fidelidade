# Demo — PC servidor Windows (GeekCentral) + estações Windows (GeekLock)

## Pendrive

Pastas geradas (não vão para o Git; regenere com os scripts):

| Pasta | Uso |
|-------|-----|
| `pendrive/GeekCentral/` | PC **controle** — rode `GeekCentral.exe` |
| `pendrive/GeekLock/` | Cada **estação** — edite `config.json` e rode `GeekLock.exe` |

```bash
bash scripts/pack-pendrive-central.sh
bash scripts/pack-pendrive.sh
```

## No PC controle

1. Copie `GeekCentral` para o disco (ex. `C:\GeekCentral`).
2. Execute `GeekCentral.exe` → espere **Online**.
3. No primeiro boot, defina a senha admin no wizard. Depois use **Abrir admin**.
4. Cadastre VIP + enroll facial.

## Nas estações

1. Em `GeekLock/config.json`: `"serverUrl": "http://IP-DO-CONTROLE:8787"`.
2. `stationName` único por máquina.
3. Execute `GeekLock.exe` e permita a webcam.

## Alternativa Linux/Docker (dev)

```bash
docker compose up -d --build
```

URLs HTTPS: use o IP atual da máquina (`hostname -I`) e aceite o certificado autoassinado.

## Admin remoto (fase 2)

Ainda não implementado. Ver README → seção **Admin de qualquer lugar (fase 2)**.
