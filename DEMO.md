# Demo para o cliente — PC servidor (Linux/Docker) + estações Windows

## Status nesta máquina

Stack em Docker (api + face-service + nginx HTTPS):

```bash
cd /home/treegunn/loja-geek-fidelidade
docker compose ps
docker compose up -d   # se precisar subir de novo
```

IP da LAN: **192.168.18.78**

## URLs do teste

| Uso | URL |
|-----|-----|
| Home | https://192.168.18.78/ |
| Admin (PC controle) | https://192.168.18.78/admin |
| Estação / webcam | https://192.168.18.78/station?name=PC-01 |

Senha admin: `admin123`

No primeiro acesso HTTPS o navegador avisa certificado autoassinado → **Avançado → Continuar / Aceitar o risco**.

> Use sempre **https://** nas estações Windows — a webcam só libera em contexto seguro.

## Nos PCs Windows

1. Mesma rede Wi‑Fi/cabo do servidor.
2. Chrome ou Edge: `https://192.168.18.78/station?name=NOME-DO-PC`
3. Aceitar certificado + permitir câmera.
4. Ativar estação (claim automático ou token do admin).

Atalho kiosk:

```text
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --ignore-certificate-errors https://192.168.18.78/station?name=PC-01
```

(`--ignore-certificate-errors` só para demo; em produção use certificado válido.)

## Roteiro da demonstração

1. Admin → cadastrar VIP + consentimento LGPD  
2. Admin → ligar webcam → 3–5 amostras faciais  
3. Estação → reconhecer VIP → somar pontos → resgatar  
4. Admin → feed ao vivo + Lock/Msg nas estações  
