# Modos de estação — o que a loja usa

## GeekLock (recomendado na loja)

- App Electron em cada PC de jogo
- Reconhece VIP → **libera a máquina e consome horas**
- Recebe comandos do admin via WebSocket (`lock`, `reload`, `message`, …)
- Não precisa de HTTPS no browser

Pasta: `agent-windows/` · Pack: `bash scripts/pack-pendrive.sh`

## Estação browser (`/station`)

- Kiosk no Chromium (opcional)
- Reconhece VIP → **pontos / resgate de recompensas**
- Exige **HTTPS** para webcam (nginx com profile `https`)
- Útil para balcão / cadastro sem travar o OS

## Qual usar?

| Objetivo | Use |
|----------|-----|
| Controle de tempo nas máquinas | **GeekLock** |
| Fidelidade em pontos no balcão | **Station browser** |
| Os dois | OK — são complementares, não conflitam |

Compose sem HTTPS (só API HTTP):

```bash
npm run compose:up
# ou: docker compose up -d
```

Com HTTPS (estação browser / webcam na LAN):

```bash
npm run compose:https
# ou: docker compose --profile https up -d
```
