#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AGENT="$ROOT/agent-windows"
OUT="$ROOT/pendrive/GeekLock"

cd "$AGENT"
npm install
npm run build:web

# Gera win-unpacked em release-user/ (release/ às vezes fica root-owned e quebra o build).
npx electron-builder --win dir --x64 -c.directories.output=release-user
OUT_DIR="$AGENT/release-user/win-unpacked"
test -f "$OUT_DIR/GeekLock.exe" || { echo "ERRO: GeekLock.exe nao gerado"; exit 1; }

rm -rf "$OUT"
mkdir -p "$OUT"
cp -a "$OUT_DIR/." "$OUT/"
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
cp -f "$INSTALLER/GeekLock-harden.ps1" "$OUT/GeekLock-harden.ps1"
cp -f "$INSTALLER/GeekLock-apply.cmd" "$OUT/GeekLock-apply.cmd"
cp -f "$INSTALLER/LEIA-ME.txt" "$OUT/LEIA-ME.txt"
VERSION="$(node -p "require('$AGENT/package.json').version")"
echo "$VERSION" > "$OUT/VERSION.txt"
printf '%s\n' "{\"name\":\"GeekLock\",\"version\":\"$VERSION\"}" > "$OUT/version.json"
# Atalho na raiz do pack (pendrive/INSTALAR-GEEKLOCK.bat) — dois cliques na raiz do USB
mkdir -p "$ROOT/pendrive"
cp -f "$INSTALLER/INSTALAR-GEEKLOCK.bat" "$ROOT/pendrive/INSTALAR-GEEKLOCK.bat"
cp -f "$INSTALLER/INSTALAR-GEEKLOCK.ps1" "$ROOT/pendrive/INSTALAR-GEEKLOCK.ps1"
cp -f "$INSTALLER/LEIA-ME.txt" "$ROOT/pendrive/LEIA-ME.txt"
# Remover restos que nao fazem parte do instalador (zip, LEIA antigo)
rm -f "$ROOT/pendrive/GeekLock-win-x64.zip" \
  "$ROOT/pendrive/LEIA-ME-GEEKLOCK.txt" \
  "$ROOT/pendrive/GeekLock-autostart.vbs" \
  "$ROOT/pendrive/GeekLock-harden.ps1"

echo "OK: $OUT (GeekLock $VERSION)"
du -sh "$OUT"
ls -lah "$OUT/GeekLock.exe" "$OUT/INSTALAR-GEEKLOCK.bat" "$OUT/LEIA-ME.txt"
