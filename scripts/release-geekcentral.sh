#!/usr/bin/env bash
# Build completo + ZIP + (opcional) upload: gh release create
# Uso:
#   bash scripts/release-geekcentral.sh 1.1.0
#   UPLOAD=1 bash scripts/release-geekcentral.sh 1.1.0
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${1:?versão ex.: 1.1.0}"

# alinha package.json
node -e "
const fs=require('fs');
const p='$ROOT/agent-central-windows/package.json';
const j=JSON.parse(fs.readFileSync(p,'utf8'));
j.version='$VERSION';
fs.writeFileSync(p, JSON.stringify(j,null,2)+'\n');
"

export SKIP_PREPARE="${SKIP_PREPARE:-0}"
bash "$ROOT/scripts/pack-pendrive-central.sh"
bash "$ROOT/scripts/make-central-release-zip.sh" "$VERSION"

ZIP="$ROOT/dist-release/GeekCentral-win-x64.zip"
TAG="central-v${VERSION}"

if [[ "${UPLOAD:-0}" == "1" ]]; then
  command -v gh >/dev/null || { echo "Instale gh (GitHub CLI)"; exit 1; }
  NOTES="GeekCentral Windows ${VERSION}

- Pacote completo (exe + runtime)
- Na loja: botão Atualizar no GeekCentral (mantém data\\\\)
- Asset: GeekCentral-win-x64.zip
"
  if gh release view "$TAG" >/dev/null 2>&1; then
    gh release upload "$TAG" "$ZIP" --clobber
  else
    gh release create "$TAG" "$ZIP" --title "GeekCentral ${VERSION}" --notes "$NOTES"
  fi
  echo "Release $TAG publicado."
else
  echo "ZIP pronto. Para publicar: UPLOAD=1 bash scripts/release-geekcentral.sh $VERSION"
fi
