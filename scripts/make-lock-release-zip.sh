#!/usr/bin/env bash
# Empacota pendrive/GeekLock em ZIP para GitHub Release (sem config.json com token).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/pendrive/GeekLock"
DIST="$ROOT/dist-release"
VERSION="${1:-}"

if [[ -z "$VERSION" ]]; then
  VERSION="$(node -p "require('$ROOT/agent-windows/package.json').version")"
fi

if [[ ! -f "$OUT/GeekLock.exe" ]]; then
  echo "Falta $OUT/GeekLock.exe — rode: bash scripts/pack-pendrive.sh"
  exit 1
fi

mkdir -p "$DIST"
STAGE="$DIST/GeekLock-staging"
rm -rf "$STAGE"
mkdir -p "$STAGE"
rsync -a --exclude 'config.json' --exclude '*.log' "$OUT/" "$STAGE/"
echo "$VERSION" > "$STAGE/VERSION.txt"
printf '%s\n' "{\"name\":\"GeekLock\",\"version\":\"$VERSION\"}" > "$STAGE/version.json"

ZIP="$DIST/GeekLock-win-x64.zip"
rm -rf "$DIST/GeekLock"
mv "$STAGE" "$DIST/GeekLock"
rm -f "$ZIP"
(cd "$DIST" && zip -r -q "GeekLock-win-x64.zip" "GeekLock")

echo "OK: $ZIP"
ls -lh "$ZIP"
echo "VERSION=$VERSION"
