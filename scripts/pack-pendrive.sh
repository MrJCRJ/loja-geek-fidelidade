#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AGENT="$ROOT/agent-windows"
OUT="$ROOT/pendrive/GeekLock"

cd "$AGENT"
npm install
npm run build:web

# Gera win-unpacked (mais confiável no pendrive do que o .exe portable único)
npx electron-builder --win dir --x64

rm -rf "$OUT"
mkdir -p "$OUT"
cp -a "$AGENT/release/win-unpacked/." "$OUT/"
cp -f "$AGENT/config.example.json" "$OUT/config.example.json"
cp -f "$AGENT/config.example.json" "$OUT/config.json"

cat > "$OUT/LEIA-ME.txt" << 'EOF'
GeekLock — trava VIP (estação / pendrive)

Pré-requisito: PC CONTROLE com GeekCentral.exe online (ou Docker na LAN).

1) Edite config.json nesta pasta:
   - serverUrl: http://IP-DO-PC-CONTROLE:8787
   - stationName: PC-01 (único por máquina)
   - sharedSecret: loja-geek-station-secret
   - staffPin: PIN de emergência
   - absentSecondsToLock: 60
2) No Windows da estação, execute GeekLock.exe (config.json na mesma pasta).
3) Permita a webcam. Sem conexão com o servidor = tela travada.
4) Cadastre VIP + fotos no admin do GeekCentral.

Fluxo: reconhece VIP -> libera PC -> conta horas -> sem rosto ~60s -> trava de novo.

Limitação modo A: Ctrl+Alt+Del ainda existe no Windows (modo B depois).
EOF

echo "OK: $OUT"
du -sh "$OUT"
ls -lah "$OUT/GeekLock.exe" "$OUT/config.json" "$OUT/LEIA-ME.txt"
