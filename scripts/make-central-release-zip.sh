#!/usr/bin/env bash
# Empacota pendrive/GeekCentral em ZIP para GitHub Release (sem pasta data com banco).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/pendrive/GeekCentral"
DIST="$ROOT/dist-release"
VERSION="${1:-}"

if [[ -z "$VERSION" ]]; then
  VERSION="$(node -p "require('$ROOT/agent-central-windows/package.json').version")"
fi

if [[ ! -f "$OUT/GeekCentral.exe" ]]; then
  echo "Falta $OUT/GeekCentral.exe — rode: bash scripts/pack-pendrive-central.sh"
  exit 1
fi

mkdir -p "$DIST"
STAGE="$DIST/GeekCentral-staging"
rm -rf "$STAGE"
mkdir -p "$STAGE"
# Copia tudo exceto data (banco/config da loja)
rsync -a --exclude 'data/' --exclude '*.log' "$OUT/" "$STAGE/"
mkdir -p "$STAGE/data"
# data vazio só com example se existir
if [[ -f "$OUT/config.example.json" ]]; then
  cp -f "$OUT/config.example.json" "$STAGE/data/config.example.json"
fi
echo "$VERSION" > "$STAGE/VERSION.txt"
printf '%s\n' "{\"name\":\"GeekCentral\",\"version\":\"$VERSION\"}" > "$STAGE/version.json"

ZIP="$DIST/GeekCentral-win-x64.zip"
rm -f "$ZIP"
(cd "$DIST" && zip -r -q "GeekCentral-win-x64.zip" "GeekCentral-staging")
# renomear conteúdo interno para GeekCentral/
rm -rf "$DIST/GeekCentral"
mv "$STAGE" "$DIST/GeekCentral"
rm -f "$ZIP"
(cd "$DIST" && zip -r -q "GeekCentral-win-x64.zip" "GeekCentral")

echo "OK: $ZIP"
ls -lh "$ZIP"
echo "VERSION=$VERSION"
