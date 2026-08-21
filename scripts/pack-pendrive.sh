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
GeekLock — trava VIP (pendrive)

1) PC controle: API na porta 8787 (docker compose up -d).
2) Edite config.json:
   - serverUrl: http://IP-DO-PC-CONTROLE:8787
   - stationName: PC-01 (único por máquina)
   - sharedSecret: loja-geek-station-secret
   - staffPin: PIN de emergência
   - absentSecondsToLock: 60
3) No Windows, execute GeekLock.exe (mantenha config.json na mesma pasta).
4) Permita a webcam. Sem conexão com o servidor = tela travada.
5) Cadastre VIP + fotos: http://IP:8787/admin

Fluxo: reconhece VIP -> libera PC -> conta horas -> sem rosto ~60s -> trava de novo.

Limitação modo A: Ctrl+Alt+Del ainda existe no Windows (modo B depois).
EOF

echo "OK: $OUT"
du -sh "$OUT"
ls -lah "$OUT/GeekLock.exe" "$OUT/config.json" "$OUT/LEIA-ME.txt"
