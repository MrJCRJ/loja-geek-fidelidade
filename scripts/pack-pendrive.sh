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
# Sem config.json no pendrive: evita vazar token. O INSTALAR apaga C:\GeekLock e re-pareia.
rm -f "$OUT/config.json"

INSTALLER="$ROOT/scripts/pendrive-geeklock"
cp -f "$INSTALLER/INSTALAR-GEEKLOCK.bat" "$OUT/INSTALAR-GEEKLOCK.bat"
cp -f "$INSTALLER/INSTALAR-GEEKLOCK.ps1" "$OUT/INSTALAR-GEEKLOCK.ps1"
cp -f "$INSTALLER/GeekLock-autostart.vbs" "$OUT/GeekLock-autostart.vbs"
cp -f "$INSTALLER/LEIA-ME.txt" "$OUT/LEIA-ME.txt"
# Atalho na raiz do pack (pendrive/INSTALAR-GEEKLOCK.bat) — dois cliques na raiz do USB
mkdir -p "$ROOT/pendrive"
cp -f "$INSTALLER/INSTALAR-GEEKLOCK.bat" "$ROOT/pendrive/INSTALAR-GEEKLOCK.bat"

echo "OK: $OUT"
du -sh "$OUT"
ls -lah "$OUT/GeekLock.exe" "$OUT/INSTALAR-GEEKLOCK.bat" "$OUT/LEIA-ME.txt"
