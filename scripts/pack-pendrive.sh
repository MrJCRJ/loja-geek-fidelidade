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
# Failsafe: require('../../shared/...') resolve para resources/shared fora do asar
mkdir -p "$OUT/resources/shared"
cp -a "$ROOT/shared/." "$OUT/resources/shared/"
cp -f "$AGENT/config.example.json" "$OUT/config.example.json"
cp -f "$AGENT/config.example.json" "$OUT/config.json"

cat > "$OUT/LEIA-ME.txt" << 'EOF'
GeekLock — trava VIP (estação / pendrive)

Pré-requisito: PC CONTROLE com GeekCentral.exe online (ou Docker na LAN).

1ª vez (assistente na tela)
1) Copie a pasta GeekLock do pendrive para o disco (ex.: C:\GeekLock).
2) Execute GeekLock.exe — aparece o assistente.
3) Escolha o GeekCentral encontrado na LAN (ou digite a URL).
4) Informe o nome da estação (ex.: PC-01) e o código de 6 dígitos
   mostrado na tela do GeekCentral (não digite o segredo longo).
5) Permita a webcam. Sem conexão = tela travada.

Config manual (opcional): edite config.json (serverUrl, stationName, sharedSecret, staffPin).

Fluxo: reconhece VIP -> libera PC -> conta horas -> sem rosto ~60s -> trava de novo.

Limitação modo A: Ctrl+Alt+Del ainda existe no Windows (modo B depois).
EOF

echo "OK: $OUT"
du -sh "$OUT"
ls -lah "$OUT/GeekLock.exe" "$OUT/config.json" "$OUT/LEIA-ME.txt"
